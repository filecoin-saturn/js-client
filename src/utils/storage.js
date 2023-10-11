// @ts-check

import { openDB } from 'idb'

const DEFAULT_IDB_VERSION = 1
const DEFAULT_IDB_STORAGE_NAME = 'saturn-db'
const DEFAULT_SATURN_STORAGE_NAME = 'saturn-client'

/**
 * @typedef {object} Storage
 * @property {function(string):Promise<any>} get - Retrieves the value associated with the key.
 * @property {function(string,any):Promise<void>} set - Sets a new value for the key.
 * @property {function(string):Promise<any>} delete - Deletes the value associated with the key.
 */

/**
 * @function indexedDbStorage
 * @returns {Storage}
 */
export function indexedDbStorage () {
  const indexedDbExists = (typeof window !== 'undefined') && window?.indexedDB
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

/**
 * @function memoryStorage
 * @returns {Storage}
 */
export function memoryStorage () {
  const storageObject = {}

  return {
    get: (key) => Promise.resolve(storageObject[key]),
    set: (key, value) => {
      storageObject[key] = value
      return Promise.resolve()
    },
    delete: (key) => {
      delete storageObject[key]
      return Promise.resolve()
    }
  }
}
