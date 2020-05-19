const duplexer = require('duplexer')

exports.isNodeProcess = function () {
  return !('electron' in process.versions) || process.env.ELECTRON_RUN_AS_NODE == 1
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

module.exports.valueToIPCValue = function (v) {
  // TODO- needed?
  return v
}

module.exports.IPCValueToValue = function (v) {
  if (isRenderer()) return v
  return instantiateBuffers(v)
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

function instantiateBuffers (v) {
  if (!v) return v
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) {
    return Buffer.from(v)
  }
  if (v && typeof v === 'object') {
    if (v.type === 'Buffer' && 'data' in v) {
      return Buffer.from(v.data)
    }
    // recurse
    for (let k in v) {
      v[k] = instantiateBuffers(v[k])
    }
  }
  return v
}

