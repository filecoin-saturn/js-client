export const createBandwidthLog = entry => ({
  nodeId: entry.nodeId,
  cacheHit: entry.cacheStatus === 'HIT',
  url: entry.url,
  localTime: entry.startTime,
  numBytesSent: entry.transferSize,
  range: null,
  requestDuration: (entry.endTime - entry.startTime) / 1000,
  requestId: entry.transferId,
  httpStatusCode: entry.httpStatusCode,
  httpProtocol: entry.httpProtocol,
  ifNetworkError: entry.ifError,
  ttfbMs: entry.ttfb ? (entry.ttfb - entry.startTime) : null,
})