const EventEmitter = require('events')
const { Readable, Writable } = require('stream')
const { ipcRenderer } = require('electron')

module.exports = function (channelName, manifest, opts) {
  var api = new EventEmitter()
  var asyncCbs = [] // active asyncs' cbs, waiting for a response
  var asyncCbTimeouts = {} // timers for async call timeouts
  var streams = [] // active streams
  opts = opts || {}
  if (typeof opts.timeout == 'undefined')
    opts.timeout = 30e3

  // api method generators
  var createAPIMethod = {
    sync: methodName => {
      return (...args) => {
        // send message
        var { success, error } = ipcRenderer.sendSync(channelName, methodName, 0, ...args)

        // handle response
        if (success)
          return success
        if (error)
          throw new Error(error)
      }
    },
    async: methodName => {
      return (...args) => {
        // track the cb
        var requestId = asyncCbs.length
        var cb = (typeof args[args.length - 1] == 'function') ? args.pop() : (()=>{})
        asyncCbs.push(cb)
        if (opts.timeout)
          asyncCbTimeouts[requestId] = setTimeout(onTimeout, opts.timeout, requestId)

        // send message
        ipcRenderer.send(channelName, methodName, requestId, ...args)
      }
    },
    readable: methodName => {
      return (...args) => {
        // send message
        var requestId = streams.length
        var { success, error } = ipcRenderer.sendSync(channelName, methodName, requestId, ...args)

        // handle response
        if (success) {
          // hook up the readable
          let r = new Readable({
            objectMode: true,
            read() {}
          })
          r.close = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-close', requestId, ...args)
          streams.push(r)
          return r
        }
        if (error)
          throw new Error(error)
      }
    },
    writable: methodName => {
      return (...args) => {
        // send message
        var requestId = streams.length
        var { success, error } = ipcRenderer.sendSync(channelName, methodName, requestId, ...args)

        // handle response
        if (success) {
          // hook up the writable
          let w = new Writable({
            objectMode: true,
            write (chunk, enc, next) {
              ipcRenderer.sendSync(channelName, 'stream-request-write', requestId, chunk, enc)
              next()
            }
          })
          w.end   = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-end', requestId, ...args)
          w.close = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-close', requestId, ...args)
          streams.push(w)
          return w
        }
        if (error)
          throw new Error(error)
      }
    },
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
      return onCbReply(requestId, args)

    // handle stream messages
    if (msgType.startsWith('stream-')) {
      var stream = streams[requestId]
      if (!stream)
        return api.emit('error', new Error('Stream message came from main process for a nonexistant stream'), arguments)

      // Event: 'data'
      if (msgType == 'stream-data')
        return stream.push(args[0])

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
          stream.emit('error', new Error(args[0]))
        if (msgType == 'stream-end')
          stream.emit('end')
        if (msgType == 'stream-finish')
          stream.emit('finish')

        // stop tracking the stream
        streams[requestId] = null
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
    if (!cb)
      return api.emit('error', new Error('Async reply came from main process for a nonwaiting request'), requestId, args)

    // stop tracking the cb
    asyncCbs[requestId] = null
    if (asyncCbTimeouts[requestId])
      clearTimeout(asyncCbTimeouts[requestId])

    // turn the error into an Error object
    if (args[0])
      args[0] = new Error(args[0])

    // call and done
    cb(...args)
    return
  }

  function onTimeout (requestId) {
    onCbReply(requestId, ['Timed out'])
  }

  return api
}