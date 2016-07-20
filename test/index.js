const { Readable, Writable } = require('stream')
const { app, BrowserWindow } = require('electron')
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

rpc.exportAPI('test', manifest, {
  // sync methods
  addOneSync: n => n + 1,
  errorSync: () => { throw new Error('oh no!') },

  // async methods
  addOne: (n, cb) => cb(null, n + 1),
  error: cb => cb(new Error('oh no!')),

  // readable methods
  goodReadable: n => {
    var readable = new Readable({ read() {} })
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