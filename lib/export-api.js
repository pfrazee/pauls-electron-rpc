const EventEmitter = require('events')
const { ipcMain } = require('electron')

module.exports = function (channelName, manifest, methods) {
  var api = new EventEmitter()  

  // wire up handler
  ipcMain.on(channelName, function (event, methodName, requestId, ...args) {
    // look up the method called
    var type = manifest[methodName]
    var method = methods[methodName]
    if (!type || !method) {
      api.emit('error', new Error('Method not found'), arguments)
      return
    }

    // run method by type
    if (type == 'sync') {
      // call sync
      try {
        event.returnValue = { success: method(...args) }
      } catch (e) {
        event.returnValue = { error: e.message }        
      }
      return
    }
    if (type == 'async') {
      // create a reply cb
      const replyCb = (err, value) => {
        if (err)
          err = err.message
        event.sender.send(channelName, 'async-reply', requestId, err, value)
      }
      args.push(replyCb)

      // call async
      method(...args)
      return
    }
    // TODO readable
    // TODO writable

    api.emit('error', new Error('Invalid method type'), arguments)
  })

  return api
}