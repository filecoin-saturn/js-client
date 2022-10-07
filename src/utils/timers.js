export const setTimeoutPromise = async ms => {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}
