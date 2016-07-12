var rpc = require('../')
var manifest = require('./manifest')
var api = rpc.importAPI('test', manifest)

api.continuousReadable('destroytest')