module.exports = {
  // sync methods
  addOneSync: 'sync',
  errorSync: 'sync',
  disallowedMethodSync: 'sync',

  // async methods
  addOne: 'async',
  error: 'async',
  timeout: 'async',
  disallowedMethod: 'async',

  // promise methods
  addOnePromise: 'promise',
  errorPromise: 'promise',
  customErrorPromise: 'promise',
  timeoutPromise: 'promise',

  // readable methods
  goodReadable: 'readable',
  goodObjectmodeReadable: 'readable',
  goodAsyncReadable: 'readable',
  continuousReadable: 'readable',
  failingReadable: 'readable',
  noReadable: 'readable',
  exceptionReadable: 'readable',

  // writable methods
  goodWritable: 'writable',
  goodObjectmodeWritable: 'writable',
  failingWritable: 'writable',
  noWritable: 'writable',
  exceptionWritable: 'writable'
}