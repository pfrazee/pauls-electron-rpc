const EventEmitter = require('events')
const { Writable } = require('stream')
const { ipcMain } = require('electron')

module.exports = function (channelName, manifest, methods) {
  var api = new EventEmitter()
  var streams = {}
  var webcontentsStreams = {}

  // wire up handler
  ipcMain.on(channelName, function (event, methodName, requestId, ...args) {
    // handle special methods
    if (methodName == 'stream-request-write') {
      event.returnValue = true
      return streamRequestWrite(requestId, args)
    }
    if (methodName == 'stream-request-end') {
      event.returnValue = true
      return streamRequestEnd(requestId, args)
    }
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
    if (type == 'promise') {
      // call promise
      let p
      try {
        p = method.apply(event, args)
        if (!p)
          p = Promise.resolve()
      } catch (e) {
        p = Promise.reject(errorObject(e))
      }

      // handle response
      p.then(
        value => event.sender.send(channelName, 'async-reply', requestId, null, value),
        error => event.sender.send(channelName, 'async-reply', requestId, errorObject(error))
      )
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
      streams[requestId] = stream

      // hook up events
      let onData     = chunk => event.sender.send(channelName, 'stream-data', requestId, chunk)
      let onReadable = () => event.sender.send(channelName, 'stream-readable', requestId)
      let onClose    = () => event.sender.send(channelName, 'stream-close', requestId)
      let onError    = err => {
        stream.unregisterEvents()
        event.sender.send(channelName, 'stream-error', requestId, (err) ? err.message : '')
      }
      let onEnd      = () => {
        stream.unregisterEvents() // TODO does calling this in 'end' mean that 'close' will never be sent?
        event.sender.send(channelName, 'stream-end', requestId)
        streams[requestId] = null
        webcontentsStreams[event.sender.id][requestId] = null
      }
      stream.unregisterEvents = () => {
        stream.removeListener('data', onData)
        stream.removeListener('error', onError)
        stream.removeListener('readable', onReadable)
        stream.removeListener('close', onClose)
        stream.removeListener('end', onEnd)
      }
      trackWebcontentsStreams(event.sender, requestId, stream)
      stream.on('data', onData)
      stream.on('error', onError)
      stream.on('readable', onReadable)
      stream.on('close', onClose)
      stream.on('end', onEnd)

      // done
      event.returnValue = { success: true }
      return
    }
    if (type == 'writable') {
      // call writable
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
      streams[requestId] = stream

      // hook up events
      let onDrain    = () => event.sender.send(channelName, 'stream-drain', requestId)
      let onClose    = () => event.sender.send(channelName, 'stream-close', requestId)
      let onError    = err => {
        stream.unregisterEvents()
        event.sender.send(channelName, 'stream-error', requestId, (err) ? err.message : '')
      }
      let onFinish    = () => {
        stream.unregisterEvents()
        event.sender.send(channelName, 'stream-finish', requestId)
        streams[requestId] = null
        webcontentsStreams[event.sender.id][requestId] = null
      }
      stream.unregisterEvents = () => {
        stream.removeListener('drain', onDrain)
        stream.removeListener('error', onError)
        stream.removeListener('finish', onFinish)
        stream.removeListener('close', onClose)
      }
      trackWebcontentsStreams(event.sender, requestId, stream)
      stream.on('drain', onDrain)
      stream.on('error', onError)
      stream.on('finish', onFinish)
      stream.on('close', onClose)

      // done
      event.returnValue = { success: true }
      return
    }

    api.emit('error', new Error('Invalid method type'), arguments)
  })

  // special methods
  function trackWebcontentsStreams (webcontents, requestId, stream) {
    // track vs. sender's lifecycle
    if (!webcontentsStreams[webcontents.id]) {
      webcontentsStreams[webcontents.id] = {}
      // listen for webcontent close event
      webcontents.once('did-navigate', closeAllWebcontentsStreams(webcontents.id))
      webcontents.once('destroyed', closeAllWebcontentsStreams(webcontents.id))
    }
    webcontentsStreams[webcontents.id][requestId] = stream
  }
  function streamRequestWrite (requestId, args) {
    var stream = streams[requestId]

    if (stream && typeof stream.write == 'function') {
      // massage data
      if (!stream._writableState.objectMode && !Buffer.isBuffer(args[0]))
        args[0] = ''+args[0]

      // write
      stream.write(...args)
    }
  }
  function streamRequestEnd (requestId, args) {
    var stream = streams[requestId]
    if (stream && typeof stream.end == 'function')
      stream.end(...args)
  }
  function streamRequestClose (requestId, args) {
    var stream = streams[requestId]
    if (!stream)
      return
    // try .close
    if (typeof stream.close == 'function')
      stream.close(...args)
    // hmm, try .destroy
    else if (typeof stream.destroy == 'function')
      stream.destroy(...args)
    // oye, last shot: end()
    else if (typeof stream.end == 'function')
      stream.end(...args)
  }

  // helpers
  function closeAllWebcontentsStreams (webcontentsId) {
    return e => {
      if (!webcontentsStreams[webcontentsId])
        return

      // close all of the open streams
      for (var requestId in webcontentsStreams[webcontentsId]) {
        if (webcontentsStreams[webcontentsId][requestId]) {
          webcontentsStreams[webcontentsId][requestId].unregisterEvents()
          streamRequestClose(requestId, [])
        }
      }

      // stop tracking
      delete webcontentsStreams[webcontentsId]
    }
  }

  return api
}

function errorObject (err) {
  if (err.name || err.message) {
    return { name: err.name, message: err.message }
  }
  return err.toString()
}
