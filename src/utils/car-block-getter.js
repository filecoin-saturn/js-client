import { CarBlockIterator } from '@ipld/car/iterator'
import { CID } from 'multiformats/cid'
import { identity } from 'multiformats/hashes/identity'

import { verifyBlock } from './car.js'
import { asAsyncIterable } from './itr.js'
import { promiseTimeout } from './timers.js'
import { TimeoutError, VerificationError } from './errors.js'

// Assumptions
// * client and server are both using DFS traversal.
// * Server is sending CARs with duplicate blocks.
export class CarBlockGetter {
  constructor (carItr, opts = {}) {
    this.carItr = carItr
    this.getBlockTimeout = opts.getBlockTimeout ?? 1_000 * 10
  }

  static async fromStream (carStream) {
    const iterable = await CarBlockIterator.fromIterable(
      asAsyncIterable(carStream)
    )
    const carItr = iterable[Symbol.asyncIterator]()
    return new CarBlockGetter(carItr)
  }

  async get (cid, options) {
    cid = typeof cid === 'string' ? CID.parse(cid) : cid

    if (cid.multihash.code === identity.code) {
      return cid.multihash.digest
    }

    const { value, done } = await promiseTimeout(
      this.carItr.next(),
      this.getBlockTimeout,
      new TimeoutError(`get ${cid}: timed out`)
    )

    if (!value && done) {
      throw new VerificationError(`get ${cid}: CAR file has no more blocks`)
    }

    const { cid: blockCid, bytes } = value
    await verifyBlock(blockCid, bytes)

    if (!cid.equals(blockCid)) {
      throw new VerificationError(
        `get ${cid}: received ${blockCid} instead`
      )
    }

    return bytes
  }
}
