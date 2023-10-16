export const isBrowser =
  typeof window !== 'undefined' && typeof window.document !== 'undefined'

export const isServiceWorker = typeof ServiceWorkerGlobalScope !== 'undefined'

export const isWebWorker = typeof DedicatedWorkerGlobalScope !== 'undefined'

export const isSharedWorker = typeof SharedWorkerGlobalScope !== 'undefined'

export const isBrowserContext = isBrowser || isServiceWorker || isWebWorker || isSharedWorker

export const isNode =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null
