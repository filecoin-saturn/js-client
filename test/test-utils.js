
// @ts-check

import { RestHandler, rest } from 'msw'
import { setupServer } from 'msw/node'
const HTTP_STATUS_OK = 200

/**
 *
 * @typedef {object} Node
 * @property {string} ip
 * @property {number} weight
 * @property {number} distance
 * @property {string} url
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
      weight: i,
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
 * @param {number} count - amount of nodes
 * @param {string} orchUrl - orchestratorUrl
 * @param {string} originDomain - saturn origin domain
 * @param {number} delay - request delay in ms
 * @returns {RestHandler<any>}
 */
export function mockOrchHandler (count, orchUrl, originDomain, delay = 0) {
  if (!orchUrl.startsWith('http')) {
    orchUrl = `https://${orchUrl}`
  }

  const nodes = generateNodes(count, originDomain)
  return rest.get(orchUrl, (req, res, ctx) => {
    return res(
      ctx.status(HTTP_STATUS_OK),
      ctx.delay(delay || 0),
      ctx.json(nodes)
    )
  })
}

/**
 * Generates mock servers to act as L1 nodes.
 *
 * @param {number} count - amount of nodes to mock
 * @param {string} originDomain - saturn origin domain.
 * @returns {RestHandler<any>[]}
 */
export function mockNodesHandlers (count, originDomain) {
  const nodes = generateNodes(count, originDomain)

  const handlers = nodes.map((node) => {
    return rest.get(node.url, (req, res, ctx) => {
      return res(
        ctx.status(HTTP_STATUS_OK),
        ctx.json({ data: 'Test Block' })
      )
    })
  })
  return handlers
}

/**
 * @param {RestHandler<any>[]} handlers - amount of nodes to mock
 */
export function getMockServer (handlers) {
  return setupServer(...handlers)
}
