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
    return url.href
  }
  return url
}
