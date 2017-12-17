const EventEmitter = require('events')
const { Readable, Writable } = require('stream')
const { ipcRenderer } = require('electron')
const {valueToIPCValue, IPCValueToValue, fixErrorStack, duplex} = require('./util')

module.exports = function (channelName, manifest, opts) {
  var api = new EventEmitter()
  var asyncCbs = [] // active asyncs' cbs, waiting for a response
  var asyncCbTimeouts = {} // timers for async call timeouts
  var streams = [] // active streams
  var streamErrorStacks = {}
  opts = opts || {}
  if (typeof opts.timeout == 'undefined')
    opts.timeout = 30e3

  // api method generators
  var createAPIMethod = {
    sync: methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // send message
        var { success, error } = ipcRenderer.sendSync(channelName, methodName, 0, ...args)

        // handle response
        if (success)
          return IPCValueToValue(success)
        if (error)
          throw createError(error)
      }
    },
    async: methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // track the cb
        var errorStack = (new Error()).stack
        var requestId = asyncCbs.length
        var cb = (typeof args[args.length - 1] == 'function') ? args.pop() : (()=>{})
        asyncCbs.push((err, value) => {
          if (err) cb(fixErrorStack(err, errorStack))
          else cb(undefined, value)
        })
        if (opts.timeout)
          asyncCbTimeouts[requestId] = setTimeout(onTimeout, opts.timeout, requestId)

        // send message
        ipcRenderer.send(channelName, methodName, requestId, ...args)
      }
    },
    promise: methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // track the promise
        var errorStack = (new Error()).stack
        var requestId = asyncCbs.length
        var p = new Promise((resolve, reject) => {
          asyncCbs.push((err, value) => {
            if (err) reject(fixErrorStack(err, errorStack))
            else     resolve(value)
          })
        })
        if (opts.timeout)
          asyncCbTimeouts[requestId] = setTimeout(onTimeout, opts.timeout, requestId)

        // send message
        ipcRenderer.send(channelName, methodName, requestId, ...args)

        return p
      }
    },
    readable: handleStream(createReadable),
    writable: handleStream(createWritable),
    duplex: handleStream(createDuplex)
  }

  function createReadable (requestId) {
    // hook up the readable
    let r = new Readable({
      objectMode: true,
      read() {}
    })
    r.close = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-close', requestId, ...args)
    return r
  }

  function createWritable (requestId) {
    let w = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        ipcRenderer.sendSync(channelName, 'stream-request-write', requestId, chunk, enc)
        next()
      }
    })
    w.end   = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-end', requestId, ...args)
    w.close = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-close', requestId, ...args)
    return w
  }

  function createDuplex (requestId) {
    // hook up the readable
    let r = new Readable({
      objectMode: true,
      read() {}
    })
    let w = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        ipcRenderer.sendSync(channelName, 'stream-request-write', requestId, chunk, enc)
        next()
      }
    })

    var stream = duplex(w, r)
    stream.end   = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-end', requestId, ...args)
    stream.close = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-close', requestId, ...args)
    return stream
  }

  function handleStream (createStream) {
    return methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // send message
        var requestId = streams.length
        var { success, error } = ipcRenderer.sendSync(channelName, methodName, requestId, ...args)

        // handle response
        if (success) {
          let stream = createStream(requestId)
          streams.push(stream)
          streamErrorStacks[streams.length - 1] = (new Error()).stack
          return stream
        }
        if (error) {
          error = createError(error)
          error = fixErrorStack(error, error.stack, 3)
          throw error
        }
      }
    }
  }

  // create api
  for (let name in manifest) {
    let type = manifest[name]
    api[name] = createAPIMethod[type](name)
  }

  // wire up the message-handler
  ipcRenderer.on(channelName, function onIPCMessage (event, msgType, requestId, ...args) {
    // handle async replies
    if (msgType == 'async-reply')
      return onCbReply(requestId, args.map(IPCValueToValue))

    // handle stream messages
    if (msgType.startsWith('stream-')) {
      var stream = streams[requestId]
      if (!stream)
        return api.emit('error', new Error('Stream message came from main process for a nonexistant stream'), arguments)

      // Event: 'data'
      if (msgType == 'stream-data')
        return stream.push(IPCValueToValue(args[0]))

      // Event: 'readable'
      if (msgType == 'stream-readable')
        return stream.emit('readable')

      // Event: 'drain'
      if (msgType == 'stream-drain')
        return stream.emit('drain')

      // Event: 'close'
      if (msgType == 'stream-close')
        return stream.emit('close')

      // Event: 'end' or 'error'
      if (['stream-error', 'stream-end', 'stream-finish'].includes(msgType)) {
        // emit
        if (msgType == 'stream-error')
          stream.emit('error', fixErrorStack(createError(args[0]), streamErrorStacks[requestId]))
        if (msgType == 'stream-end')
          stream.emit('end')
        if (msgType == 'stream-finish')
          stream.emit('finish')

        // stop tracking the stream
        streams[requestId] = null
        streamErrorStacks[requestId] = null
        for (let eventName of stream.eventNames())
          stream.removeAllListeners(eventName)

        return
      }
    }

    // TODO: writable

    api.emit('error', new Error('Unknown message type'), arguments)
  })

  function onCbReply (requestId, args) {
    // find the cb
    var cb = asyncCbs[requestId]
    if (!cb) {
      return // caused by a timeout, or sent right before a page navigation, ignore
    }

    // stop tracking the cb
    asyncCbs[requestId] = null
    if (asyncCbTimeouts[requestId])
      clearTimeout(asyncCbTimeouts[requestId])

    // turn the error into an Error object
    if (args[0]) {
      args[0] = createError(args[0])
    }

    // call and done
    cb(...args)
    return
  }

  function onTimeout (requestId) {
    onCbReply(requestId, ['Timed out'])
  }

  function createError (error) {
    if (opts.errors) {
      var name = error.name || error
      if (typeof name === 'string' && name in opts.errors) {
        var ErrCons = opts.errors[name]
        return new ErrCons(error.message || error)
      }
    }
    return new Error(error.message || error)
  }

  return api
}
