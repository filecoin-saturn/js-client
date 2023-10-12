
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'

import Saturn from '../src/index.js'
import { generateNodes, getMockServer, mockOrchHandler } from './test-utils.js'

const TEST_DEFAULT_ORCH = 'https://orchestrator.strn.pl/nodes?maxNodes=100'
const TEST_NODES_LIST_KEY = 'saturn-nodes'
const TEST_ORIGIN_DOMAIN = 'saturn.ms'
const CLIENT_KEY = 'key'
describe('Client Fallback', () => {
  test('Nodes are loaded from the orchestrator if no storage is passed', async (t) => {
    const handlers = [
      mockOrchHandler(2, TEST_DEFAULT_ORCH, TEST_ORIGIN_DOMAIN)
    ]
    const server = getMockServer(handlers)
    server.listen()

    const expectedNodes = generateNodes(2, TEST_ORIGIN_DOMAIN)

    // No Storage is injected
    const saturn = new Saturn({ clientKey: CLIENT_KEY })
    const mockOpts = { orchURL: TEST_DEFAULT_ORCH }

    await saturn._loadNodes(mockOpts)

    // Assert that the loaded nodes are the expected ones.
    assert.deepEqual(saturn.nodes, expectedNodes)

    server.close()
  })

  test('Storage is invoked correctly when supplied', async (t) => {
    const handlers = [
      mockOrchHandler(2, TEST_DEFAULT_ORCH, 'saturn.ms')
    ]
    const server = getMockServer(handlers)
    server.listen()

    const expectedNodes = generateNodes(2, TEST_ORIGIN_DOMAIN)

    // Mocking storage object
    const mockStorage = {
      get: async (key) => null,
      set: async (key, value) => null,
      delete: async (key) => null
    }
    t.mock.method(mockStorage, 'get')
    t.mock.method(mockStorage, 'set')

    const saturn = new Saturn({ storage: mockStorage, clientKey: CLIENT_KEY })

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
      mockOrchHandler(2, TEST_DEFAULT_ORCH, 'saturn.ms', 4000)
    ]
    const server = getMockServer(handlers)
    server.listen()

    const expectedNodes = generateNodes(4, TEST_ORIGIN_DOMAIN)

    // Mocking storage object
    const mockStorage = {
      get: async (key) => { return Promise.resolve(expectedNodes.slice(2, 4)) },
      set: async (key, value) => { return null }
    }
    t.mock.method(mockStorage, 'get')
    t.mock.method(mockStorage, 'set')

    const saturn = new Saturn({ storage: mockStorage, clientKey: CLIENT_KEY })

    // Mocking options
    const mockOpts = { orchURL: TEST_DEFAULT_ORCH }

    await saturn._loadNodes(mockOpts)

    // Assert that all the storage methods were called twice.
    assert.strictEqual(mockStorage.set.mock.calls.length, 2)
    assert.strictEqual(mockStorage.get.mock.calls.length, 2)

    // Assert that the set method was invoked with the correct params.
    assert.deepStrictEqual(mockStorage.set.mock.calls[0].arguments, [TEST_NODES_LIST_KEY, expectedNodes.slice(0, 2)])

    assert.deepEqual(saturn.nodes, expectedNodes.slice(0, 2))
  })
})
