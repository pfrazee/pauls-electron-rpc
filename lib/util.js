const duplexer = require('duplexer')

exports.isNodeProcess = function () {
  return !('electron' in process.versions)
}

const isRenderer = module.exports.isRenderer = function () {
  // running in a web browser
  if (typeof process === 'undefined') return true

  // node-integration is disabled
  if (!process) return true

  // We're in node.js somehow
  if (!process.type) return false

  return process.type === 'renderer'
}

module.exports.valueToIPCValue = function (v, wrap) {
  if (v && (ArrayBuffer.isView(v) || v instanceof ArrayBuffer)) {
    return Buffer.from(v)
  }
  if (wrap) {
    v = wrapObjects(v, wrap)
  }
  return v
}

module.exports.IPCValueToValue = function (v, wrap) {
  if (isRenderer() && v && v instanceof Uint8Array && v.buffer) {
    return v.buffer
  }
  return instantiateBuffers(v, wrap)
}

exports.fixErrorStack = function (err, errorStack, numToDrop=2) {
  if (err) {
    err.stack = takeFirstLines(err.stack, 1) + '\n' + dropFirstLines(errorStack, numToDrop)
    return err
  }
}

function takeFirstLines (str, n) {
  return str.split('\n').slice(0, n).join('\n')
}

function dropFirstLines (str, n) {
  return str.split('\n').slice(n).join('\n')
}

// patch duplex methods in
module.exports.duplex = function (w, r) {
  var stream = duplexer(w, r)
  stream.push = function (chunk, encoding) {
    return r.push(chunk, encoding)
  }

  w.on("finish", function() {
    stream.emit("finish")
  })

  w.destroy = w.destroy || (() => {})
  stream._writableState = w._writableState
  return stream
}

function wrapObjects (v, wrap) {
  var w = wrap(v)
  if (w) {
    return w
  }

  if (v && typeof v === 'object') {
    for (let k in v) {
      v[k] = wrapObjects(v[k], wrap)
    }
  }
  return v
}
function instantiateBuffers (v, wrap) {
  if (wrap) {
    var w = wrap(v)
    if (w) {
      return w
    }
  }

  if (v && typeof v === 'object') {
    if (v.type === 'Buffer' && 'data' in v) {
    return Buffer.from(v.data)
    }
    // recurse
    for (let k in v) {
      v[k] = instantiateBuffers(v[k], wrap)
    }
  }
  return v
}
