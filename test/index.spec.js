import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'

import Saturn from '#src/index.js'

describe('Saturn client', () => {
  describe('constructor', () => {
    it('should work w/o custom client ID', () => {
      new Saturn()
    })

    it('should work with custom client ID', () => {
      const clientId = randomUUID()
      const saturn = new Saturn({ clientId })
      assert.strictEqual(saturn.opts.clientId, clientId)
    })

    it('should work with custom CDN URL', () => {
      const cdnURL = 'custom.com'
      const saturn = new Saturn({ cdnURL })
      assert.strictEqual(saturn.opts.cdnURL, cdnURL)
    })

    it('should work with custom connect timeout', () => {
      const saturn = new Saturn({ connectTimeout: 1234 })
      assert.strictEqual(saturn.opts.connectTimeout, 1234)
    })

    it('should work with custom download timeout', () => {
      const saturn = new Saturn({ downloadTimeout: 3456 })
      assert.strictEqual(saturn.opts.downloadTimeout, 3456)
    })
  })

  describe('Fetch a CID', () => {
    const client = new Saturn()

    it('should fetch test CID', async () => {
      const { res } = await client.fetchCID('QmXjYBY478Cno4jzdCcPy4NcJYFrwHZ51xaCP8vUwN9MGm')
      assert(res instanceof Response)
    })

    it('should fail to fetch non CID', async () => {
      await assert.rejects(client.fetchCID('a'))
    })

    it('should fail when exceeding connection timeout', async () => {
      await assert.rejects(client.fetchCID('QmXjYBY478Cno4jzdCcPy4NcJYFrwHZ51xaCP8vUwN9MGm', { connectTimeout: 1 }))
    })

    it.skip('should fail when exceeding download timeout', async () => {
      await assert.rejects(client.fetchCID('QmXjYBY478Cno4jzdCcPy4NcJYFrwHZ51xaCP8vUwN9MGm/blah', { downloadTimeout: 1 }))
    })
  })
})
