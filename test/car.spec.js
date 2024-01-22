import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import { getFixturePath, concatChunks } from './test-utils.js'

import { CarReader, CarWriter } from '@ipld/car'
import { CID } from 'multiformats/cid'

import { extractVerifiedContent } from '#src/utils/car.js'

describe('CAR Verification', () => {
  it('should extract content from a valid CAR', async () => {
    const cidPath =
      'bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4'
    const filepath = getFixturePath('hello.car')
    const carStream = fs.createReadStream(filepath)

    const contentItr = await extractVerifiedContent(cidPath, carStream)
    const buffer = await concatChunks(contentItr)
    const actualContent = String.fromCharCode(...buffer)
    const expectedContent = 'hello world\n'

    assert.strictEqual(actualContent, expectedContent)
  })

  it('should extract content from a valid CAR with a range', async () => {
    const cidPath =
      'bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4'
    const filepath = getFixturePath('hello.car')
    const carStream = fs.createReadStream(filepath)

    const contentItr = await extractVerifiedContent(cidPath, carStream, {rangeStart: 1, rangeEnd: 3})
    const buffer = await concatChunks(contentItr)
    const actualContent = String.fromCharCode(...buffer)
    const expectedContent = 'ell'

    assert.strictEqual(actualContent, expectedContent)
  })

  it('should extract content from a valid CAR with a range with only a start', async () => {
    const cidPath =
      'bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4'
    const filepath = getFixturePath('hello.car')
    const carStream = fs.createReadStream(filepath)

    const contentItr = await extractVerifiedContent(cidPath, carStream, {rangeStart: 1})
    const buffer = await concatChunks(contentItr)
    const actualContent = String.fromCharCode(...buffer)
    const expectedContent = 'ello world\n'

    assert.strictEqual(actualContent, expectedContent)
  })

  it('should extract content from a valid CAR with a range with a negative end', async () => {
    const cidPath =
      'bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4'
    const filepath = getFixturePath('hello.car')
    const carStream = fs.createReadStream(filepath)

    const contentItr = await extractVerifiedContent(cidPath, carStream, {rangeStart: 1, rangeEnd: -1})
    const buffer = await concatChunks(contentItr)
    const actualContent = String.fromCharCode(...buffer)
    const expectedContent = 'ello world'

    assert.strictEqual(actualContent, expectedContent)
  })

  it('should extract content from a valid CAR with a range with a negative start and end', async () => {
    const cidPath =
      'bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4'
    const filepath = getFixturePath('hello.car')
    const carStream = fs.createReadStream(filepath)

    const contentItr = await extractVerifiedContent(cidPath, carStream, {rangeStart: -5, rangeEnd: -1})
    const buffer = await concatChunks(contentItr)
    const actualContent = String.fromCharCode(...buffer)
    const expectedContent = 'orld'

    assert.strictEqual(actualContent, expectedContent)
  })

  it('should extract content from a valid multi block CAR with a range', async () => {
    const cidPath = 'QmStvUMCtXxEb8wRjNSUqWwqHBEDhmnEd5nHp5siV7bm1Z'
    const filepath = getFixturePath('multi_block_filtered.car')
    const carStream = fs.createReadStream(filepath)

    const contentItr = await extractVerifiedContent(cidPath, carStream, { rangeStart: 300, rangeEnd: 349 })
    const buffer = await concatChunks(contentItr)
    const actualContent = Buffer.from(buffer).toString('base64')

    // To get this value:
    // $ mkdir -p outdir && car x -f multi_block.car outdir
    // $ dd status=none if=outdir/unknown of=/dev/stdout bs=1 skip=300 count=50 | base64
    const expectedContent = 'Dubn28NGm5/ycJu4PqXEFrgvN0ys0yAwhuYjl2TV23ruEcDazo4LAzZSKF3JeNfCNgg='

    assert.strictEqual(actualContent, expectedContent)
  })

  it('should verify intermediate path segments', async () => {
    const cidPath =
      'bafybeigeqgfwhivuuxgmuvcrrwvs4j3yfzgljssvnuqzokm6uby4fpmwsa/subdir/hello.txt'
    const filepath = getFixturePath('subdir.car')
    const carStream = fs.createReadStream(filepath)

    const contentItr = await extractVerifiedContent(cidPath, carStream)
    const buffer = await concatChunks(contentItr)
    const actualContent = String.fromCharCode(...buffer)
    const expectedContent = 'hello world\n'

    assert.strictEqual(actualContent, expectedContent)
  })

  it('should verify identity cids', async () => {
    const cidPath =
      'bafyreiccg6dmxvt6twmzxtr4ujhaobrcucrsau6uopslvo5kq6n523btqi/identity'
    const filepath = getFixturePath('dag-cbor-with-identity.car')
    const carStream = fs.createReadStream(filepath)

    const contentItr = await extractVerifiedContent(cidPath, carStream)
    const itr = contentItr[Symbol.asyncIterator]()
    const actualContent = (await itr.next()).value
    const expectedContent = { asdf: 324 }

    assert.deepStrictEqual(actualContent, expectedContent)
  })

  it('should traverse non-unixfs dag-cbor CARs', async () => {
    const cidPath =
      'bafyreibs4utpgbn7uqegmd2goqz4bkyflre2ek2iwv743fhvylwi4zeeim/foo/link/bar'
    const filepath = getFixturePath('dag-cbor-traversal.car')
    const carStream = fs.createReadStream(filepath)

    const contentItr = await extractVerifiedContent(cidPath, carStream)
    const itr = contentItr[Symbol.asyncIterator]()
    const actualContent = (await itr.next()).value
    const expectedContent = { hello: 'this is not a link' }

    assert.deepStrictEqual(actualContent, expectedContent)
  })

  it.skip('should traverse non-unixfs dag-json CARs', async () => {
    const cidPath =
      'baguqeeram5ujjqrwheyaty3w5gdsmoz6vittchvhk723jjqxk7hakxkd47xq/foo/link/bar'
    const filepath = './fixtures/dag-json-traversal.car'
    const carStream = fs.createReadStream(filepath)

    const contentItr = await extractVerifiedContent(cidPath, carStream)
    const itr = contentItr[Symbol.asyncIterator]()
    const actualContent = (await itr.next()).value
    const expectedContent = { hello: 'this is not a link' }

    assert.deepStrictEqual(actualContent, expectedContent)
  })

  it('should error if CAR is missing blocks', async () => {
    const cidPath = 'bafybeigeqgfwhivuuxgmuvcrrwvs4j3yfzgljssvnuqzokm6uby4fpmwsa'
    const filepath = getFixturePath('subdir.car')
    const carStream = fs.createReadStream(filepath)

    // Create an invalid CAR that only has 1 block but should have 3
    const outCid = CID.parse(cidPath)
    const { writer, out } = await CarWriter.create([outCid]);
    (async () => {
      // need wrapping IIFE to avoid node exiting early
      const reader = await CarReader.fromIterable(carStream)
      await writer.put(await reader.get(cidPath))
      await writer.close()
    })()

    await assert.rejects(
      async () => {
        for await (const _ of extractVerifiedContent(cidPath, out)) {}
      },
      {
        name: 'VerificationError',
        message: 'get bafybeidhkumeonuwkebh2i4fc7o7lguehauradvlk57gzake6ggjsy372a: CAR file has no more blocks'
      }
    )
  })

  it('should error if CAR blocks are in the wrong traversal order', async () => {
    const cidPath = 'bafybeigeqgfwhivuuxgmuvcrrwvs4j3yfzgljssvnuqzokm6uby4fpmwsa'
    const filepath = getFixturePath('subdir.car')
    const carStream = fs.createReadStream(filepath)

    // Create an invalid CAR that has blocks in the wrong order
    const outCid = CID.parse(cidPath)
    const { writer, out } = await CarWriter.create([outCid]);
    (async () => {
      // need wrapping IIFE to avoid node exiting early
      const reader = await CarReader.fromIterable(carStream)

      const blocks = []
      for await (const block of reader.blocks()) {
        blocks.push(block)
      }

      const temp = blocks[0]
      blocks[0] = blocks[1]
      blocks[1] = temp

      for (const block of blocks) {
        await writer.put(block)
      }
      await writer.close()
    })()

    await assert.rejects(
      async () => {
        for await (const _ of extractVerifiedContent(cidPath, out)) {}
      },
      {
        name: 'VerificationError',
        message:
          'get bafybeigeqgfwhivuuxgmuvcrrwvs4j3yfzgljssvnuqzokm6uby4fpmwsa: received bafybeidhkumeonuwkebh2i4fc7o7lguehauradvlk57gzake6ggjsy372a instead'
      }
    )
  })
})
