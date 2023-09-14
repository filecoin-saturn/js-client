import toIterable from 'browser-readablestream-to-it'

export function asAsyncIterable (readable) {
  return Symbol.asyncIterator in readable ? readable : toIterable(readable)
}

export async function asyncIteratorToBuffer (asyncIterator) {
  const chunks = []
  let totalSize = 0

  for await (const chunk of asyncIterator) {
    const buffer = new Uint8Array(chunk)
    chunks.push(buffer)
    totalSize += buffer.byteLength
  }

  const result = new Uint8Array(totalSize)
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }

  return result
}
