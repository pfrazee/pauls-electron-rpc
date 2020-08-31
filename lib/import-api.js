const EventEmitter = require('events')
const {Readable, Writable} = require('stream')
const {valueToIPCValue, IPCValueToValue, fixErrorStack, duplex, isRenderer} = require('./util')

module.exports = function (channelName, manifest, opts) {
  var api = new EventEmitter()
  var asyncCbs = [] // active asyncs' cbs, waiting for a response
  var asyncCbTimeouts = {} // timers for async call timeouts
  var streams = [] // active streams
  var streamErrorStacks = {}
  opts = opts || {}
  if (typeof opts.timeout == 'undefined') {
    opts.timeout = 30e3
  }

  var channel
  if (opts.proc) {
    // main process importing from a child_process
    channel = {
      sendSync (methodName, ...args) {
        throw new Error('Cannot import sync RPC methods from a child process')
      },
      send (methodName, requestId, ...args) {
        // console.log('import-api#send', {channelName, methodName, requestId, args})
        return opts.proc.send({channelName, methodName, requestId, args})
      },
      onMessage (cb) {
        opts.proc.on('message', (msg) => {
          var args = msg.args || []
          // console.log('import-api#onMessage', msg)
          cb(undefined, msg.msgType, msg.requestId, ...msg.args)
        })
      }
    }  
  } else if (opts.wc) {
    // main process importing from a renderer
    let {ipcMain} = require('electron')
    channel = {
      sendSync (methodName, ...args) {
        throw new Error('Cannot import sync RPC methods from a webContents')
      },
      send (methodName, requestId, ...args) {
        return opts.wc.send(channelName, methodName, requestId, ...args)
      },
      onMessage (cb) {
        ipcMain.on(channelName, (...args) => {
          if (args[0].sender === opts.wc) {
            cb(...args)
          }
        })
      }
    }   
  } else {
    // renderer import from the main process
    let {ipcRenderer} = require('electron')
    channel = {
      sendSync (methodName, ...args) {
        return ipcRenderer.sendSync(channelName, methodName, 0, ...args)
      },
      send (methodName, requestId, ...args) {
        return ipcRenderer.send(channelName, methodName, requestId, ...args)
      },
      onMessage (cb) {
        ipcRenderer.on(channelName, cb)
      }
    }
  }

  // api method generators
  var createAPIMethod = {
    sync: methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // send message
        var { success, error } = channel.sendSync(methodName, ...args)

        // handle response
        if (typeof success !== "undefined")
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
        channel.send(methodName, requestId, ...args)
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
        channel.send(methodName, requestId, ...args)

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
    r.close = (...args) => channel.send('stream-request-close', requestId, ...args)
    return r
  }

  function createWritable (requestId) {
    let w = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        channel.send('stream-request-write', requestId, chunk, enc)
        next()
      }
    })
    w.end   = (...args) => channel.send('stream-request-end', requestId, ...args)
    w.close = (...args) => channel.send('stream-request-close', requestId, ...args)
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
        channel.send('stream-request-write', requestId, chunk, enc)
        next()
      }
    })

    var stream = duplex(w, r)
    stream.end   = (...args) => channel.send('stream-request-end', requestId, ...args)
    stream.close = (...args) => channel.send('stream-request-close', requestId, ...args)
    return stream
  }

  function handleStream (createStream) {
    return methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // send message
        var requestId = streams.length
        channel.send(methodName, requestId, ...args)

        // create the stream optimistically
        // if there are any errors they will be emitted as stream-errors
        let stream = createStream(requestId)
        streams.push(stream)
        streamErrorStacks[streams.length - 1] = (new Error()).stack
        return stream
      }
    }
  }

  // create api
  for (let name in manifest) {
    let type = manifest[name]
    api[name] = createAPIMethod[type](name)
  }

  // wire up the message-handler
  channel.onMessage(function onIPCMessage (event, msgType, requestId, ...args) {
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
    var copy
    if (opts.errors) {
      var name = error.name
      if (typeof name === 'string' && name in opts.errors) {
        var ErrCons = opts.errors[name]
        copy = new ErrCons(error.message)
      }
    }
    if (!copy) copy = new Error(typeof error === 'string' ? error : error.message)
    if (error && typeof error === 'object') {
      Object.assign(copy, error)
    }
    return copy
  }

  return api
}
