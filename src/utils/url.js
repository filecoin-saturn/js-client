// @ts-check

/**
 *
 * @param {URL} url
 * @returns {URL|string}
 */
export function parseUrl (url) {
  // This is a temp function to resolve URLs for mock testing
  // See issue here: https://github.com/mswjs/msw/issues/1597
  if (process.env.TESTING) {
    return url.toJSON()
  }
  return url
}

/**
 *
 * @param {string} url
 * @returns {string}
 */
export function addHttpPrefix (url) {
  // This is a temp function to resolve URLs for mock testing
  // See issue here: https://github.com/mswjs/msw/issues/1597
  if (!url.startsWith('http')) {
    url = `https://${url}`
  }
  return url
}
