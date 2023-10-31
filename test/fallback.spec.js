
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'

import { Saturn } from '#src/index.js'
import { concatChunks, generateNodes, getMockServer, HTTP_STATUS_GONE, mockJWT, mockNodesHandlers, mockOrchHandler, mockSaturnOriginHandler, MSW_SERVER_OPTS } from './test-utils.js'

const TEST_DEFAULT_ORCH = 'https://orchestrator.strn.pl.test/nodes'
const TEST_NODES_LIST_KEY = 'saturn-nodes'
const TEST_AUTH = 'https://auth.test/'
const TEST_ORIGIN_DOMAIN = 'l1s.saturn.test'
const CLIENT_KEY = 'key'

const options = {
  cdnURL: TEST_ORIGIN_DOMAIN,
  orchURL: TEST_DEFAULT_ORCH,
  authURL: TEST_AUTH,
  experimental: true,
  clientKey: CLIENT_KEY,
  clientId: 'test'
}

describe('Client Fallback', () => {
  test('Nodes are loaded from the orchestrator if no storage is passed', async (t) => {
    const handlers = [
      mockOrchHandler(2, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN)
    ]
    const server = getMockServer(handlers)
    server.listen(MSW_SERVER_OPTS)

    const expectedNodes = generateNodes(2, TEST_ORIGIN_DOMAIN)

    // No Storage is injected
    const saturn = new Saturn({ ...options })
    const mockOpts = { orchURL: TEST_DEFAULT_ORCH }

    await saturn._loadNodes(mockOpts)

    // Assert that the loaded nodes are the expected ones.
    assert.deepEqual(saturn.nodes, expectedNodes)

    server.close()
  })

  test('Storage is invoked correctly when supplied', async (t) => {
    const handlers = [
      mockOrchHandler(2, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN)
    ]
    const server = getMockServer(handlers)
    server.listen(MSW_SERVER_OPTS)

    const expectedNodes = generateNodes(2, TEST_ORIGIN_DOMAIN)

    // Mocking storage object
    const mockStorage = {
      get: async (key) => null,
      set: async (key, value) => null,
      delete: async (key) => null
    }
    t.mock.method(mockStorage, 'get')
    t.mock.method(mockStorage, 'set')

    const saturn = new Saturn({ storage: mockStorage, ...options })

    // Mocking options
    const mockOpts = { orchURL: TEST_DEFAULT_ORCH }

    await saturn._loadNodes(mockOpts)

    // Assert that all the storage methods were called twice.
    assert.strictEqual(mockStorage.set.mock.calls.length, 2)
    assert.strictEqual(mockStorage.get.mock.calls.length, 2)

    // Assert that the set method was invoked with the correct params.
    assert.deepStrictEqual(mockStorage.set.mock.calls[0].arguments, [TEST_NODES_LIST_KEY, expectedNodes])

    assert.deepEqual(saturn.nodes, expectedNodes)

    server.close()
    mock.reset()
  })

  test('Storage is loaded first when the orch is slower', async (t) => {
    const handlers = [
      mockOrchHandler(2, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN, 500)
    ]
    const server = getMockServer(handlers)
    server.listen(MSW_SERVER_OPTS)

    const expectedNodes = generateNodes(4, TEST_ORIGIN_DOMAIN)

    // Mocking storage object
    const mockStorage = {
      get: async (key) => { return Promise.resolve(expectedNodes.slice(2, 4)) },
      set: async (key, value) => { return null }
    }
    t.mock.method(mockStorage, 'get')
    t.mock.method(mockStorage, 'set')

    const saturn = new Saturn({ storage: mockStorage, ...options })

    // Mocking options
    const mockOpts = { orchURL: TEST_DEFAULT_ORCH }

    await saturn._loadNodes(mockOpts)

    // Assert that all the storage methods were called twice.
    assert.strictEqual(mockStorage.set.mock.calls.length, 2)
    assert.strictEqual(mockStorage.get.mock.calls.length, 2)

    // Assert that the set method was invoked with the correct params.
    assert.deepStrictEqual(mockStorage.set.mock.calls[0].arguments, [TEST_NODES_LIST_KEY, expectedNodes.slice(0, 2)])

    assert.deepEqual(saturn.nodes, expectedNodes.slice(0, 2))
    server.close()
    mock.reset()
  })

  test('Content Fallback fetches a cid properly', async (t) => {
    const handlers = [
      mockOrchHandler(2, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN),
      mockJWT(TEST_AUTH),
      mockSaturnOriginHandler(TEST_ORIGIN_DOMAIN, 0, true),
      ...mockNodesHandlers(2, TEST_ORIGIN_DOMAIN)
    ]
    const server = getMockServer(handlers)
    server.listen(MSW_SERVER_OPTS)

    const expectedNodes = generateNodes(2, TEST_ORIGIN_DOMAIN)

    // Mocking storage object
    const mockStorage = {
      get: async (key) => { return Promise.resolve(expectedNodes.slice(2, 4)) },
      set: async (key, value) => { return null }
    }
    t.mock.method(mockStorage, 'get')
    t.mock.method(mockStorage, 'set')

    const saturn = new Saturn({ storage: mockStorage, ...options })

    const cid = saturn.fetchContentWithFallback('bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4')

    const buffer = await concatChunks(cid)
    const actualContent = String.fromCharCode(...buffer)
    const expectedContent = 'hello world\n'

    assert.strictEqual(actualContent, expectedContent)
    server.close()
    mock.reset()
  })

  test('Content Fallback fetches a cid properly with race', async (t) => {
    const handlers = [
      mockOrchHandler(5, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN),
      mockJWT(TEST_AUTH),
      mockSaturnOriginHandler(TEST_ORIGIN_DOMAIN, 0, true),
      ...mockNodesHandlers(5, TEST_ORIGIN_DOMAIN)
    ]
    const server = getMockServer(handlers)
    server.listen(MSW_SERVER_OPTS)

    const expectedNodes = generateNodes(3, TEST_ORIGIN_DOMAIN)

    // Mocking storage object
    const mockStorage = {
      get: async (key) => expectedNodes,
      set: async (key, value) => { return null }
    }
    t.mock.method(mockStorage, 'get')
    t.mock.method(mockStorage, 'set')

    const saturn = new Saturn({ ...options })

    const cid = saturn.fetchContentWithFallback('bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4', { raceNodes: true })

    const buffer = await concatChunks(cid)
    const actualContent = String.fromCharCode(...buffer)
    const expectedContent = 'hello world\n'

    assert.strictEqual(actualContent, expectedContent)
    server.close()
    mock.reset()
  })

  test('Content Fallback with race fetches from consecutive nodes on failure', async (t) => {
    const handlers = [
      mockOrchHandler(5, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN),
      mockJWT(TEST_AUTH),
      mockSaturnOriginHandler(TEST_ORIGIN_DOMAIN, 0, true),
      ...mockNodesHandlers(5, TEST_ORIGIN_DOMAIN, 2)
    ]
    const server = getMockServer(handlers)
    server.listen(MSW_SERVER_OPTS)

    const expectedNodes = generateNodes(5, TEST_ORIGIN_DOMAIN)

    // Mocking storage object
    const mockStorage = {
      get: async (key) => expectedNodes,
      set: async (key, value) => { return null }
    }
    t.mock.method(mockStorage, 'get')
    t.mock.method(mockStorage, 'set')

    const saturn = new Saturn({ storage: mockStorage, ...options })

    const cid = saturn.fetchContentWithFallback('bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4', { raceNodes: true })

    const buffer = await concatChunks(cid)
    const actualContent = String.fromCharCode(...buffer)
    const expectedContent = 'hello world\n'

    assert.strictEqual(actualContent, expectedContent)
    server.close()
    mock.reset()
  })

  test('should fetch content from the first node successfully', async () => {
    const handlers = [
      mockOrchHandler(2, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN),
      mockJWT(TEST_AUTH),
      ...mockNodesHandlers(2, TEST_ORIGIN_DOMAIN)
    ]

    const server = getMockServer(handlers)
    server.listen(MSW_SERVER_OPTS)
    const saturn = new Saturn({ ...options })

    const fetchContentMock = mock.fn(async function * (cidPath, opts) {
      yield Buffer.from('chunk1')
      yield Buffer.from('chunk2')
    })
    saturn.fetchContent = fetchContentMock
    const content = await saturn.fetchContentWithFallback('some-cid-path')

    const buffer = await concatChunks(content)
    const expectedContent = new Uint8Array([...Buffer.from('chunk1'), ...Buffer.from('chunk2')])

    assert.deepEqual(buffer, expectedContent)
    assert.strictEqual(fetchContentMock.mock.calls.length, 1)
    server.close()
    mock.reset()
  })

  test('should try all nodes and fail if all nodes fail', async () => {
    const numNodes = 3
    const handlers = [
      mockOrchHandler(numNodes, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN),
      mockJWT(TEST_AUTH),
      ...mockNodesHandlers(numNodes, TEST_ORIGIN_DOMAIN)
    ]

    const server = getMockServer(handlers)
    server.listen(MSW_SERVER_OPTS)
    const saturn = new Saturn({ ...options })

    const fetchContentMock = mock.fn(async function * (cidPath, opts) { throw new Error('Fetch error') }) // eslint-disable-line
    saturn.fetchContent = fetchContentMock

    let error
    try {
      for await (const _ of saturn.fetchContentWithFallback('some-cid-path')) { // eslint-disable-line
        // This loop body shouldn't be reached.
      }
    } catch (e) {
      error = e
    }

    assert(error)
    assert.strictEqual(error.message, 'All attempts to fetch content have failed. Last error: Fetch error')
    assert.strictEqual(fetchContentMock.mock.calls.length, numNodes + 1)
    mock.reset()
    server.close()
  })

  test('Should abort fallback on 410s', async () => {
    const numNodes = 3
    const handlers = [
      mockOrchHandler(numNodes, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN),
      mockJWT(TEST_AUTH),
      ...mockNodesHandlers(numNodes, TEST_ORIGIN_DOMAIN, 3, HTTP_STATUS_GONE)
    ]

    const server = getMockServer(handlers)
    server.listen(MSW_SERVER_OPTS)
    const saturn = new Saturn({ ...options })
    await saturn.loadNodesPromise

    let error
    try {
      for await (const _ of saturn.fetchContentWithFallback('bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4')) { // eslint-disable-line
        // This loop body shouldn't be reached.
      }
    } catch (e) {
      error = e
    }
    const logs = saturn.logs

    assert(error)
    assert.strictEqual(logs.length, 1)
    mock.reset()
    server.close()
  })

  test('Should abort fallback on specific errors', async () => {
    const numNodes = 3
    const handlers = [
      mockOrchHandler(numNodes, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN),
      mockJWT(TEST_AUTH),
      ...mockNodesHandlers(numNodes, TEST_ORIGIN_DOMAIN, 3, HTTP_STATUS_GONE)
    ]

    const server = getMockServer(handlers)
    server.listen(MSW_SERVER_OPTS)
    const saturn = new Saturn({ ...options })
    await saturn.loadNodesPromise

    let callCount = 0
    const fetchContentMock = mock.fn(async function * (cidPath, opts) {
      callCount++
      yield ''
      throw new Error('file does not exist')
    })

    saturn.fetchContent = fetchContentMock

    let error
    try {
      for await (const _ of saturn.fetchContentWithFallback('bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4')) { // eslint-disable-line
      }
    } catch (e) {
      error = e
    }

    assert(error)
    assert.strictEqual(callCount, 1)
    mock.reset()
    server.close()
  })
  test('Handles fallback with chunk overlap correctly', async () => {
    const numNodes = 3
    const handlers = [
      mockOrchHandler(numNodes, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN),
      mockJWT(TEST_AUTH),
      ...mockNodesHandlers(numNodes, TEST_ORIGIN_DOMAIN)
    ]

    const server = getMockServer(handlers)
    server.listen(MSW_SERVER_OPTS)
    const saturn = new Saturn({ ...options })

    let callCount = 0
    const fetchContentMock = mock.fn(async function * (cidPath, opts) {
      callCount++
      if (callCount === 1) {
        throw new Error('First call error')
      }
      if (callCount === 2) {
        yield Buffer.from('chunk1-overlap')
        yield Buffer.from('chunk2')
      }
    })

    saturn.fetchContent = fetchContentMock

    const content = saturn.fetchContentWithFallback('some-cid-path')
    const buffer = await concatChunks(content)
    const expectedContent = new Uint8Array([
      ...Buffer.from('chunk1-overlap'),
      ...Buffer.from('chunk2')
    ])

    assert.deepEqual(buffer, expectedContent)
    assert.strictEqual(fetchContentMock.mock.calls.length, 2)
    server.close()
    mock.reset()
  })

  test('should handle byte chunk overlaps correctly', async () => {
    const numNodes = 3
    const handlers = [
      mockOrchHandler(numNodes, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN),
      mockJWT(TEST_AUTH),
      ...mockNodesHandlers(numNodes, TEST_ORIGIN_DOMAIN)
    ]

    const server = getMockServer(handlers)
    server.listen(MSW_SERVER_OPTS)
    const saturn = new Saturn({ ...options })

    let callCount = 0
    let fetchContentMock = mock.fn(async function * (cidPath, opts) {
      callCount++
      if (callCount === 1) {
        yield Buffer.from('chunk1-overlap')
        throw new Error('First call error')
      }
      if (callCount === 2) {
        yield Buffer.from('chunk1-overlap')
        yield Buffer.from('chunk2')
      }
    })

    saturn.fetchContent = fetchContentMock
    const expectedContent = new Uint8Array([
      ...Buffer.from('chunk1-overlap'),
      ...Buffer.from('chunk2')
    ])
    let content = saturn.fetchContentWithFallback('some-cid-path')
    let buffer = await concatChunks(content)

    assert.deepEqual(buffer, expectedContent)
    assert.strictEqual(fetchContentMock.mock.calls.length, 2)

    callCount = 0
    fetchContentMock = mock.fn(async function * (cidPath, opts) {
      callCount++
      if (callCount === 1) {
        yield Buffer.from('chunk1-')
        throw new Error('First call error')
      }
      if (callCount === 2) {
        yield Buffer.from('chunk1')
        yield Buffer.from('-overlap')
        throw new Error('Second call error')
      }
      if (callCount === 3) {
        yield Buffer.from('chunk1-overlap')
        yield Buffer.from('chunk2')
      }
    })

    saturn.fetchContent = fetchContentMock

    content = await saturn.fetchContentWithFallback('some-cid-path')
    buffer = await concatChunks(content)

    assert.deepEqual(buffer, expectedContent)
    assert.strictEqual(fetchContentMock.mock.calls.length, 3)

    server.close()
    mock.reset()
  })
})
