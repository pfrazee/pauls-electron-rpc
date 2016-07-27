# pauls-electron-rpc

Features:

 - Supports RPC calls from the renderer or webview to the background process
 - Supports methods which return:
   - Sync values
   - Async CBs
   - Readable streams
   - Writable streams
 - Permissions by examining the sender of the call
 - Monitors renderer/webview lifetime to automatically release streams
 - Optional timeout for async methods

Possible future additions:

 - Duplex streams
 - Return objects with their own exported APIs

Todos:

 - [ ] Make sure buffers are sent in a useful form. (I'm not sure what the buffer behaviors should be inside webpages, yet.)

## Example usage

In a shared `example-api-manifest.js`:

```js
module.exports = {
  // simple method-types
  readFile: 'async',
  readFileSync: 'sync',
  createReadStream: 'readable'
}
```

In the main electron process:

```js
var rpc = require('pauls-electron-rpc')
var manifest = require('./example-api-manifest')
var fs = require('fs')

// export over the 'example-api' channel
var api = rpc.exportAPI('example-api', manifest, {
  // the exported API behaves like normal calls:
  readFile: fs.readFile,
  readFileSync: fs.readFileSync,
  createReadStream: fs.createReadStream
})

// log any errors
api.on('error', console.log)
```

In the renderer or webview process:

```js
var rpc = require('pauls-electron-rpc')
var manifest = require('./example-api-manifest')

// import over the 'example-api' channel
var api = rpc.importAPI('example-api', manifest, { timeout: 30e3 })

// now use, as usual:
api.readFileSync('/etc/hosts') // => '...'
```

## API

### rpc.exportAPI(channelName, manifest, methods)

Methods will be called with a `this` set to the `event` object from [electron ipc](http://electron.atom.io/docs/api/ipc-main/#event-object).
Don't touch `returnValue`.

### rpc.importAPI(channelName, manifest [,options])

The `options` may include a `timeout`, to specify how long async methods wait before erroring.
Set to `false` to disable timeout.

## Readable Streams

Readable streams in the clientside are given a `.close()` method.
All serverside streams MUST implement `.close()` or `.destroy()`, either of which will be called.