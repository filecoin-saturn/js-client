export const setTimeoutPromise = async ms => {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

export function promiseTimeout (promise, ms, timeoutErr) {
  let id
  const timeout = new Promise((resolve, reject) => {
    id = setTimeout(() => {
      const err = new Error('Promise timed out')
      reject(timeoutErr || err)
    }, ms)
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(id))
}
