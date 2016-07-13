const EventEmitter = require('events')
const { Writable } = require('stream')
const { ipcMain } = require('electron')

module.exports = function (channelName, manifest, methods) {
  var api = new EventEmitter()
  var readables = {}
  var webcontentsReadables = {}

  // wire up handler
  ipcMain.on(channelName, function (event, methodName, requestId, ...args) {
    // handle special methods
    if (methodName == 'stream-request-close') {
      event.returnValue = true
      return streamRequestClose(requestId, args)
    }

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
        event.returnValue = { success: method.apply(event, args) }
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
      method.apply(event, args)
      return
    }
    if (type == 'readable') {
      // call readable
      let stream
      try {
        stream = method.apply(event, args)
        if (!stream) {
          event.returnValue = { success: false }
          return
        }
      } catch (e) {
        event.returnValue = { error: e.message }
        return
      }
      readables[requestId] = stream

      // track vs. sender's lifecycle
      if (!webcontentsReadables[event.sender.id]) {
        webcontentsReadables[event.sender.id] = {}
        // listen for webcontent close event
        event.sender.once('did-navigate', closeAllReadables(event.sender.id, unregisterEvents))
        event.sender.once('destroyed', closeAllReadables(event.sender.id, unregisterEvents))
      }
      webcontentsReadables[event.sender.id][requestId] = stream

      // hook up events
      let onData     = chunk => event.sender.send(channelName, 'stream-data', requestId, chunk)
      let onError    = err => event.sender.send(channelName, 'stream-error', requestId, (err) ? err.message : '')
      let onReadable = () => event.sender.send(channelName, 'stream-readable', requestId)
      let onClose    = () => event.sender.send(channelName, 'stream-close', requestId)
      let onEnd      = () => {
        unregisterEvents()
        event.sender.send(channelName, 'stream-end', requestId)
        readables[requestId] = null
        webcontentsReadables[event.sender.id][requestId] = null
      }
      function unregisterEvents () {
        stream.removeListener('data', onData)
        stream.removeListener('error', onError)
        stream.removeListener('readable', onReadable)
        stream.removeListener('close', onClose)
        stream.removeListener('end', onEnd)
      }
      stream.on('data', onData)
      stream.on('error', onError)
      stream.on('readable', onReadable)
      stream.on('close', onClose)
      stream.on('end', onEnd)

      // done
      event.returnValue = { success: true }
      return
    }
    // TODO writable

    api.emit('error', new Error('Invalid method type'), arguments)
  })

  // special methods
  function streamRequestClose (requestId, args) {
    if (!readables[requestId])
      return
    // try .close
    if (typeof readables[requestId].close == 'function')
      readables[requestId].close(...args)
    // hmm, try .destroy
    else if (typeof readables[requestId].destroy == 'function')
      readables[requestId].destroy(...args)
  }

  // helpers
  function closeAllReadables (id, unregisterEvents) {
    return e => {
      unregisterEvents()
      if (!webcontentsReadables[id])
        return

      // close all of the open streams
      for (var requestId in webcontentsReadables[id])
        streamRequestClose(requestId, [])

      // stop tracking
      delete webcontentsReadables[id]
    }
  }

  return api
}