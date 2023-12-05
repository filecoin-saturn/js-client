// @ts-check

import { CID } from 'multiformats'
import pLimit from 'p-limit'

import { extractVerifiedContent } from './utils/car.js'
import { asAsyncIterable, asyncIteratorToBuffer } from './utils/itr.js'
import { randomUUID } from './utils/uuid.js'
import { memoryStorage } from './storage/index.js'
import { getJWT } from './utils/jwt.js'
import { parseUrl, addHttpPrefix } from './utils/url.js'
import { isBrowserContext } from './utils/runtime.js'
import HashRing from 'hashring'
import { isErrorUnavoidable } from './utils/errors.js'

const MAX_NODE_WEIGHT = 100
/**
 * @typedef {import('./types.js').Node} Node
 * @typedef {import('./types.js').FetchOptions} FetchOptions
 */

export class Saturn {
  static nodesListKey = 'saturn-nodes'
  static defaultRaceCount = 3
  static hashRingCacheSize = 10_000
  /**
   *
   * @param {object} [config={}]
   * @param {string} [config.clientKey]
   * @param {string} [config.clientId=randomUUID()]
   * @param {string} [config.cdnURL=saturn.ms]
   * @param {number} [config.connectTimeout=5000]
   * @param {number} [config.downloadTimeout=0]
   * @param {string} [config.orchURL]
   * @param {string} [config.customerFallbackURL]
   * @param {number} [config.fallbackLimit]
   * @param {boolean} [config.experimental]
   * @param {string}  [config.format]
   * @param {import('./storage/index.js').Storage} [config.storage]
   */
  constructor (config = {}) {
    this.config = Object.assign({}, {
      clientId: randomUUID(),
      cdnURL: 'l1s.saturn.ms',
      logURL: 'https://twb3qukm2i654i3tnvx36char40aymqq.lambda-url.us-west-2.on.aws/',
      orchURL: 'https://orchestrator.strn.pl/nodes?maxNodes=100',
      authURL: 'https://su4hesnyinnwvtk3h2rkauh5ja0qrisq.lambda-url.us-west-2.on.aws/',
      format: 'car',
      fallbackLimit: 5,
      connectTimeout: 5_000,
      hashRingSize: 25,
      downloadTimeout: 0
    }, config)

    this.logs = []
    this.nodes = []
    this.hashring = null
    this.reportingLogs = process?.env?.NODE_ENV !== 'development'
    this.hasPerformanceAPI = isBrowserContext && self?.performance
    if (this.reportingLogs && this.hasPerformanceAPI) {
      this._monitorPerformanceBuffer()
    }
    this.storage = this.config.storage || memoryStorage()
    this.loadNodesPromise = this.config.experimental ? this._loadNodes(this.config) : null
    this.authLimiter = pLimit(1)
  }

  /**
   *
   * @param {string} cidPath
   * @param {FetchOptions} [opts={}]
   * @returns {Promise<object>}
   */
  async fetchCIDWithRace (cidPath, opts = {}) {
    const options = Object.assign({}, this.config, opts)
    if (!opts.originFallback) {
      const [cid] = (cidPath ?? '').split('/')
      CID.parse(cid)

      if (options.clientKey) {
        options.jwt = await this.authLimiter(() => getJWT(options, this.storage))
      }
    }

    options.headers = {
      ...(options.headers || {})
    }

    if (!isBrowserContext && options.jwt) {
      options.headers.Authorization = 'Bearer ' + options.jwt
    }

    let nodes = options.nodes
    if (!nodes || nodes.length === 0) {
      const replacementNode = { url: options.cdnURL }
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
   * @param {FetchOptions} [opts={}]
   * @returns {Promise<object>}
   */
  async fetchCID (cidPath, opts = {}) {
    const options = Object.assign({}, this.config, opts)
    if (!opts.originFallback) {
      const [cid] = (cidPath ?? '').split('/')
      CID.parse(cid)

      if (options.clientKey) {
        options.jwt = await this.authLimiter(() => getJWT(options, this.storage))
      }
    }

    const node = options.nodes && options.nodes[0]
    const origin = node?.url ?? this.config.cdnURL
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

    options.headers = {
      ...(options.headers || {})
    }

    if (!isBrowserContext && options.jwt) {
      options.headers.Authorization = 'Bearer ' + options.jwt
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
   * @param {FetchOptions} [opts={}]
   * @returns {Promise<AsyncIterable<Uint8Array>>}
   */
  async * fetchContentWithFallback (cidPath, opts = {}) {
    const upstreamController = opts.controller
    delete opts.controller

    let lastError = null
    let skipNodes = false
    // we use this to checkpoint at which chunk a request failed.
    // this is temporary until range requests are supported.
    let byteCountCheckpoint = 0

    const throwError = () => {
      throw new Error(`All attempts to fetch content have failed. Last error: ${lastError.message}`)
    }

    const fetchContent = async function * (options) {
      const controller = new AbortController()
      opts.controller = controller
      if (upstreamController) {
        upstreamController.signal.addEventListener('abort', () => {
          controller.abort()
        })
      }
      let byteCount = 0
      const fetchOptions = Object.assign(opts, options)
      const byteChunks = await this.fetchContent(cidPath, fetchOptions)
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

    // Use CDN origin if node list is not loaded
    if (this.nodes.length === 0) {
      // fetch from origin in the case that no nodes are loaded
      opts.nodes = Array({ url: this.config.cdnURL })
      try {
        yield * fetchContent()
        return
      } catch (err) {
        lastError = err
        if (err.res?.status === 410 || isErrorUnavoidable(err)) {
          skipNodes = true
        } else {
          await this.loadNodesPromise
        }
      }
    }

    let nodes = this.nodes
    if (this.hashring) {
      const hashringNodes = this.hashring.range(cidPath, this.config.fallbackLimit + 1)
      nodes = nodes.filter((node) => hashringNodes.includes(node.url))
    }

    let fallbackCount = 0
    for (let i = 0; i < nodes.length; i++) {
      if (fallbackCount > this.config.fallbackLimit || skipNodes || upstreamController?.signal.aborted) {
        break
      }
      if (opts.raceNodes) {
        opts.nodes = nodes.slice(i, i + Saturn.defaultRaceCount)
      } else {
        opts.nodes = Array(nodes[i])
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
      const originUrl = opts.customerFallbackURL ?? this.config.customerFallbackURL
      // Use customer origin if cid is not retrievable by lassie.
      if (originUrl) {
        opts.nodes = Array({ url: originUrl })
        try {
          yield * fetchContent({ format: null, originFallback: true })
          return
        } catch (err) {
          lastError = err
        }
      }
      throwError()
    }
  }

  /**
   *
   * @param {string} cidPath
   * @param {FetchOptions} [opts={}]
   * @returns {Promise<AsyncIterable<Uint8Array>>}
   */
  async * fetchContent (cidPath, opts = {}) {
    let res, controller, log
    opts = Object.assign({}, this.config, opts)

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
      if (!opts.format) {
        yield * itr
      } else {
        yield * extractVerifiedContent(cidPath, itr)
      }
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
   * @param {FetchOptions} [opts={}]
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
   * @param {string} [opts.format]
   * @param {string} [opts.originFallback]
   * @param {object} [opts.jwt]
   * @returns {URL}
   */
  createRequestURL (cidPath, opts = {}) {
    let origin = opts.url ?? this.config.cdnURL
    origin = addHttpPrefix(origin)
    if (opts.originFallback) {
      return new URL(origin)
    }
    const url = new URL(`${origin}/ipfs/${cidPath}`)

    if (opts.format) url.searchParams.set('format', opts.format)

    if (opts.format === 'car') {
      url.searchParams.set('dag-scope', 'entity')
    }

    if (isBrowserContext && opts.jwt) {
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
      this.config.logURL,
      {
        method: 'POST',
        body: JSON.stringify({ bandwidthLogs, logSender: this.config.logSender })
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

  createHashring (nodes) {
    const servers = nodes.slice(0, this.config.hashRingSize).reduce((accumulator, node) => {
      accumulator[node.url] = { weight: node.weight }
      return accumulator
    }, {})

    const hashring = new HashRing(servers, 'md5', { 'max cache size': Saturn.hashRingCacheSize })
    return hashring
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
    const options = Object.assign({}, { method: 'GET' }, this.config)

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
      this.hashring = nodes && this.createHashring(nodes)
    }
    // we always want to update from the orchestrator regardless.
    nodes = await orchNodesListPromise
    nodes = this._sortNodes(nodes)
    this.nodes = nodes
    this.storage.set(Saturn.nodesListKey, nodes)
    this.hashring = this.createHashring(nodes)
  }
}
