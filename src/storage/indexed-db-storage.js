// @ts-check

import { openDB } from 'idb'

const DEFAULT_IDB_VERSION = 1
const DEFAULT_IDB_STORAGE_NAME = 'saturn-db'
const DEFAULT_SATURN_STORAGE_NAME = 'saturn-client'

/**
 * @function indexedDbStorage
 * @returns {import('./index.js').Storage}
 */
export function indexedDbStorage () {
  const indexedDbExists = (typeof self !== 'undefined') && self?.indexedDB
  let dbPromise
  if (indexedDbExists) {
    dbPromise = openDB(DEFAULT_IDB_STORAGE_NAME, DEFAULT_IDB_VERSION, {
      upgrade (db) {
        db.createObjectStore(DEFAULT_SATURN_STORAGE_NAME)
      }
    })
  }

  return {
    get: async (key) => indexedDbExists && (await dbPromise).get(DEFAULT_SATURN_STORAGE_NAME, key),
    set: async (key, value) => indexedDbExists && (await dbPromise).put(DEFAULT_SATURN_STORAGE_NAME, value, key),
    delete: async (key) => indexedDbExists && (await dbPromise).delete(DEFAULT_SATURN_STORAGE_NAME, key)
  }
}
