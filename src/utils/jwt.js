import { base64 } from 'multiformats/bases/base64'
import { bytes } from 'multiformats'

const JWT_KEY = 'strn/jwt'

const memoryStorage = {}

function getFromStorage () {
  try {
    return window.localStorage.getItem(JWT_KEY)
  } catch (e) {
    return memoryStorage[JWT_KEY]
  }
}

function setInStorage (jwt) {
  try {
    window.localStorage.setItem(JWT_KEY, jwt)
  } catch (e) {
    memoryStorage[JWT_KEY] = jwt
  }
}

export function isJwtValid (jwt) {
  if (!jwt) return false
  const { exp } = JSON.parse(bytes.toString(base64.decode('m' + jwt.split('.')[1])))
  return Date.now() < exp * 1000
}

export async function getJWT (opts) {
  const jwt = getFromStorage()
  if (isJwtValid(jwt)) return jwt

  const { clientKey, authURL } = opts
  const url = `${authURL}?clientKey=${clientKey}`

  const result = await fetch(url)
  const { token } = await result.json()

  setInStorage(token)

  return token
}
