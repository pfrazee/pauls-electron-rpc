# pauls-electron-rpc

Features:

 - Supports RPC calls from the renderer or webview to the background process
 - Supports methods which return:
   - Sync values
   - Async CBs
   - Readable streams
 - Permissions by examining the sender of the call

Possible future additions:

 - Event emitter API
 - Methods which return:
   - Writable streams
   - Duplex streams
   - Objects, with their own exported APIs

Todos:

 - [ ] Make sure buffers are sent in a useful form. (I'm not sure what the buffer behaviors should be inside webpages, yet.)
 - [ ] Monitor renderer/webview lifetime to automatically release memory, if needed. (Currently not needed, but it will be once event-emitter APIs are supported.)

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
var api = rpc.importAPI('example-api', manifest)

// now use, as usual:
api.readFileSync('/etc/hosts') // => '...'
```

## API

### rpc.exportAPI(channelName, manifest, methods)

Methods will be called with a `this` set to the `event` object from [electron ipc](http://electron.atom.io/docs/api/ipc-main/#event-object).
Don't touch `returnValue`.

### rpc.importAPI(channelName, manifest)