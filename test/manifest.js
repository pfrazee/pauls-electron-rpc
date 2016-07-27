module.exports = {
  // sync methods
  addOneSync: 'sync',
  errorSync: 'sync',

  // async methods
  addOne: 'async',
  error: 'async',
  timeout: 'async',

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