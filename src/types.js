
/**
 * @module types */

/**
 *
 * @typedef {object} Node
 * @property {string} id
 * @property {string} ip
 * @property {number} weight
 * @property {number} distance
 * @property {string} url
 */

/**
 * Common options for fetch functions.
 *
 * @typedef {object} FetchOptions
 * @property {Node[]} [nodes] - An array of nodes.
 * @property {('car'|'raw')} [format] - The format of the fetched content.
 * @property {boolean} [originFallback] - Is this a fallback to the customer origin
 * @property {boolean} [raceNodes] - Does the fetch race multiple nodes on requests.
 * @property {string} [customerFallbackURL] - Customer Origin that is a fallback.
 * @property {number} [connectTimeout=5000] - Connection timeout in milliseconds.
 * @property {number} [downloadTimeout=0] - Download timeout in milliseconds.
 * @property {AbortController} [controller]
 */

export {}
