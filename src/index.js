import { CID } from 'multiformats'

import { validateBody } from './utils/car.js'
import { setTimeoutPromise } from './utils/timers.js'
import { randomUUID } from './utils/uuid.js'
import { createBandwidthLog } from './utils/logging.js'

class Saturn {
  /**
   *
   * @param {object} [opts={}]
   * @param {object} [opts.clientId=randomUUID()]
   * @param {object} [opts.cdnURL=strn.pl]
   * @param {object} [opts.connectTimeout=5000]
   * @param {object} [opts.downloadTimeout=0]
   */
  constructor (opts = {}) {
    this.opts = Object.assign({}, {
      clientId: randomUUID(),
      cdnURL: 'strn.pl',
      connectTimeout: 5_000,
      downloadTimeout: 0
    }, opts)

    this.reportingLogs = process?.env?.NODE_ENV !== 'development'
    this.logs = []
  }

  /**
   *
   * @param {string} cid
   * @param {object} [opts={}]
   * @param {('car'|'raw')} [opts.format]
   * @param {number} [opts.connectTimeout=5000]
   * @param {number} [opts.downloadTimeout=0]
   * @returns {Promise<Response>}
   */
  async fetchCID (cid, opts = {}) {
    CID.parse(cid)

    const options = Object.assign({}, this.opts, { format: 'car' }, opts)

    const url = `https://${options.cdnURL}/ipfs/${cid}?clientId=${options.clientId}&format=${options.format}`

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

      const validationResult = await (options.downloadTimeout ? Promise.race([validateBody(res.body), setTimeoutPromise(options.downloadTimeout, false, { ref: false })]) : validateBody(res.body))
      if (!validationResult) {
        controller.abort()
        throw new Error('Couldn\'t download and validate test CID in time')
      }
    } catch (err) {
      log.ifError = err.message
      throw err
    } finally {
      log.endTime = new Date()

      if (window?.performance) {
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
