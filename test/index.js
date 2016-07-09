const { app, BrowserWindow } = require('electron')
const rpc = require('../')
const manifest = require('./manifest')

// setup window

function createWindow () {
  var mainWindow = new BrowserWindow({width: 800, height: 600})
  mainWindow.loadURL(`file://${__dirname}/runner.html`)
}
app.on('ready', createWindow)
app.on('window-all-closed', function () {
  app.quit()
})

// export api

rpc.exportAPI('test', manifest, {
  // sync methods
  addOneSync: n => n + 1,
  errorSync: () => { throw new Error('oh no!') },

  // async methods
  addOne: (n, cb) => cb(null, n + 1),
  error: cb => cb(new Error('oh no!'))
})