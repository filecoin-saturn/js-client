import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it, before, after } from 'node:test'
import {
  getMockServer,
  mockJWT,
  mockOriginHandler,
  MSW_SERVER_OPTS
} from './test-utils.js'
import { Saturn } from '#src/index.js'

const TEST_CID = 'QmXjYBY478Cno4jzdCcPy4NcJYFrwHZ51xaCP8vUwN9MGm'
const HELLO_CID = 'bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4'
const TEST_AUTH = 'https://fz3dyeyxmebszwhuiky7vggmsu0rlkoy.lambda-url.us-west-2.on.aws/'
const TEST_ORIGIN_DOMAIN = 'l1s.saturn.test'
const clientKey = 'abc123'

describe('Saturn client', () => {
  describe('constructor', () => {
    it('should work w/o custom client ID', () => {
      new Saturn({ clientKey }) // eslint-disable-line
    })

    it('should work with custom client ID', () => {
      const clientId = randomUUID()
      const saturn = new Saturn({ clientId, clientKey })
      assert.strictEqual(saturn.config.clientId, clientId)
    })

    it('should work with custom CDN URL', () => {
      const cdnURL = 'custom.com'
      const saturn = new Saturn({ cdnURL, clientKey })
      assert.strictEqual(saturn.config.cdnURL, cdnURL)
    })

    it('should work with custom connect timeout', () => {
      const saturn = new Saturn({ connectTimeout: 1234, clientKey })
      assert.strictEqual(saturn.config.connectTimeout, 1234)
    })

    it('should work with custom download timeout', () => {
      const saturn = new Saturn({ downloadTimeout: 3456, clientKey })
      assert.strictEqual(saturn.config.downloadTimeout, 3456)
    })
  })

  describe('Fetch a CID', () => {
    const client = new Saturn({
      clientKey,
      cdnURL: TEST_ORIGIN_DOMAIN,
      authURL: TEST_AUTH
    })

    const handlers = [
      mockJWT(TEST_AUTH),
      mockOriginHandler(TEST_ORIGIN_DOMAIN, 0, false)
    ]

    const server = getMockServer(handlers)

    before(() => {
      server.listen(MSW_SERVER_OPTS)
    })
    after(() => {
      server.close()
    })

    it('should fetch test CID', async () => {
      const { res } = await client.fetchCID(TEST_CID)
      assert(res instanceof Response)
    })

    it('should fetch test CID with range', async () => {
      const opts = {
        range: {
          rangeStart: 3,
          rangeEnd: 7
        }
      }
      const uintArray = await client.fetchContentBuffer(HELLO_CID, opts)
      const actualContent = Buffer.from(uintArray).toString()

      // CAR content is: "hello world"
      // To get this value:
      // $ car gb hello.car bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4 | cut -c 4-8
      const expectedContent = 'lo wo'

      assert.strictEqual(actualContent.length, 5)
      assert.strictEqual(actualContent, expectedContent)
    })

    it('should create a log on fetch success', async () => {
      client.reportingLogs = true
      const response = await client.fetchContent(HELLO_CID)
      for await (const _ of response.body) {} // eslint-disable-line

      const log = client.logs.pop()

      assert(Number.isFinite(log.ttfbMs) && log.ttfbMs > 0)
      assert.strictEqual(log.httpStatusCode, 200)
      assert(Number.isFinite(log.numBytesSent) && log.numBytesSent > 0)
      assert(Number.isFinite(log.requestDurationSec) && log.requestDurationSec > 0)
      assert(!log.ifNetworkError)
    })
  })

  describe('Fetch CID error cases', () => {
    const client = new Saturn({
      clientKey,
      authURL: TEST_AUTH
    })

    // Doesn't use L1 origin mock, not sure how to force msw to stall a connection
    // to test connection timeouts.
    const handlers = [
      mockJWT(TEST_AUTH)
    ]

    const server = getMockServer(handlers)

    before(() => {
      server.listen(MSW_SERVER_OPTS)
    })
    after(() => {
      server.close()
    })

    it('should fail to fetch non CID', async () => {
      await assert.rejects(client.fetchCID('a'))
    })

    it('should fail when exceeding connection timeout', async () => {
      await assert.rejects(client.fetchCID(TEST_CID, { connectTimeout: 1 }))
    })

    it('should use external abort controller', async () => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 5)

      await assert.rejects(
        client.fetchCID(TEST_CID, { controller }),
        {
          name: 'AbortError',
          message: 'This operation was aborted'
        }
      )
    })

    it('should create a log on fetch network error', async () => {
      await assert.rejects(client.fetchContentBuffer(HELLO_CID, { connectTimeout: 1 }))
      const log = client.logs.pop()
      assert.strictEqual(log.error, 'This operation was aborted')
    })

    it.skip('should fail when exceeding download timeout', async () => {
      await assert.rejects(client.fetchCID(`${TEST_CID}/blah`, { downloadTimeout: 1 }))
    })
  })

  describe('Create a request URL', () => {
    const client = new Saturn({ clientKey })
    it('should translate entity bytes params', () => {
      assert.strictEqual(client.createRequestURL('bafy...').searchParams.get('entity-bytes'), null)
      assert.strictEqual(client.createRequestURL('bafy...', { range: {} }).searchParams.get('entity-bytes'), null)
      assert.strictEqual(client.createRequestURL('bafy...', { range: { rangeStart: 0 } }).searchParams.get('entity-bytes'), null)
      assert.strictEqual(client.createRequestURL('bafy...', { range: { rangeStart: 10 } }).searchParams.get('entity-bytes'), '10:*')
      assert.strictEqual(client.createRequestURL('bafy...', { range: { rangeStart: 10, rangeEnd: 20 } }).searchParams.get('entity-bytes'), '10:20')
      assert.strictEqual(client.createRequestURL('bafy...', { range: { rangeEnd: 20 } }).searchParams.get('entity-bytes'), '0:20')
    })
  })
})
