import { CarBlockIterator } from '@ipld/car/iterator'
import toIterable from 'browser-readablestream-to-it'
import { CID } from 'multiformats/cid'

import { verifyBlock } from './car.js'
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
    const { value, done } = await promiseTimeout(
      this.carItr.next(),
      this.getBlockTimeout,
      new TimeoutError(`get block ${cid} timed out`)
    )

    if (!value && done) {
      throw new VerificationError('CAR file has no more blocks.')
    }

    const { cid: blockCid, bytes } = value
    await verifyBlock(blockCid, bytes)

    if (!cid.equals(blockCid)) {
      throw new VerificationError(
        `received block with cid ${blockCid}, expected ${cid}`
      )
    }

    return bytes
  }
}

function asAsyncIterable (readable) {
  return Symbol.asyncIterator in readable ? readable : toIterable(readable)
}
