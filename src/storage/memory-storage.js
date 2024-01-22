// @ts-check

/**
 * @function memoryStorage
 * @returns {Promise<import('./index.js').Storage>}
 */
export async function memoryStorage () {
  const storageObject = {}

  return {
    get: async (key) => storageObject[key],
    set: async (key, value) => { storageObject[key] = value },
    delete: async (key) => { delete storageObject[key] }
  }
}
