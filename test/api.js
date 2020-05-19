const { Readable, Writable } = require('stream')
const {duplex} = require('../lib/util')
const zerr = require('zerr')
const CustomError = zerr('CustomError')

module.exports = mainWindow => ({
  // sync methods
  addOneSync: n => n + 1,
  errorSync: () => { throw new Error('oh no!') },
  disallowedMethodSync: () => true,

  // async methods
  addOne: (n, cb) => cb(null, n + 1),
  getArrayBuffer: cb => cb(null, (new Uint8Array([0,1,2,3,4,6,7,8,9]))),
  sendArrayBuffer: (buf, cb) => {cb(null, buf)},
  error: cb => cb(new Error('oh no!')),
  timeout: cb => setTimeout(cb, 5e3),
  disallowedMethod: cb => cb(true),

  // promise methods
  addOnePromise: n => Promise.resolve(n + 1),
  addOnePromiseButReturnNotPromise: n => n + 1,
  getArrayBufferPromise: () => Promise.resolve((new Uint8Array([0,1,2,3,4,6,7,8,9]))),
  sendArrayBufferPromise: buf => Promise.resolve(buf),
  errorPromise: () => Promise.reject(new Error('oh no!')),
  customErrorPromise: () => Promise.reject(new CustomError('oh no!')),
  errorWithAttrPromise: () => {
    var err = new Error('oh no!')
    err.attr = 'foo'
    return Promise.reject(err)
  },
  timeoutPromise: () => new Promise((resolve, reject) => setTimeout(resolve, 5e3)),

  // readable methods
  goodReadable: n => {
    var readable = new Readable({objectMode: true, read() {}})
    readable.push(''+n)
    readable.push(''+(n+1))
    readable.push(''+(n+2))
    readable.push(''+(n+3))
    readable.push(null)
    return readable
  },
  goodObjectmodeReadable: n => {
    var readable = new Readable({ objectMode: true, read() {} })
    readable.push(n)
    readable.push(n+1)
    readable.push(n+2)
    readable.push(n+3)
    readable.push(null)
    return readable
  },
  goodReadablePromise: n => {
    return new Promise(resolve => {
      setImmediate(() => {
        var readable = new Readable({objectMode: true, read() {} })
        resolve(readable)
        readable.push(''+n)
        readable.push(''+(n+1))
        readable.push(''+(n+2))
        readable.push(''+(n+3))
        readable.push(null)
      })
    })
  },
  goodAsyncReadable: n => {
    var readable = new Readable({ objectMode: true, read() {} })
    setImmediate(() => {
      readable.push(n)
      readable.push(n+1)
      readable.push(n+2)
      readable.push(n+3)
      readable.push(null)
    })
    return readable
  },
  continuousReadable: (label) => {
    var readable = new Readable({ objectMode: true, read() {} })
    var i = setInterval(() => readable.push('ping'), 5)
    readable.close = () => {
      clearInterval(i)
      readable.push(null)

      // inform the test runner
      mainWindow.webContents.send(label+'-close')
    }
    return readable
  },
  failingReadable: n => {
    var readable = new Readable({ objectMode: true, read() {} })
    setImmediate(() => {
      readable.emit('error', new Error('Oh no!'))
      readable.push(null)
    })
    return readable
  },
  failingReadablePromise: n => {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        reject(new Error('Oh no!'))
      })
    })
  },
  noReadable: n => undefined,
  exceptionReadable: n => {
    throw new Error('Oh no!')
  },

  // writable methods
  goodWritable: function (n) {
    var buffer = []
    var writable = new Writable({
      write (chunk, enc, next) {
        buffer.push(n + chunk)
        next()
      }
    })
    writable.on('finish', () => {
      this.sender.send('writable-end', buffer)
    })
    return writable
  },
  goodObjectmodeWritable: function (n) {
    var buffer = []
    var writable = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        buffer.push(n + chunk)
        next()
      }
    })
    writable.on('finish', () => {
      this.sender.send('writable-end', buffer)
    })
    return writable
  },
  goodObjectmodeDuplex: function (n) {
    var buffer = []
    var writable = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        buffer.push(n + chunk)
        next()
      }
    })
    writable.on('finish', () => {
      this.sender.send('writable-end', buffer)
    })

    var readable = new Readable({ objectMode: true, read() {} })
    readable.push(n)
    readable.push(n+1)
    readable.push(n+2)
    readable.push(n+3)
    return duplex(writable, readable)
  },
  goodObjectmodeDuplexReadOnly: function (n) {
    var buffer = []
    var writable = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        buffer.push(n + chunk)
        next()
      }
    })
    writable.on('finish', () => {
      this.sender.send('writable-end', buffer)
    })

    var readable = new Readable({ objectMode: true, read() {} })
    return duplex(writable, readable)
  },
  goodObjectmodeDuplexWriteOnly: function (n) {
    var buffer = []
    var writable = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        buffer.push(chunk)
        next()
      }
    })
    writable.on('finish', () => {
      this.sender.send('writable-end', buffer)
    })

    var readable = new Readable({ objectMode: true, read() {} })
    readable.push(n)
    readable.push(n+1)
    readable.push(n+2)
    readable.push(n+3)
    return duplex(writable, readable)
  },
  goodDuplexClosesReadable: function (n) {
    var buffer = []
    var writable = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        buffer.push(chunk)
        next()
      }
    })

    var readable = new Readable({ objectMode: true, read() {} })
    readable.push(null)
    var d = duplex(writable, readable)
    setTimeout(() => readable.push(null), 50)
    return d
  },
  goodDuplexClosesWritable: function (n) {
    var buffer = []
    var writable = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        buffer.push(chunk)
        next()
      }
    })

    var readable = new Readable({ objectMode: true, read() {} })
    var d = duplex(writable, readable)
    setTimeout(() => writable.end(), 50)
    return d
  },

  continuousDuplexReadable: (label) => {
    var readable = new Readable({ objectMode: true, read() {} })
    var i = setInterval(() => readable.push('ping'), 5)

    var writable = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        next()
      }
    })

    var d = duplex(writable, readable)
    d.close = () => {
      clearInterval(i)
      readable.push(null)

      // inform the test runner
      mainWindow.webContents.send(label+'-close')
    }
    return d
  },
  failingDuplexPromise: n => {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        reject(new Error('Oh no!'))
      })
    })
  },
  noDuplex: n => undefined,
  exceptionDuplex: n => {
    throw new Error('Oh no!')
  },

  failingDuplexReadable: n => {
    var readable = new Readable({ objectMode: true, read() {} })
    setImmediate(() => {
      readable.emit('error', new Error('Oh no!'))
      readable.push(null)
    })

    var writable = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        next()
      }
    })
    return duplex(writable, readable)
  },

  failingDuplexWritable: n => {
    var readable = new Readable({ objectMode: true, read() {} })
    var writable = new Writable({
      write (chunk, enc, next) {}
    })

    var d = duplex(writable, readable)
    setImmediate(() => {
      writable.emit('error', new Error('Oh no!'))
    })
    return d
  },

  failingWritable: n => {
    var writable = new Writable({
      write (chunk, enc, next) {}
    })
    setImmediate(() => {
      writable.emit('error', new Error('Oh no!'))
    })
    return writable
  },
  noWritable: n => undefined,
  exceptionWritable: n => {
    throw new Error('Oh no!')
  }
})