
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

exports.fixErrorStack = function (err, numToDrop=1) {
  if (err) {
    err.stack = dropFirstLines(err.stack, numToDrop)
    return err
  }
}

function dropFirstLines (str, n) {
  return str.split('\n').slice(n).join('\n')
}
