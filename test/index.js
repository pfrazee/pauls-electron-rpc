const { Readable, Writable } = require('stream')
const { app, BrowserWindow } = require('electron')
const zerr = require('zerr')
const rpc = require('../')
const manifest = require('./manifest')

// setup window

var mainWindow
function createWindow () {
  mainWindow = new BrowserWindow({width: 800, height: 600})
  mainWindow.loadURL(`file://${__dirname}/renderer-runner.html`)
}
app.on('ready', createWindow)
app.on('window-all-closed', function () {
  app.quit()
})

// export api

const CustomError = zerr('CustomError')

function globalPermissionCheck (event, methodName, args) {
  if (methodName === 'disallowedMethodSync') return false
  if (methodName === 'disallowedMethod') return false
  return true
}

rpc.exportAPI('test', manifest, {
  // sync methods
  addOneSync: n => n + 1,
  errorSync: //() => { throw new Error('oh no!') },
  () =>
  	{
		let error = new Error('oh no!')
		error.code = 104;
		throw error
	},
  disallowedMethodSync: () => true,

  // async methods
  addOne: (n, cb) => cb(null, n + 1),
  getArrayBuffer: cb => cb(null, (new Uint8Array([0,1,2,3,4,6,7,8,9])).buffer),
  sendArrayBuffer: (buf, cb) => {cb(null, buf)},
  error: cb =>
  {
	  let error = new Error('oh no!')
	  error.code = 104;

	  return cb( error )
  },
  timeout: cb => setTimeout(cb, 5e3),
  disallowedMethod: cb => cb(true),

  // promise methods
  addOnePromise: n => Promise.resolve(n + 1),
  getArrayBufferPromise: () => Promise.resolve((new Uint8Array([0,1,2,3,4,6,7,8,9])).buffer),
  sendArrayBufferPromise: buf => Promise.resolve(buf),
  errorPromise: () =>
  	{
		let error = new Error('oh no!')
		error.code = 104;
		return Promise.reject( error )
	},
  customErrorPromise: () => Promise.reject(new CustomError('oh no!')),
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
	  let error = new Error('oh no!')
	  error.code = 104;
      readable.emit('error', error )
      readable.push(null)
    })
    return readable
  },
  failingReadablePromise: n => {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
		let error = new Error('oh no!')
		error.code = 104;
        reject( error )
      })
    })
  },
  noReadable: n => undefined,
  exceptionReadable: n => {
	let error = new Error('oh no!')
	error.code = 104;
    throw error
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
  failingWritable: n => {
    var writable = new Writable({
      write (chunk, enc, next) {}
    })
    setImmediate(() => {
		let error = new Error('oh no!')
  	  error.code = 104;
      writable.emit('error', error )
    })
    return writable
  },
  noWritable: n => undefined,
  exceptionWritable: n => {
	let error = new Error('oh no!')
	error.code = 104;
    throw error;
  }
}, globalPermissionCheck)
