import { CID } from 'multiformats'

import { validateBody } from './utils/car.js'
import { setTimeoutPromise } from './utils/timers.js'
import { randomUUID } from './utils/uuid.js'
import { createBandwidthLog } from './utils/logging.js'

class Saturn {
  /**
   *
   * @param {object} [opts={}]
   * @param {string} [opts.clientId=randomUUID()]
   * @param {string} [opts.cdnURL=saturn.ms]
   * @param {number} [opts.connectTimeout=5000]
   * @param {number} [opts.downloadTimeout=0]
   */
  constructor (opts = {}) {
    this.opts = Object.assign({}, {
      clientId: randomUUID(),
      cdnURL: 'saturn.ms',
      connectTimeout: 5_000,
      downloadTimeout: 0
    }, opts)

    this.reportingLogs = process?.env?.NODE_ENV !== 'development'
    this.logs = []
  }

  /**
   *
   * @param {string} cidPath
   * @param {object} [opts={}]
   * @param {('car'|'raw')} [opts.format]
   * @param {number} [opts.connectTimeout=5000]
   * @param {number} [opts.downloadTimeout=0]
   * @returns {Promise<Response>}
   */
  async fetchCID (cidPath, opts = {}) {
    const [cid] = cidPath.split('/')
    CID.parse(cid)

    const options = Object.assign({}, this.opts, { format: 'car' }, opts)
    const url = this.createRequestURL(cidPath, options)

    const log = {
      cid,
      url,
      httpStatusCode: null,
      httpProtocol: null,
      nodeId: null,
      cacheStatus: null,
      ttfb: null,
      ttfbAfterDnsMs: null,
      dnsTimeMs: null,
      startTime: new Date(),
      endTime: null,
      transferSize: null,
      ifError: null,
    }

    const controller = new AbortController()
    const connectTimeout = setTimeout(() => {
      controller.abort()
    }, options.connectTimeout)

    let res
    try {
      res = await fetch(url, { signal: controller.signal })

      clearTimeout(connectTimeout)

      const { headers } = res
      log.ttfb = new Date()
      log.httpStatusCode = res.status
      log.cacheStatus = headers.get('saturn-cache-status')
      log.nodeId = headers.get('saturn-node-id') ?? headers.get('x-ipfs-pop')
      log.transferId = headers.get('saturn-transfer-id')
      log.httpProtocol = headers.get('quic-status')

      if (!res.ok) {
        throw new Error(`Non OK response received: ${res.status} ${res.statusText}`)
      }

      const validationResult = await (options.downloadTimeout
        ? Promise.race([validateBody(res.body), setTimeoutPromise(options.downloadTimeout, false, { ref: false })])
        : validateBody(res.body))

      if (!validationResult) {
        controller.abort()
        throw new Error('Couldn\'t download and validate test CID in time')
      }
    } catch (err) {
      log.ifError = err.message
      throw err
    } finally {
      log.endTime = new Date()

      if (typeof window !== 'undefined' && window?.performance) {
        const entry = performance.getEntriesByType('resource')
          .find(r => r.name === url.href)
        if (entry) {
          const dnsStart = entry.domainLookupStart
          const dnsEnd = entry.domainLookupEnd
          const hasData = dnsEnd > 0 && dnsStart > 0
          if (hasData) {
            log.dnsTimeMs = Math.round(dnsEnd - dnsStart)
            log.ttfbAfterDnsMs = Math.round(entry.responseStart - entry.requestStart)
          }

          if (log.httpProtocol === null && entry.nextHopProtocol) {
            log.httpProtocol = entry.nextHopProtocol
          }
          // else response didn't have Timing-Allow-Origin: *
          //
          // if both dnsStart and dnsEnd are > 0 but have the same value,
          // its a dns cache hit.
        }
      }

      if (this.reportingLogs) {
        this.logs.push(log)
        this.reportLogs()
      }
    }

    return res
  }

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

    return url
  }

  reportLogs () {
    this.reportLogsTimeout && clearTimeout(this.reportLogsTimeout)
    this.reportLogsTimeout = setTimeout(this._reportLogs.bind(this), 10_000)
  }

  async _reportLogs () {
    if (this.logs.length) {
      await fetch('https://twb3qukm2i654i3tnvx36char40aymqq.lambda-url.us-west-2.on.aws/', {
        method: 'POST',
        body: JSON.stringify({ bandwidthLogs: this.logs.map(createBandwidthLog) }),
      })
      this.logs = []
    }
  }
}

export default Saturn
