var tape = require('tape')
var tape_dom = require('tape-dom')
var multicb = require('multicb')
var { ipcRenderer } = require('electron')
var rpc = require('../')
var manifest = require('./manifest')

// setup tape

tape_dom.installCSS()
tape_dom.stream(tape)

// import api

var api = rpc.importAPI('test', manifest)

// run tests
tape('sync method', t => {
  t.equal(api.addOneSync(5), 6, '5+1')
  t.equal(api.addOneSync(0), 1, '0+1')
  t.equal(api.addOneSync(null), 1, 'null+1')
  t.equal(api.addOneSync('asdf'), 'asdf1', 'asdf+1')
  t.end()
})

tape('sync error', t => {
  try {
    api.errorSync()
    throw 'should not reach this point'
  } catch (e) {
    t.ok(e, 'Exception thrown: '+e.toString())
  }
  t.end()
})

tape('async method', t => {
  var done = multicb({ pluck: 1, spread: true })
  api.addOne(5, done())
  api.addOne(0, done())
  api.addOne(null, done())
  api.addOne('asdf', done())
  done((err, a, b, c, d) => {
    if (err) throw err
    t.equal(a, 6, '5+1')
    t.equal(b, 1, '0+1')
    t.equal(c, 1, 'null+1')
    t.equal(d, 'asdf1', 'asdf+1')
    t.end()
  })
})

tape('async error', t => {
  api.error(err => {
    t.ok(err, 'Error returned: '+err.toString())
    t.end()
  })
})

tape('readable method 1', t => {
  var counter = 5
  var r = api.goodReadable(counter)
  r.on('data', n => t.equal(+n, counter++))
  r.on('error', err => { throw err })
  r.on('end', () => {
    t.end()
  })
})

tape('readable method 2 (object mode)', t => {
  var counter = 5
  var r = api.goodObjectmodeReadable(counter)
  r.on('data', n => t.equal(n, counter++))
  r.on('error', err => { throw err })
  r.on('end', () => {
    t.end()
  })
})

tape('readable method 3 (async)', t => {
  var counter = 5
  var r = api.goodAsyncReadable(counter)
  r.on('data', n => t.equal(n, counter++))
  r.on('error', err => { throw err })
  r.on('end', () => {
    t.end()
  })
})

tape('readable close from client', t => {
  var r = api.continuousReadable()
  setTimeout(() => r.close(), 50)
  r.on('data', data => console.log(data))
  r.on('end', () => {
    t.ok(true, 'Close() ends the streamp')
    t.end()
  })
})

tape('readable error', t => {
  var r = api.failingReadable()
  r.on('error', err => { 
    t.ok(err, 'Error emitted: '+err.toString())
    t.end()
  })
})

tape('readable not returned', t => {
  var r = api.noReadable()
  t.equal(typeof r, 'undefined')
  t.end()
})

tape('readable exception', t => {
  try {
    api.exceptionReadable()
    throw 'should not reach this point'
  } catch (e) {
    t.ok(e, 'Exception thrown: '+e.toString())
  }
  t.end()
})

tape('writable method 1', t => {
  var w = api.goodWritable(5)
  ipcRenderer.once('writable-end', (event, data) => {
    t.deepEqual(data, ['51','52','53','54','55'])
    t.end()
  })
  w.write(1)
  w.write(2)
  w.write(3)
  w.write(4)
  w.write(5)
  w.end()
})

tape('writable method 2 (object mode)', t => {
  var w = api.goodObjectmodeWritable(5)
  ipcRenderer.once('writable-end', (event, data) => {
    t.deepEqual(data, [6,7,8,9,10])
    t.end()
  })
  w.write(1)
  w.write(2)
  w.write(3)
  w.write(4)
  w.write(5)
  w.end()
})

tape('writable error', t => {
  var w = api.failingWritable()
  w.on('error', err => { 
    t.ok(err, 'Error emitted: '+err.toString())
    t.end()
  })
  w.write(1)
  w.write(2)
  w.write(3)
  w.write(4)
  w.write(5)
  w.end()
})

tape('writable not returned', t => {
  var w = api.noWritable()
  t.equal(typeof w, 'undefined')
  t.end()
})

tape('writable exception', t => {
  try {
    api.exceptionWritable()
    throw 'should not reach this point'
  } catch (e) {
    t.ok(e, 'Exception thrown: '+e.toString())
  }
  t.end()
})

// renderer-only tests
if (window.isRenderer) {
  tape('open readables close when the webview is destroyed', t => {
    var wv = document.createElement('webview')
    wv.id = 'readable-webview'
    wv.setAttribute('nodeintegration', true)
    wv.src = "./webview-runner.html#readable"
    document.body.appendChild(wv)

    wv.addEventListener('dom-ready', () => {
      console.log('readable webview loaded')

      ipcRenderer.once('destroytest-close', () => {
        t.ok(true, 'Stream was closed when webview was destroyed')
        t.end()
      })

      document.body.removeChild(wv)
    })
  })

  tape('open readables close when the webview is navigated', t => {
    var wv = document.createElement('webview')
    wv.id = 'readable-webview2'
    wv.setAttribute('nodeintegration', true)
    wv.src = "./webview-runner.html#readable"
    document.body.appendChild(wv)

    wv.addEventListener('dom-ready', () => {
      console.log('readable webview 2 loaded')

      ipcRenderer.once('destroytest-close', () => {
        document.body.removeChild(wv)
        t.ok(true, 'Stream was closed when webview navigated')
        t.end()
      })

      wv.loadURL('about:blank')
    })
  })
}