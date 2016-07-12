const EventEmitter = require('events')
const { Readable, Writable } = require('stream')
const { ipcRenderer } = require('electron')

module.exports = function (channelName, manifest) {
  var api = new EventEmitter()
  var asyncCbs = [] // active asyncs' cbs, waiting for a response
  var readableStreams = [] // active readable streams

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

        // send message
        ipcRenderer.send(channelName, methodName, requestId, ...args)
      }
    },
    readable: methodName => {
      return (...args) => {
        // send message
        var requestId = readableStreams.length
        var { success, error } = ipcRenderer.sendSync(channelName, methodName, requestId, ...args)

        // handle response
        if (success) {
          // hook up the readable
          let r = new Readable({
            objectMode: true,
            read() {}
          })
          r.close = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-close', requestId, ...args)
          readableStreams.push(r)
          return r
        }
        if (error)
          throw new Error(error)
      }
    },
    // TODO: writable
  }

  // create api
  for (let name in manifest) {
    let type = manifest[name]
    api[name] = createAPIMethod[type](name)
  } 

  // wire up the message-handler
  ipcRenderer.on(channelName, function onIPCMessage (event, msgType, requestId, ...args) {
    // handle async replies
    if (msgType == 'async-reply') {
      // find the cb
      var cb = asyncCbs[requestId]
      if (!cb)
        return api.emit('error', new Error('Async reply came from main process for a nonwaiting request'), arguments)

      // stop tracking the cb
      asyncCbs[requestId] = null

      // turn the error into an Error object
      if (args[0])
        args[0] = new Error(args[0])

      // call and done
      cb(...args)
      return
    }

    // handle readable messages
    if (msgType.startsWith('stream-')) {
      var readableStream = readableStreams[requestId]
      if (!readableStream)
        return api.emit('error', new Error('Stream message came from main process for a nonexistant stream'), arguments)

      // Event: 'data'
      if (msgType == 'stream-data')
        return readableStream.push(args[0])

      // Event: 'error'
      if (msgType == 'stream-error')
        return readableStream.emit('error', new Error(args[0]))

      // Event: 'readable'
      if (msgType == 'stream-readable')
        return readableStream.emit('readable')

      // Event: 'close'
      if (msgType == 'stream-close')
        return readableStream.emit('close')

      // Event: 'end'
      if (msgType == 'stream-end') {
        readableStream.emit('end')

        // stop tracking the stream
        readableStreams[requestId] = null
        for (let eventName of readableStream.eventNames())
          readableStream.removeAllListeners(eventName)

        return
      }
    }

    // TODO: writable

    api.emit('error', new Error('Unknown message type'), arguments)
  })

  return api
}