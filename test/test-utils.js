
// @ts-check

import { RestHandler, rest } from 'msw'
import { setupServer } from 'msw/node'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import fs from 'fs'
import { addHttpPrefix } from '../src/utils/url.js'

const HTTP_STATUS_OK = 200
const HTTP_STATUS_TIMEOUT = 504

const __dirname = dirname(fileURLToPath(import.meta.url))
process.env.TESTING = 'true'

/**
 * @typedef {import('../src/types.js').Node} Node
 */

/**
 * Generates sets of nodes based on orchestrator response. Nodes are generated deteriministically.
 *
 * @param {number} count
 * @param {string} originDomain - saturn origin domain
 * @returns {Node[]}
 */
export function generateNodes (count, originDomain) {
  const nodes = []
  for (let i = 0; i < count; i++) {
    const nodeIp = `node${i}`
    const node = {
      ip: nodeIp,
      weight: 50,
      distance: 100,
      url: `https://${nodeIp}.${originDomain}`
    }
    nodes.push(node)
  }
  return nodes
}

/**
 * Generates a mock handler to mimick Saturn's orchestrator /nodes endpoint.
 *
 * @param {string} cdnURL - orchestratorUrl
 * @param {number} delay - request delay in ms
 * @param {boolean} error
 * @returns {RestHandler<any>}
 */
export function mockSaturnOriginHandler (cdnURL, delay = 0, error = false) {
  cdnURL = addHttpPrefix(cdnURL)
  return rest.get(cdnURL, (req, res, ctx) => {
    if (error) {
      throw Error('Simulated Error')
    }
    const filepath = getFixturePath('hello.car')
    const fileContents = fs.readFileSync(filepath)
    return res(
      ctx.delay(delay),
      ctx.status(HTTP_STATUS_OK),
      ctx.body(fileContents)
    )
  })
}

/**
 * Generates a mock handler to mimick Saturn's orchestrator /nodes endpoint.
 *
 * @param {number} count - amount of nodes
 * @param {string} orchURL - orchestratorUrl
 * @param {string} originDomain - saturn origin domain
 * @param {number} delay - request delay in ms
 * @returns {RestHandler<any>}
 */
export function mockOrchHandler (count, orchURL, originDomain, delay = 0) {
  orchURL = addHttpPrefix(orchURL)

  const nodes = generateNodes(count, originDomain)
  return rest.get(orchURL, (req, res, ctx) => {
    return res(
      ctx.status(HTTP_STATUS_OK),
      ctx.delay(delay || 0),
      ctx.json(nodes)
    )
  })
}

/**
 * Generates a mock handler to mimick Saturn's orchestrator /nodes endpoint.
 *
 * @param {string} authURL - orchestratorUrl
 * @returns {RestHandler<any>}
 */
export function mockJWT (authURL) {
  authURL = addHttpPrefix(authURL)
  return rest.get(authURL, (req, res, ctx) => {
    const clientKey = req.url.searchParams.get('clientKey')
    if (clientKey) {
      return res(
        ctx.json({
          token: 'MOCK_JWT_TOKEN'
        })
      )
    } else {
      return res(
        ctx.json({
          token: null,
          message: 'Failed to refresh jwt'
        })
      )
    }
  })
}

/**
 * Generates mock servers to act as L1 nodes.
 *
 * @param {number} count - amount of nodes to mock
 * @param {string} originDomain - saturn origin domain.
 * @param {number} failures
 * @returns {RestHandler<any>[]}
 */
export function mockNodesHandlers (count, originDomain, failures = 0) {
  if (failures > count) {
    throw Error('failures number cannot exceed node count')
  }
  const nodes = generateNodes(count, originDomain)

  const handlers = nodes.map((node, idx) => {
    const url = `${node.url}/ipfs/:cid`
    return rest.get(url, (req, res, ctx) => {
      if (idx < failures) {
        return res(
          ctx.status(HTTP_STATUS_TIMEOUT)
        )
      }
      const filepath = getFixturePath('hello.car')
      const fileContents = fs.readFileSync(filepath)
      return res(
        ctx.status(HTTP_STATUS_OK),
        ctx.body(fileContents)
      )
    })
  })
  return handlers
}

export function getFixturePath (filename) {
  return resolve(__dirname, `./fixtures/${filename}`)
}

export async function concatChunks (itr) {
  const arr = []
  for await (const chunk of itr) {
    if (chunk instanceof Uint8Array) {
      arr.push(...chunk)
    } else {
      const uInt8ArrayChunk = new Uint8Array(chunk)
      arr.push(...uInt8ArrayChunk)
    }
  }
  return new Uint8Array(arr)
}

export const MSW_SERVER_OPTS = {
  onUnhandledRequest: 'bypass'
}
/**
 * @param {RestHandler<any>[]} handlers - amount of nodes to mock
 */
export function getMockServer (handlers) {
  return setupServer(...handlers)
}
