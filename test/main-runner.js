const tape = require('tape')
const multicb = require('multicb')
const zerr = require('zerr')
const { ipcMain } = require('electron')
const rpc = require('../')
const manifest = require('./manifest')
const CustomError = zerr('CustomError')

module.exports = wc => {
  // import api

  var api = rpc.importAPI('test-renderer', manifest, { wc, timeout: 1e3, errors: {CustomError} })

  // run tests

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

  tape('async array buffer method', t => {
    api.getArrayBuffer((err, buf) => {
      if (err) throw err
      t.ok(Buffer.isBuffer(buf))
      t.ok(Buffer.from([0,1,2,3,4,6,7,8,9]).equals(buf))

      api.sendArrayBuffer(Buffer.from([0,1,2,3,4,6,7,8,9]), (err, buf) => {
        if (err) throw err
        t.ok(Buffer.isBuffer(buf))
        t.ok(Buffer.from([0,1,2,3,4,6,7,8,9]).equals(buf))
        t.end()
      })
    })
  })

  tape('async error', t => {
    api.error(err => {
      t.ok(err, 'Error returned: '+err.toString())
      t.end()
    })
  })

  tape('async timeout', t => {
    api.timeout(err => {
      t.ok(err, 'Error returned: '+err.toString())
      t.end()
    })
  })

  tape('disallowed async method', t => {
    api.disallowedMethod(err => {
      t.ok(err, 'Error returned: '+err.toString())
      t.end()
    })
  })

  tape('promise method', t => {
    Promise.all([
      api.addOnePromise(5),
      api.addOnePromise(0),
      api.addOnePromise(null),
      api.addOnePromise('asdf')
    ]).then(values => {
      t.equal(values[0], 6, '5+1')
      t.equal(values[1], 1, '0+1')
      t.equal(values[2], 1, 'null+1')
      t.equal(values[3], 'asdf1', 'asdf+1')
      t.end()
    }).catch(e => { throw e })
  })

  tape('promise method that returns a value', t => {
    Promise.all([
      api.addOnePromiseButReturnNotPromise(5),
      api.addOnePromiseButReturnNotPromise(0),
      api.addOnePromiseButReturnNotPromise(null),
      api.addOnePromiseButReturnNotPromise('asdf')
    ]).then(values => {
      t.equal(values[0], 6, '5+1')
      t.equal(values[1], 1, '0+1')
      t.equal(values[2], 1, 'null+1')
      t.equal(values[3], 'asdf1', 'asdf+1')
      t.end()
    }).catch(e => { throw e })
  })

  tape('promise array buffer method', t => {
    api.getArrayBufferPromise().then(buf => {
      t.ok(Buffer.from([0,1,2,3,4,6,7,8,9]).equals(buf))
      t.ok(Buffer.isBuffer(buf))

      api.sendArrayBufferPromise(Buffer.from([0,1,2,3,4,6,7,8,9])).then(buf => {
        t.ok(Buffer.from([0,1,2,3,4,6,7,8,9]).equals(buf))
        t.ok(Buffer.isBuffer(buf))
        t.end()
      })
    })
  })

  tape('promise error', t => {
    api.errorPromise()
      .catch(err => {
        t.equal(err.toString(), 'Error: oh no!')
        t.equal(err.name, 'Error')
        t.equal(err.message, 'oh no!')
        t.end()
      })
  })

  tape('promise custom error', t => {
    api.customErrorPromise()
      .catch(err => {
        t.equal(err.toString(), 'CustomError: oh no!')
        t.equal(err.name, 'CustomError')
        t.equal(err.message, 'oh no!')
        t.end()
      })
  })

  tape('promise error with attr', t => {
    api.errorWithAttrPromise()
      .catch(err => {
        t.equal(err.toString(), 'Error: oh no!')
        t.equal(err.name, 'Error')
        t.equal(err.message, 'oh no!')
        t.equal(err.attr, 'foo')
        t.end()
      })
  })

  tape('promise timeout', t => {
    api.timeoutPromise()
      .catch(err => {
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

  tape('readable method 3 (promise)', t => {
    var counter = 5
    var r = api.goodReadablePromise(counter)
    r.on('data', n => t.equal(+n, counter++))
    r.on('error', err => { throw err })
    r.on('end', () => {
      t.end()
    })
  })

  tape('readable method 4 (async)', t => {
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

  tape('readable error (promise)', t => {
    var r = api.failingReadablePromise()
    r.on('error', err => {
      t.ok(err, 'Error emitted: '+err.toString())
      t.end()
    })
  })

  tape('readable not returned', t => {
    var r = api.noReadable()
    t.equal(typeof r, 'object')
    r.on('error', err => {
      t.ok(err, 'Error emitted: '+err.toString())
      t.end()
    })
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
    ipcMain.once('writable-end', (event, data) => {
      t.deepEqual(data, ['51','52','53','54','55'])
      t.end()
    })
    w.write('1')
    w.write('2')
    w.write('3')
    w.write('4')
    w.write('5')
    w.end()
  })

  tape('writable method 2 (object mode)', t => {
    var w = api.goodObjectmodeWritable(5)
    ipcMain.once('writable-end', (event, data) => {
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
    t.equal(typeof w, 'object')
    w.on('error', err => {
      t.ok(err, 'Error emitted: '+err.toString())
      t.end()
    })
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

  tape('duplex method (object mode)', t => {
    var d = api.goodObjectmodeDuplex(5)
    var counter = 5
    d.on('data', n => {
      t.equal(n, counter++)

      if(n >= 8) {
        d.write(1)
        d.write(2)
        d.write(3)
        d.write(4)
        d.write(5)
        d.end()
      }
    })
    d.on('error', err => { throw err })
    ipcMain.once('writable-end', (event, data) => {
      t.deepEqual(data, [6,7,8,9,10])
      t.end()
    })
  })

  tape('duplex method write from import side only', t => {
    var d = api.goodObjectmodeDuplexReadOnly(5)
    d.on('data', n => {
      t.notOk()
    })

    d.write(1)
    d.write(2)
    d.write(3)
    d.write(4)
    d.write(5)
    d.end()
    d.on('error', err => { throw err })
    ipcMain.once('writable-end', (event, data) => {
      t.deepEqual(data, [6,7,8,9,10])
      t.end()
    })
  })

  tape('duplex method write from export side only', t => {
    var d = api.goodObjectmodeDuplexWriteOnly(5)
    var counter = 5
    d.on('data', n => {
      t.equal(n, counter++)
      if (n >= 8) {
        d.end()
      }
    })

    d.on('error', err => { throw err })
    ipcMain.once('writable-end', (event, data) => {
      t.deepEqual(data, [])
      t.end()
    })
  })
  tape('duplex readable close from client', t => {
    var d = api.continuousDuplexReadable()
    setTimeout(() => d.close(), 50)
    d.on('data', data => console.log(data))
    d.on('end', () => {
      t.ok(true, 'Close() ends the streamp')
      t.end()
    })
  })

  tape('duplex close readable from server', t => {
    var d = api.goodDuplexClosesReadable()
    var i = setInterval(() => d.push('ping'), 5)

    d.on('data', data => console.log(data))
    d.on('end', () => {
      clearInterval(i)
      t.ok(true, 'Close() ends the streamp')
      t.end()
    })
  })

  tape('duplex close writable from server', t => {
    var d = api.goodDuplexClosesWritable()
    var i = setInterval(() => d.push('ping'), 5)

    d.on('data', data => console.log(data))
    d.on('finish', () => {
      clearInterval(i)
      t.ok(true, 'end() ends the streamp')
      t.end()
    })
  })

  // duplex error
  tape('duplex error (promise)', t => {
    var r = api.failingDuplexPromise()
    r.on('error', err => {
      t.ok(err, 'Error emitted: '+err.toString())
      t.end()
    })
  })

  tape('duplex readable not returned', t => {
    var r = api.noDuplex()
    t.equal(typeof r, 'object')
    r.on('error', err => {
      t.ok(err, 'Error emitted: '+err.toString())
      t.end()
    })
  })

  tape('duplex readable exception', t => {
    try {
      api.exceptionDuplex()
      throw 'should not reach this point'
    } catch (e) {
      t.ok(e, 'Exception thrown: '+e.toString())
    }
    t.end()
  })

  // duplex read-side error
  tape('duplex readable error', t => {
    var r = api.failingDuplexReadable()
    r.on('error', err => {
      t.ok(err, 'Error emitted: '+err.toString())
      t.end()
    })
  })

  tape('duplex writable error', t => {
    var d = api.failingDuplexWritable()
    d.on('error', err => {
      t.ok(err, 'Error emitted: '+err.toString())
      t.end()
    })
    d.write('1')
    d.write('2')
    d.write('3')
    d.write('4')
    d.write('5')
    d.end()
  })
}
