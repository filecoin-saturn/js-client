import { CID } from 'multiformats'

import { extractVerifiedContent } from './utils/car.js'
import { asAsyncIterable, asyncIteratorToBuffer } from './utils/itr.js'
import { randomUUID } from './utils/uuid.js'
import { memoryStorage } from './storage/index.js'
import { getJWT } from './utils/jwt.js'

export class Saturn {
  /**
   *
   * @param {object} [opts={}]
   * @param {string} [opts.clientKey]
   * @param {string} [opts.clientId=randomUUID()]
   * @param {string} [opts.cdnURL=saturn.ms]
   * @param {number} [opts.connectTimeout=5000]
   * @param {number} [opts.downloadTimeout=0]
   * @param {import('./storage/index.js').Storage} [opts.storage]
   */
  constructor (opts = {}) {
    this.opts = Object.assign({}, {
      clientId: randomUUID(),
      cdnURL: 'saturn.ms',
      logURL: 'https://twb3qukm2i654i3tnvx36char40aymqq.lambda-url.us-west-2.on.aws/',
      authURL: 'https://fz3dyeyxmebszwhuiky7vggmsu0rlkoy.lambda-url.us-west-2.on.aws/',
      connectTimeout: 5_000,
      downloadTimeout: 0
    }, opts)

    if (!this.opts.clientKey) {
      throw new Error('clientKey is required')
    }

    this.logs = []
    this.storage = this.opts.storage || memoryStorage()
    this.reportingLogs = process?.env?.NODE_ENV !== 'development'
    this.hasPerformanceAPI = typeof window !== 'undefined' && window?.performance
    this.isBrowser = typeof window !== 'undefined'
    if (this.reportingLogs && this.hasPerformanceAPI) {
      this._monitorPerformanceBuffer()
    }
  }

  /**
   *
   * @param {string} cidPath
   * @param {object} [opts={}]
   * @param {('car'|'raw')} [opts.format]
   * @param {number} [opts.connectTimeout=5000]
   * @param {number} [opts.downloadTimeout=0]
   * @returns {Promise<object>}
   */
  async fetchCID (cidPath, opts = {}) {
    const [cid] = (cidPath ?? '').split('/')
    CID.parse(cid)

    const jwt = await getJWT(this.opts, this.storage)

    const options = Object.assign({}, this.opts, { format: 'car', jwt }, opts)
    const url = this.createRequestURL(cidPath, options)

    const log = {
      url,
      startTime: new Date()
    }

    const controller = options.controller ?? new AbortController()
    const connectTimeout = setTimeout(() => {
      controller.abort()
    }, options.connectTimeout)

    if (!this.isBrowser) {
      options.headers = {
        ...(options.headers || {}),
        Authorization: 'Bearer ' + options.jwt
      }
    }

    let res
    try {
      res = await fetch(url, { signal: controller.signal, ...options })

      clearTimeout(connectTimeout)

      const { headers } = res
      log.ttfbMs = new Date() - log.startTime
      log.httpStatusCode = res.status
      log.cacheHit = headers.get('saturn-cache-status') === 'HIT'
      log.nodeId = headers.get('saturn-node-id')
      log.requestId = headers.get('saturn-transfer-id')
      log.httpProtocol = headers.get('quic-status')

      if (!res.ok) {
        throw new Error(
          `Non OK response received: ${res.status} ${res.statusText}`
        )
      }
    } catch (err) {
      if (!res) {
        log.error = err.message
      }
      // Report now if error, otherwise report after download is done.
      this._finalizeLog(log)

      throw err
    }

    return { res, controller, log }
  }

  /**
   *
   * @param {string} cidPath
   * @param {object} [opts={}]
   * @param {('car'|'raw')} [opts.format]
   * @param {number} [opts.connectTimeout=5000]
   * @param {number} [opts.downloadTimeout=0]
   * @returns {Promise<AsyncIterable<Uint8Array>>}
   */
  async * fetchContent (cidPath, opts = {}) {
    const { res, controller, log } = await this.fetchCID(cidPath, opts)

    async function * metricsIterable (itr) {
      log.numBytesSent = 0

      for await (const chunk of itr) {
        log.numBytesSent += chunk.length
        yield chunk
      }
    }

    try {
      const itr = metricsIterable(asAsyncIterable(res.body))
      yield * extractVerifiedContent(cidPath, itr)
    } catch (err) {
      log.error = err.message
      controller.abort()

      throw err
    } finally {
      this._finalizeLog(log)
    }
  }

  /**
   *
   * @param {string} cidPath
   * @param {object} [opts={}]
   * @param {('car'|'raw')} [opts.format]
   * @param {number} [opts.connectTimeout=5000]
   * @param {number} [opts.downloadTimeout=0]
   * @returns {Promise<Uint8Array>}
   */
  async fetchContentBuffer (cidPath, opts = {}) {
    return await asyncIteratorToBuffer(this.fetchContent(cidPath, opts))
  }

  /**
   *
   * @param {string} cidPath
   * @param {object} [opts={}]
   * @returns {URL}
   */
  createRequestURL (cidPath, opts) {
    let origin = opts.cdnURL
    if (!origin.startsWith('http')) {
      origin = `https://${origin}`
    }
    const url = new URL(`${origin}/ipfs/${cidPath}`)

    url.searchParams.set('format', opts.format)
    if (opts.format === 'car') {
      url.searchParams.set('dag-scope', 'entity')
    }

    if (this.isBrowser) {
      url.searchParams.set('jwt', opts.jwt)
    }

    return url
  }

  /**
   *
   * @param {object} log
   */
  _finalizeLog (log) {
    log.requestDurationSec = (new Date() - log.startTime) / 1000
    this.reportLogs(log)
  }

  /**
   *
   * @param {object} log
   */
  reportLogs (log) {
    if (!this.reportingLogs) return

    this.logs.push(log)
    this.reportLogsTimeout && clearTimeout(this.reportLogsTimeout)
    this.reportLogsTimeout = setTimeout(this._reportLogs.bind(this), 3_000)
  }

  async _reportLogs () {
    if (!this.logs.length) {
      return
    }

    const bandwidthLogs = this.hasPerformanceAPI
      ? this._matchLogsWithPerformanceMetrics(this.logs)
      : this.logs

    await fetch(
      this.opts.logURL,
      {
        method: 'POST',
        body: JSON.stringify({ bandwidthLogs, logSender: this.opts.logSender })
      }
    )

    this.logs = []
    this._clearPerformanceBuffer()
  }

  /**
   *
   * @param {Array<object>} logs
   */
  _matchLogsWithPerformanceMetrics (logs) {
    return logs
      .map(log => ({ ...log, ...this._getPerformanceMetricsForLog(log) }))
      .filter(log => !log.isFromBrowserCache)
      .map(log => {
        const { isFromBrowserCache: _, ...cleanLog } = log
        return cleanLog
      })
  }

  /**
   *
   * @param {object} log
   * @returns {object}
   */
  _getPerformanceMetricsForLog (log) {
    const metrics = {}

    // URL is the best differentiator available, though there can be multiple entries per URL.
    // It's a good enough heuristic.
    const entry = performance
      .getEntriesByType('resource')
      .find((r) => r.name === log.url.href)

    if (entry) {
      const dnsStart = entry.domainLookupStart
      const dnsEnd = entry.domainLookupEnd
      const hasDnsMetrics = dnsEnd > 0 && dnsStart > 0

      if (hasDnsMetrics) {
        metrics.dnsTimeMs = Math.round(dnsEnd - dnsStart)
        metrics.ttfbAfterDnsMs = Math.round(
          entry.responseStart - entry.requestStart
        )
      }

      if (entry.nextHopProtocol) {
        metrics.httpProtocol = entry.nextHopProtocol
      }

      metrics.isFromBrowserCache = (
        entry.deliveryType === 'cache' ||
        (log.httpStatusCode && entry.transferSize === 0)
      )
    }

    return metrics
  }

  _monitorPerformanceBuffer () {
    // Using static method prevents multiple unnecessary listeners.
    performance.addEventListener('resourcetimingbufferfull', Saturn._setResourceBufferSize)
  }

  static _setResourceBufferSize () {
    const increment = 250
    const maxSize = 1000
    const size = performance.getEntriesByType('resource').length
    const newSize = Math.min(size + increment, maxSize)

    performance.setResourceTimingBufferSize(newSize)
  }

  _clearPerformanceBuffer () {
    if (this.hasPerformanceAPI) {
      performance.clearResourceTimings()
    }
  }
}
