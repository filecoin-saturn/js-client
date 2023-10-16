import { base64 } from 'multiformats/bases/base64'
import { bytes } from 'multiformats'

const JWT_KEY = 'strn/jwt'

/**
 * @param {string} jwt
 */
export function isJwtValid (jwt) {
  if (!jwt) return false
  const { exp } = JSON.parse(bytes.toString(base64.decode('m' + jwt.split('.')[1])))
  return Date.now() < exp * 1000
}

/**
 * @param {object} opts
 * @param {string} opts.clientKey
 * @param {string} opts.authURL
 * @param {import('../storage/index.js').Storage} storage
 * @returns {Promise<string>}
 */
export async function getJWT (opts, storage) {
  try {
    const jwt = await storage.get(JWT_KEY)
    if (isJwtValid(jwt)) return jwt
  } catch (e) {
  }

  const { clientKey, authURL } = opts
  const url = `${authURL}?clientKey=${clientKey}`

  const result = await fetch(url)
  const { token, message } = await result.json()

  if (!token) throw new Error(message || 'Failed to refresh jwt')

  try {
    await storage.set(JWT_KEY, token)
  } catch (e) {
  }

  return token
}
