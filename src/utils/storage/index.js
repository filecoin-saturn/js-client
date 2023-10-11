
// @ts-check

import { indexedDbStorage } from './indexed-db-storage.js'
import { memoryStorage } from './memory-storage.js'

/**
 * @typedef {object} Storage
 * @property {function(string):Promise<any>} get - Retrieves the value associated with the key.
 * @property {function(string,any):Promise<void>} set - Sets a new value for the key.
 * @property {function(string):Promise<any>} delete - Deletes the value associated with the key.
 */

export {
  indexedDbStorage,
  memoryStorage
}
