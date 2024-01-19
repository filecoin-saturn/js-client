// @ts-check

import { openDB } from 'idb'

const DEFAULT_IDB_VERSION = 1
const DEFAULT_IDB_STORAGE_NAME = 'saturn-db'
const DEFAULT_SATURN_STORAGE_NAME = 'saturn-client'

/**
 * @function indexedDbStorage
 * @returns {Promise<import('./index.js').Storage>}
 */
export async function indexedDbStorage () {
  const indexedDbExists = typeof self !== 'undefined' && self?.indexedDB
  let dbPromise

  if (!indexedDbExists) {
    throw Error('Indexed DB is not supported in this environment')
  }

  if (indexedDbExists) {
    dbPromise = await openDB(DEFAULT_IDB_STORAGE_NAME, DEFAULT_IDB_VERSION, {
      upgrade (db) {
        try {
          db.createObjectStore(DEFAULT_SATURN_STORAGE_NAME)
        } catch (error) {
          throw Error(`Cannot initialize indexed DB Object store, error: ${error}`)
        }
      }
    })
  }

  return {
    get: async (key) =>
      indexedDbExists &&
        (await dbPromise).get(DEFAULT_SATURN_STORAGE_NAME, key),
    set: async (key, value) =>
      indexedDbExists &&
        (await dbPromise).put(DEFAULT_SATURN_STORAGE_NAME, value, key),
    delete: async (key) =>
      indexedDbExists &&
        (await dbPromise).delete(DEFAULT_SATURN_STORAGE_NAME, key)
  }
}
