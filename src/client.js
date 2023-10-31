// @ts-check

import { CID } from 'multiformats'

import { extractVerifiedContent } from './utils/car.js'
import { asAsyncIterable, asyncIteratorToBuffer } from './utils/itr.js'
import { randomUUID } from './utils/uuid.js'
import { memoryStorage } from './storage/index.js'
import { getJWT } from './utils/jwt.js'
import { parseUrl, addHttpPrefix } from './utils/url.js'
import { isBrowserContext } from './utils/runtime.js'
import { isErrorUnavoidable } from './utils/errors.js'

const MAX_NODE_WEIGHT = 100
/**
 * @typedef {import('./types.js').Node} Node
 */

export class Saturn {
  static nodesListKey = 'saturn-nodes'
  static defaultRaceCount = 3
  /**
   *
   * @param {object} [opts={}]
   * @param {string} [opts.clientKey]
   * @param {string} [opts.clientId=randomUUID()]
   * @param {string} [opts.cdnURL=saturn.ms]
   * @param {number} [opts.connectTimeout=5000]
   * @param {number} [opts.downloadTimeout=0]
   * @param {string} [opts.orchURL]
   * @param {number} [opts.fallbackLimit]
   * @param {boolean} [opts.experimental]
   * @param {import('./storage/index.js').Storage} [opts.storage]
   */
  constructor (opts = {}) {
    this.opts = Object.assign({}, {
      clientId: randomUUID(),
      cdnURL: 'l1s.saturn.ms',
      logURL: 'https://twb3qukm2i654i3tnvx36char40aymqq.lambda-url.us-west-2.on.aws/',
      orchURL: 'https://orchestrator.strn.pl/nodes?maxNodes=100',
      authURL: 'https://fz3dyeyxmebszwhuiky7vggmsu0rlkoy.lambda-url.us-west-2.on.aws/',
      fallbackLimit: 5,
      connectTimeout: 5_000,
      downloadTimeout: 0
    }, opts)

    if (!this.opts.clientKey) {
      throw new Error('clientKey is required')
    }

    this.logs = []
    this.nodes = []
    this.reportingLogs = process?.env?.NODE_ENV !== 'development'
    this.hasPerformanceAPI = isBrowserContext && self?.performance
    if (this.reportingLogs && this.hasPerformanceAPI) {
      this._monitorPerformanceBuffer()
    }
    this.storage = this.opts.storage || memoryStorage()
    this.loadNodesPromise = this.opts.experimental ? this._loadNodes(this.opts) : null
  }

  /**
   *
   * @param {string} cidPath
   * @param {object} [opts={}]
   * @param {Node[]} [opts.nodes]
   * @param {Node} [opts.node]
   * @param {('car'|'raw')} [opts.format]
   * @param {number} [opts.connectTimeout=5000]
   * @param {number} [opts.downloadTimeout=0]
   * @returns {Promise<object>}
   */
  async fetchCIDWithRace (cidPath, opts = {}) {
    const [cid] = (cidPath ?? '').split('/')
    CID.parse(cid)

    const jwt = await getJWT(this.opts, this.storage)

    const options = Object.assign({}, this.opts, { format: 'car', jwt }, opts)

    if (!isBrowserContext) {
      options.headers = {
        ...(options.headers || {}),
        Authorization: 'Bearer ' + options.jwt
      }
    }

    let nodes = options.nodes
    if (!nodes || nodes.length === 0) {
      const replacementNode = options.node ?? { url: this.opts.cdnURL }
      nodes = [replacementNode]
    }
    const controllers = []

    const createFetchPromise = async (node) => {
      const fetchOptions = { ...options, url: node.url }
      const url = this.createRequestURL(cidPath, fetchOptions)
      const controller = new AbortController()
      controllers.push(controller)
      const connectTimeout = setTimeout(() => {
        controller.abort()
      }, options.connectTimeout)

      try {
        res = await fetch(parseUrl(url), { signal: controller.signal, ...options })
        clearTimeout(connectTimeout)
        return { res, url, node, controller }
      } catch (err) {
        err.node = node
        throw err
      }
    }

    const abortRemainingFetches = async (successController, controllers) => {
      return controllers.forEach((controller) => {
        if (successController !== controller) {
          controller.abort('Request race unsuccessful')
        }
      })
    }

    const fetchPromises = Promise.any(nodes.map((node) => createFetchPromise(node)))

    let log = {
      startTime: new Date()
    }

    let res, url, controller, node
    try {
      ({ res, url, controller, node } = await fetchPromises)

      abortRemainingFetches(controller, controllers)
      log.nodeId = node.id
      log = Object.assign(log, this._generateLog(res, log), { url })
      if (!res.ok) {
        const error = new Error(
          `Non OK response received: ${res.status} ${res.statusText}`
        )
        error.res = res
        throw error
      }
    } catch (err) {
      if (!res) {
        log.error = err.message
      }
      if (err.node) log.nodeId = err.node.id

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
   * @param {Node} [opts.node]
   * @param {number} [opts.connectTimeout=5000]
   * @param {number} [opts.downloadTimeout=0]
   * @returns {Promise<object>}
   */
  async fetchCID (cidPath, opts = {}) {
    const [cid] = (cidPath ?? '').split('/')
    CID.parse(cid)

    const jwt = await getJWT(this.opts, this.storage)

    const options = Object.assign({}, this.opts, { format: 'car', jwt }, opts)
    const node = options.node
    const origin = node?.url ?? this.opts.cdnURL
    const url = this.createRequestURL(cidPath, { ...options, url: origin })

    let log = {
      url,
      startTime: new Date()
    }
    if (node?.id) log.nodeId = node.id

    const controller = options.controller ?? new AbortController()
    const connectTimeout = setTimeout(() => {
      controller.abort()
    }, options.connectTimeout)

    if (!isBrowserContext) {
      options.headers = {
        ...(options.headers || {}),
        Authorization: 'Bearer ' + options.jwt
      }
    }
    let res
    try {
      res = await fetch(parseUrl(url), { signal: controller.signal, ...options })

      clearTimeout(connectTimeout)

      log = Object.assign(log, this._generateLog(res, log))
      if (!res.ok) {
        const error = new Error(
          `Non OK response received: ${res.status} ${res.statusText}`
        )
        error.res = res
        throw error
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
   * @param {Response} res
   * @param {object} log
   * @returns {object}
   */
  _generateLog (res, log) {
    const { headers } = res
    log.httpStatusCode = res.status
    log.cacheHit = headers.get('saturn-cache-status') === 'HIT'
    log.nodeId = log.nodeId ?? headers.get('saturn-node-id')
    log.requestId = headers.get('saturn-transfer-id')
    log.httpProtocol = headers.get('quic-status')

    if (res.ok) {
      log.ttfbMs = new Date() - log.startTime
    }

    return log
  }

  /**
   *
   * @param {string} cidPath
   * @param {object} [opts={}]
   * @param {('car'|'raw')} [opts.format]
   * @param {boolean} [opts.raceNodes]
   * @param {string} [opts.url]
   * @param {number} [opts.connectTimeout=5000]
   * @param {number} [opts.downloadTimeout=0]
   * @returns {Promise<AsyncIterable<Uint8Array>>}
   */
  async * fetchContentWithFallback (cidPath, opts = {}) {
    let lastError = null
    // we use this to checkpoint at which chunk a request failed.
    // this is temporary until range requests are supported.
    let byteCountCheckpoint = 0

    const throwError = () => {
      throw new Error(`All attempts to fetch content have failed. Last error: ${lastError.message}`)
    }

    const fetchContent = async function * () {
      let byteCount = 0
      const byteChunks = await this.fetchContent(cidPath, opts)
      for await (const chunk of byteChunks) {
        // avoid sending duplicate chunks
        if (byteCount < byteCountCheckpoint) {
          // checks for overlapping chunks
          const remainingBytes = byteCountCheckpoint - byteCount
          if (remainingBytes < chunk.length) {
            yield chunk.slice(remainingBytes)
            byteCountCheckpoint += chunk.length - remainingBytes
          }
        } else {
          yield chunk
          byteCountCheckpoint += chunk.length
        }
        byteCount += chunk.length
      }
    }.bind(this)

    if (this.nodes.length === 0) {
      // fetch from origin in the case that no nodes are loaded
      opts.url = this.opts.cdnURL
      try {
        yield * fetchContent()
        return
      } catch (err) {
        lastError = err
        if (err.res?.status === 410 || isErrorUnavoidable(err)) {
          throwError()
        }
        await this.loadNodesPromise
      }
    }

    let fallbackCount = 0
    const nodes = this.nodes
    for (let i = 0; i < nodes.length; i++) {
      if (fallbackCount > this.opts.fallbackLimit) {
        return
      }
      if (opts.raceNodes) {
        opts.nodes = nodes.slice(i, i + Saturn.defaultRaceCount)
      } else {
        opts.node = nodes[i]
      }

      try {
        yield * fetchContent()
        return
      } catch (err) {
        lastError = err
        if (err.res?.status === 410 || isErrorUnavoidable(err)) {
          break
        }
      }
      fallbackCount += 1
    }

    if (lastError) {
      throwError()
    }
  }

  /**
   *
   * @param {string} cidPath
   * @param {object} [opts={}]
   * @param {('car'|'raw')} [opts.format]
   * @param {boolean} [opts.raceNodes]
   * @param {number} [opts.connectTimeout=5000]
   * @param {number} [opts.downloadTimeout=0]
   * @returns {Promise<AsyncIterable<Uint8Array>>}
   */
  async * fetchContent (cidPath, opts = {}) {
    let res, controller, log

    if (opts.raceNodes) {
      ({ res, controller, log } = await this.fetchCIDWithRace(cidPath, opts))
    } else {
      ({ res, controller, log } = await this.fetchCID(cidPath, opts))
    }

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
   * @param {boolean} [opts.raceNodes]
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
   * @param {string} [opts.url]
   * @returns {URL}
   */
  createRequestURL (cidPath, opts) {
    let origin = opts.url ?? this.opts.cdnURL
    origin = addHttpPrefix(origin)
    const url = new URL(`${origin}/ipfs/${cidPath}`)

    url.searchParams.set('format', opts.format)
    if (opts.format === 'car') {
      url.searchParams.set('dag-scope', 'entity')
    }

    if (isBrowserContext) {
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
    this.logs.push(log)
    if (!this.reportingLogs) return
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

  /**
   * Sorts nodes based on normalized distance and weights. Distance is prioritized for sorting.
   *
   * @param {Node[]} nodes
   * @returns {Node[]}
   */
  _sortNodes (nodes) {
    // Determine the maximum distance for normalization
    const maxDistance = Math.max(...nodes.map(node => node.distance))

    // These weights determine how important each factor is in determining
    const distanceImportanceFactor = 0.8
    const weightImportanceFactor = 1 - distanceImportanceFactor

    return nodes.slice().sort((a, b) => {
      const normalizedDistanceA = a.distance / maxDistance
      const normalizedDistanceB = b.distance / maxDistance
      const normalizedWeightA = a.weight / MAX_NODE_WEIGHT
      const normalizedWeightB = b.weight / MAX_NODE_WEIGHT

      const metricA =
        distanceImportanceFactor * normalizedDistanceA - weightImportanceFactor * normalizedWeightA
      const metricB =
        distanceImportanceFactor * normalizedDistanceB - weightImportanceFactor * normalizedWeightB

      return metricA - metricB
    })
  }

  async _loadNodes (opts) {
    let origin = opts.orchURL

    let cacheNodesListPromise
    if (this.storage) {
      cacheNodesListPromise = this.storage.get(Saturn.nodesListKey)
    }

    origin = addHttpPrefix(origin)

    const url = new URL(origin)
    const controller = new AbortController()
    const options = Object.assign({}, { method: 'GET' }, this.opts)

    const connectTimeout = setTimeout(() => {
      controller.abort()
    }, options.connectTimeout)

    const orchResponse = await fetch(parseUrl(url), { signal: controller.signal, ...options })
    const orchNodesListPromise = orchResponse.json()
    clearTimeout(connectTimeout)

    // This promise races fetching nodes list from the orchestrator and
    // and the provided storage object (localStorage, sessionStorage, etc.)
    // to insure we have a fallback set as quick as possible
    let nodes
    if (cacheNodesListPromise) {
      nodes = await Promise.any([orchNodesListPromise, cacheNodesListPromise])
    } else {
      nodes = await orchNodesListPromise
    }

    // if storage returns first, update based on cached storage.
    if (nodes === await cacheNodesListPromise) {
      this.nodes = nodes
    }
    // we always want to update from the orchestrator regardless.
    nodes = await orchNodesListPromise
    nodes = this._sortNodes(nodes)
    this.nodes = nodes
    this.storage.set(Saturn.nodesListKey, nodes)
  }
}
