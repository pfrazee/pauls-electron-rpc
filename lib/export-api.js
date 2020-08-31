const EventEmitter = require('events')
const {IPCValueToValue, valueToIPCValue, isNodeProcess, isRenderer} = require('./util')

module.exports = function (channelName, manifest, methods, globalPermissionCheck) {
  var api = new EventEmitter()
  var webcontentsStreams = {}

  var channel
  if (isNodeProcess()) {
    var mockedSender = new EventEmitter()
    mockedSender.id = 'main-process'
    mockedSender.send = (channelName, msgType, requestId, ...args) => {
      // console.log('export-api#send', {channelName, msgType, requestId, args})
      process.send({channelName, msgType, requestId, args})
    }
    channel = {
      onMessage (cb) {
        process.on('message', msg => {
          if (msg.channelName !== channelName) return
          let mockedEvent = {sender: mockedSender}
          // console.log('export-api#onMessage', msg)
          cb(mockedEvent, msg.methodName, msg.requestId, ...msg.args)
        })
      }
    }
  } else if (isRenderer()) {
    var {ipcRenderer} = require('electron')
    channel = {
      onMessage (cb) {
        ipcRenderer.on(channelName, cb)
      }
    }
  } else {
    var {ipcMain} = require('electron')
    channel = {
      onMessage (cb) {
        ipcMain.on(channelName, cb)
      }
    }
  }

  // wire up handler
  channel.onMessage(async function (event, methodName, requestId, ...args) {
    // console.log('received', channelName, methodName, requestId, ...args)
    args = args.map(IPCValueToValue)

    // watch for a navigation event
    var hasNavigated = false
    function onDidNavigate () {
      hasNavigated = true
    }
    event.sender.on('did-navigate', onDidNavigate)

    // helper to send
    const send = function (msgType, err, value, keepListeningForDidNavigate=false) {
      if (event.sender.isDestroyed && event.sender.isDestroyed()) return // dont send response if destroyed
      if (!keepListeningForDidNavigate) event.sender.removeListener('did-navigate', onDidNavigate)
      if (hasNavigated) return // dont send response if the page changed
      // console.log('sending', channelName, msgType, requestId, err, value)
      if (event.reply) {
        event.reply(channelName, msgType, requestId, err, value)
      } else if (event.sender && event.sender.send) {
        event.sender.send(channelName, msgType, requestId, err, value)
      }
    }

    // handle special methods
    if (methodName == 'stream-request-write') {
      event.returnValue = true
      return streamRequestWrite(event.sender.id, requestId, args)
    }
    if (methodName == 'stream-request-end') {
      event.returnValue = true
      return streamRequestEnd(event.sender.id, requestId, args)
    }
    if (methodName == 'stream-request-close') {
      event.returnValue = true
      return streamRequestClose(event.sender.id, requestId, args)
    }

    // look up the method called
    var type = manifest[methodName]
    var method = methods[methodName]
    if (!type || !method) {
      api.emit('error', new Error(`Method not found: "${methodName}"`), arguments)
      return
    }

    // global permission check
    if (globalPermissionCheck && !globalPermissionCheck(event, methodName, args)) {
      // repond according to method type
      if (type == 'async' || type == 'promise') {
        send('async-reply', 'Method Access Denied')
      } else {
        event.returnValue = { error: 'Method Access Denied' }
      }
      return
    }

    // run method by type
    if (type == 'sync') {
      // call sync
      try {
        event.returnValue = { success: valueToIPCValue(method.apply(event, args)) }
      } catch (e) {
        event.returnValue = { error: e.message }
      }
      return
    }
    if (type == 'async') {
      // create a reply cb
      const replyCb = (err, value) => {
        if (err) err = errorObject(err)
        send('async-reply', err, valueToIPCValue(value))
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
        if (typeof p === 'undefined')
          p = Promise.resolve()
        if (typeof p.then === 'undefined')
          p = Promise.resolve(p)
      } catch (e) {
        p = Promise.reject(errorObject(e))
      }

      // handle response
      p.then(
        value => send('async-reply', null, valueToIPCValue(value)),
        error => send('async-reply', errorObject(error))
      )
      return
    }

    var streamTypes = {
      readable: createReadableEvents,
      writable: createWritableEvents,
      duplex: createDuplexEvents
    }

    if (streamTypes[type]) {
      return await handleStream(event, method, requestId, args, streamTypes[type], send)
    }

    api.emit('error', new Error(`Invalid method type "${type}" for "${methodName}"`), arguments)
  })

  async function handleStream (event, method, requestId, args, createStreamEvents, send) {
    // call duplex
    let stream
    let error
    try {
      stream = method.apply(event, args)
      if (!stream) {
        send('stream-error', 'Empty stream response')
        return
      }
    } catch (e) {
      send('stream-error', '' + e)
      return
    }

    // handle promises
    if (stream.then) {
      try {
        stream = await stream // wait for it
      } catch (e) {
        send('stream-error', '' + e)
        return
      }
    }

    trackWebcontentsStreams(event.sender, requestId, stream)
    var events = createStreamEvents(event, stream, requestId, send)
    hookUpEventsAndUnregister(stream, events)

    // done
    event.returnValue = { success: true }
    return
  }

  function hookUpEventsAndUnregister(stream, events) {
    Object.keys(events).forEach(key => stream.on(key, events[key]))
    stream.unregisterEvents = () => {
      Object.keys(events).forEach(key => stream.removeListener(key, events[key]))
    }
  }

  function createReadableEvents (event, stream, requestId, send) {
    return {
      data: chunk => send('stream-data', valueToIPCValue(chunk), undefined, true),
      close: () => send('stream-close'),
      error: err => {
        stream.unregisterEvents()
        send('stream-error', (err) ? err.message : '')
      },
      end: () => {
        stream.unregisterEvents() // TODO does calling this in 'end' mean that 'close' will never be sent?
        send('stream-end')
        webcontentsStreams[event.sender.id][requestId] = null
      }
    }
  }

  function createWritableEvents (event, stream, requestId, send) {
    return {
      drain: () => send('stream-drain', undefined, undefined, true),
      close: () => send('stream-close'),
      error: err => {
        stream.unregisterEvents()
        send('stream-error', (err) ? err.message : '')
      },
      finish: () => {
        stream.unregisterEvents()
        send('stream-finish')
        webcontentsStreams[event.sender.id][requestId] = null
      }
    }
  }

  function createDuplexEvents (event, stream, requestId, send) {
    return Object.assign(
      createWritableEvents(event, stream, requestId, send),
      createReadableEvents(event, stream, requestId, send))
  }

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

  function streamRequestWrite (webcontentsId, requestId, args) {
    var stream = webcontentsStreams[webcontentsId][requestId]

    if (stream && typeof stream.write == 'function') {
      stream.write(...args)
    }
  }
  function streamRequestEnd (webcontentsId, requestId, args) {
    var stream = webcontentsStreams[webcontentsId][requestId]
    if (stream && typeof stream.end == 'function')
      stream.end(...args)
  }
  function streamRequestClose (webcontentsId, requestId, args) {
    var stream = webcontentsStreams[webcontentsId][requestId]
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
          streamRequestClose(webcontentsId, requestId, [])
        }
      }

      // stop tracking
      delete webcontentsStreams[webcontentsId]
    }
  }

  return api
}

function errorObject (error) {
  var copy = Object.assign({}, error)
  copy.message = error.message || error.toString()
  if (error.name) copy.name = error.name
  return copy
}
