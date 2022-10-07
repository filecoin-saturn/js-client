import { CID } from 'multiformats'

import { validateBody } from './utils/car.js'
import { setTimeoutPromise } from './utils/timers.js'
import { randomUUID } from './utils/uuid.js'

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

    const controller = new AbortController()
    const connectTimeout = setTimeout(() => {
      controller.abort()
    }, options.connectTimeout)
    const res = await fetch(`https://${options.cdnURL}/ipfs/${cid}?clientId=${options.clientId}&format=${options.format}`, { signal: controller.signal })
    clearTimeout(connectTimeout)

    if (!res.ok) {
      throw new Error(`Non OK response received: ${res.status} ${res.statusText}`)
    }

    const validationResult = await (options.downloadTimeout ? Promise.race([validateBody(res.body), setTimeoutPromise(options.downloadTimeout, false, { ref: false })]) : validateBody(res.body))
    if (!validationResult) {
      controller.abort()
      throw new Error('Couldn\'t download and validate test CID in time')
    }

    return res
  }
}

export default Saturn
