// @ts-check

/**
 * @function memoryStorage
 * @returns {function():Promise<import('./index.js').Storage>}
 */
export function memoryStorage () {
  const storageObject = {}

  const storage = {
    get: async (key) => storageObject[key],
    set: async (key, value) => { storageObject[key] = value },
    delete: async (key) => { delete storageObject[key] }
  }
  return async () => storage
}
