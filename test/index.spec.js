import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'

import Saturn from '#src/index.js'

const TEST_CID = 'QmXjYBY478Cno4jzdCcPy4NcJYFrwHZ51xaCP8vUwN9MGm'

const clientKey = '1234567890abcdef'

describe('Saturn client', () => {
  describe('constructor', () => {
    it('should work w/o custom client ID', () => {
      new Saturn({ clientKey })
    })

    it('should work with custom client ID', () => {
      const clientId = randomUUID()
      const saturn = new Saturn({ clientId, clientKey })
      assert.strictEqual(saturn.opts.clientId, clientId)
    })

    it('should work with custom CDN URL', () => {
      const cdnURL = 'custom.com'
      const saturn = new Saturn({ cdnURL, clientKey })
      assert.strictEqual(saturn.opts.cdnURL, cdnURL)
    })

    it('should work with custom connect timeout', () => {
      const saturn = new Saturn({ connectTimeout: 1234, clientKey })
      assert.strictEqual(saturn.opts.connectTimeout, 1234)
    })

    it('should work with custom download timeout', () => {
      const saturn = new Saturn({ downloadTimeout: 3456, clientKey })
      assert.strictEqual(saturn.opts.downloadTimeout, 3456)
    })
  })

  describe('Fetch a CID', () => {
    const client = new Saturn({ clientKey })

    it('should fetch test CID', async () => {
      const { res } = await client.fetchCID(TEST_CID)
      assert(res instanceof Response)
    })

    it('should fail to fetch non CID', async () => {
      await assert.rejects(client.fetchCID('a'))
    })

    it('should fail when exceeding connection timeout', async () => {
      await assert.rejects(client.fetchCID(TEST_CID, { connectTimeout: 1 }))
    })

    it.skip('should fail when exceeding download timeout', async () => {
      await assert.rejects(client.fetchCID(`${TEST_CID}/blah`, { downloadTimeout: 1 }))
    })
  })

  describe('Logging', () => {
    const client = new Saturn({ clientKey })
    client.reportingLogs = true

    it('should create a log on fetch success', async () => {
      for await (const _ of client.fetchContent(TEST_CID)) {}

      const log = client.logs.pop()

      assert(Number.isFinite(log.ttfbMs) && log.ttfbMs > 0)
      assert.strictEqual(log.httpStatusCode, 200)
      assert(Number.isFinite(log.numBytesSent) && log.numBytesSent > 0)
      assert(Number.isFinite(log.requestDurationSec) && log.requestDurationSec > 0)
      assert(!log.ifNetworkError)
    })

    it('should create a log on fetch network error', async () => {
      await assert.rejects(client.fetchContentBuffer(TEST_CID, { connectTimeout: 1 }))

      const log = client.logs.pop()
      assert.strictEqual(log.error, 'This operation was aborted')
    })
  })
})
