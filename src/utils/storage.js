// @ts-check

import { openDB } from 'idb'

const DEFAULT_IDB_VERSION = 1
const DEFAULT_IDB_STORAGE_NAME = 'saturn-db'
const DEFAULT_SATURN_STORAGE_NAME = 'saturn-client'

/**
 * @typedef {object} Storage
 * @property {function():boolean} check - Checks if the provided Storage is accessible
 * @property {function(string):Promise<any>} get - Retrieves the value associated with the key.
 * @property {function(string,any):Promise<void>} set - Sets a new value for the key.
 * @property {function(string):Promise<any>} delete - Deletes the value associated with the key.
 */

/**
 * @function indexedDbStorage
 * @returns {Storage}
 */
export function indexedDbStorage () {
  const indexedDbExists = window?.indexedDB
  let dbPromise
  if (indexedDbExists) {
    dbPromise = openDB(DEFAULT_IDB_STORAGE_NAME, DEFAULT_IDB_VERSION, {
      upgrade (db) {
        db.createObjectStore(DEFAULT_SATURN_STORAGE_NAME)
      }
    })
  }

  return {
    check: () => Boolean(indexedDbExists),
    get: async (key) => indexedDbExists && (await dbPromise).get(DEFAULT_SATURN_STORAGE_NAME, key),
    set: async (key, value) => indexedDbExists && (await dbPromise).put(DEFAULT_SATURN_STORAGE_NAME, value, key),
    delete: async (key) => indexedDbExists && (await dbPromise).delete(DEFAULT_SATURN_STORAGE_NAME, key)
  }
}
