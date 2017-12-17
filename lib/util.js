const duplexer = require('duplexer')

module.exports.valueToIPCValue = function (v) {
  if (v && (ArrayBuffer.isView(v) || v instanceof ArrayBuffer)) {
    return Buffer.from(v)
  }
  return v
}

module.exports.IPCValueToValue = function (v) {
  if (v && v instanceof Uint8Array && v.buffer) {
    return v.buffer
  }
  return v
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
