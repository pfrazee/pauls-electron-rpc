const EventEmitter = require('events')
const { ipcRenderer } = require('electron')

module.exports = function (channelName, manifest) {
  var api = new EventEmitter()
  var asyncCbs = [] // active requests' cbs, waiting for a response

  // api method generators
  var createAPIMethod = {
    sync: (methodName) => {
      return (...args) => {
        var { success, error } = ipcRenderer.sendSync(channelName, methodName, 0, ...args)
        if (success)
          return success
        if (error)
          throw new Error(error)
      }
    },
    async: (methodName) => {
      return (...args) => {
        // track the cb
        var requestId = asyncCbs.length
        var cb = (typeof args[args.length - 1] == 'function') ? args.pop() : (()=>{})
        asyncCbs.push(cb)

        // send message
        ipcRenderer.send(channelName, methodName, requestId, ...args)
      }
    }
    // TODO: readable
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
      var cb = asyncCbs[requestId]
      if (!cb)
        return api.emit('error', new Error('Async reply came from main process for a nonwaiting request'), arguments)
      asyncCbs[requestId] = null
      if (args[0])
        args[0] = new Error(args[0])
      cb(...args)
      return
    }
    // TODO: readable
    // TODO: writable

    api.emit('error', new Error('Unknown message type'), arguments)
  })

  return api
}