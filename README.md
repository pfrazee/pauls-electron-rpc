# pauls-electron-rpc

Features:

 - Supports RPC calls to/from the renderer or webview or a node child-process to the background process
 - Supports methods which return:
   - Sync values
   - Async CBs
   - Promises
   - Readable streams
   - Writable streams
   - Duplex streams
 - Permissions by examining the sender of the call
 - Monitors renderer/webview lifetime to automatically release streams
 - Optional timeout for async methods

## Example usage

In a shared `example-api-manifest.js`:

```js
module.exports = {
  // simple method-types
  readFile: 'async',
  readFileSync: 'sync',
  sayHello: 'promise',
  createReadStream: 'readable',
  createWriteStream: 'writable',
  createDuplexStream: 'duplex'
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
  sayHello: () => return Promise.resolve('hello!'),
  createReadStream: fs.createReadStream,
  createWriteStream: /* ... */,
  createDuplexStream: /* ... */
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

### rpc.exportAPI(channelName, manifest, methods, [globalPermissionCheck])

Methods will be called with a `this` set to the `event` object from [electron ipc](http://electron.atom.io/docs/api/ipc-main/#event-object).
Don't touch `returnValue`.

You can optionally specify a method for `globalPermissionCheck` with the following signature:

```js
function globalPermissionCheck (event, methodName, args) {
  if (event.sender.getURL() != 'url-I-trust') return false
  return true
}
```

If `globalPermissionCheck` is specified, and does not return true, the method call will respond with a 'Denied' error.

### rpc.importAPI(channelName, manifest [,options])

 - `options.timeout` Number. Specify how long in ms that async methods wait before erroring. Set to `false` to disable timeout.
 - `options.errors` Object. Provides custom error constructors.
 - `options.wc` WebContents. The web-contents that is exporting the API. Use this when importing an API from a webContents into the main thread.
 - `options.proc` ChildProcess. The child-process that is exporting the API. Use this when importing an API from a node child process into the main thread.

## Readable Streams

Readable streams in the clientside are given a `.close()` method.
All serverside streams MUST implement `.close()` or `.destroy()`, either of which will be called.

Stream methods can return a promise that resolves to a stream.

## Buffers and ArrayBuffers

Arguments and return values are massaged so that they are Buffers on the exporter's side, and ArrayBuffers on the importer side.

## Custom Errors

```js
// shared code
// =

var manifest = {
  testThrow: 'promise'
}

class MyCustomError extends Error {
  constructor() {
    super()
    this.name = 'MyCustomError'
    this.message = 'Custom error!'
  }
}

// server
// =

rpc.exportAPI('error-api', manifest, {
  testThrow() {
    return Promise.reject(new MyCustomError())
  }
})

// client
// =

var rpcClient = rpc.importAPI('error-api', manifest, {
  errors: {MyCustomError} // pass in custom error constructors
})
rpcClient.testThrow().catch(console.log) // => MyCustomError
```