var tape = require('tape')
var tape_dom = require('tape-dom')
var multicb = require('multicb')
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