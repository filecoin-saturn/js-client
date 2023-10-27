export class VerificationError extends Error {
  constructor (message) {
    super(message)
    this.name = 'VerificationError'
  }
}

export class TimeoutError extends Error {
  constructor (message) {
    super(message)
    this.name = 'TimeoutError'
  }
}

export function isErrorUnavoidable (error) {
  if (!error || typeof error.message !== 'string') return false

  const errorPatterns = [
    /file does not exist/,
    /Cannot read properties of undefined \(reading '([^']+)'\)/,
    /([a-zA-Z_.]+) is undefined/,
    /undefined is not an object \(evaluating '([^']+)'\)/
  ]

  for (const pattern of errorPatterns) {
    if (pattern.test(error.message)) {
      return true
    }
  }

  return false
}
