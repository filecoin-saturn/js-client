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
