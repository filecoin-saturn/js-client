import { CarBlockIterator } from '@ipld/car'
import * as dagCbor from '@ipld/dag-cbor'
import * as dagPb from '@ipld/dag-pb'
import * as dagJson from '@ipld/dag-json'
import * as unixfs from 'ipfs-unixfs-exporter'
import { bytes } from 'multiformats'
import * as raw from 'multiformats/codecs/raw'
import * as json from 'multiformats/codecs/json'
import { sha256 } from 'multiformats/hashes/sha2'
import { identity } from 'multiformats/hashes/identity'
import { from as hasher } from 'multiformats/hashes/hasher'
import { blake2b256 } from '@multiformats/blake2/blake2b'

import { CarBlockGetter } from './car-block-getter.js'
import { VerificationError } from './errors.js'

const { toHex } = bytes

const codecs = {
  [dagCbor.code]: dagCbor,
  [dagPb.code]: dagPb,
  [dagJson.code]: dagJson,
  [raw.code]: raw,
  [json.code]: json
}

const hashes = {
  [identity.code]: identity,
  [sha256.code]: sha256,
  [blake2b256.code]: hasher(blake2b256)
}

const minimumHashLength = 20
const maximumHashLength = 128

/**
 * Validates a CAR file
 *
 * @param {ReadableStream} body
 * @returns {Promise<boolean>}
 */
export async function validateBody (body) {
  const carBlockIterator = await CarBlockIterator.fromIterable(body)
  for await (const { cid, bytes } of carBlockIterator) {
    await verifyBlock(cid, bytes)
  }

  return true
}

/**
 * Verifies a block
 *
 * @param {CID} cid
 * @param {Uint8Array} bytes
 */
export async function verifyBlock (cid, bytes) {
  const { code: mhCode, digest: mhDigest } = cid.multihash

  // Verify step 1: is this a CID we know how to deal with?
  if (!codecs[cid.code]) {
    throw new VerificationError(`Unexpected codec: 0x${cid.code.toString(16)}`)
  }

  if (!hashes[mhCode]) {
    throw new VerificationError(`Unexpected multihash code: 0x${mhCode.toString(16)}`)
  }

  if (mhCode !== identity.code && mhDigest.length < minimumHashLength) {
    throw new VerificationError(`Hashes must be at least ${minimumHashLength} bytes long`)
  }

  if (mhCode !== identity.code && mhDigest.length > maximumHashLength) {
    throw new VerificationError(`Hashes must be at most ${maximumHashLength} bytes long`)
  }

  // Verify step 2: if we hash the bytes, do we get the same digest as
  // reported by the CID? Note that this step is sufficient if you just
  // want to safely verify the CAR's reported CIDs
  const hash = await hashes[mhCode].digest(bytes)
  if (toHex(hash.digest) !== toHex(mhDigest)) {
    throw new VerificationError(
          `Mismatch: digest of bytes (${toHex(hash)}) does not match digest in CID (${toHex(mhDigest)})`)
  }
}

/**
 * Verifies a car stream represents a valid IPLD entity and returns it
 *
 * @param {string} cidPath
 * @param {ReadableStream|AsyncIterable} carStream
 */
export async function extractVerifiedEntity(cidPath, carStream) {
  const getter = await CarBlockGetter.fromStream(carStream)
  return await unixfs.exporter(cidPath, getter)
}

/**
 * Extracts raw content of a verified IPLD entity
 *
 * @param {unixfs.UnixFSEntry} node
 * @param {import('../types.js').ContentRange} options
 */
export async function * extractVerifiedContent(node, options = {}) {
  const normalizedRange = normalizeContentRange(node, options)
  const length = normalizedRange.rangeEnd + 1 - normalizedRange.rangeStart
  for await (const chunk of node.content({  })) {
    yield chunk
  }
}

/**
 * Returns the request content range normalized to the file size
 * @param {unixfs.UnixFSEntry} node
 * @param {import('../types.js').ContentRange} options
 * @returns {import('../types.js').ContentRange}
 */
export function normalizeContentRange(node, options = {}) {
  let rangeStart = options.rangeStart ?? 0
  if (rangeStart < 0) {
    rangeStart = rangeStart + Number(node.size)
    if (rangeStart < 0) {
      rangeStart = 0
    }
  } else if (rangeStart > 0) {
    if (rangeStart >= Number(node.size)) {
      throw new Error("range start greater than content length")
    }
  }

  if (options.rangeEnd === null || options.rangeEnd === undefined) {
    return {
      rangeStart,
      rangeEnd: Number(node.size) - 1
    }
  }

  let rangeEnd = options.rangeEnd
  if (rangeEnd < 0) {
    rangeEnd = rangeEnd + Number(node.size) - 1
    if (rangeEnd < 0) {
      throw new Error("range end is too small")
    }
  } else {
    if (rangeEnd >= Number(node.size)) {
      rangeEnd = Number(node.size) - 1
    }
  }

  if (rangeEnd - rangeStart < 0) {
    throw new Error("range end must be greater than or equal to range start")
  }
  return { rangeStart, rangeEnd }
}
