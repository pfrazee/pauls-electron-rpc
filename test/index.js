const { app, BrowserWindow } = require('electron')
const rpc = require('../')
const manifest = require('./manifest')
const API = require('./api')
const mainRunner = require('./main-runner')

// setup window

process.on('uncaughtException', console.log)

var mainWindow
function createWindow () {
  mainWindow = new BrowserWindow({width: 800, height: 600, webPreferences: {nodeIntegration: true, webviewTag: true}})
  rpc.exportAPI('test', manifest, API(mainWindow), globalPermissionCheck)
  mainWindow.loadURL(`file://${__dirname}/renderer-runner.html`)
  mainWindow.webContents.on('did-finish-load', () => {
    mainRunner(mainWindow.webContents)
  })
}
app.on('ready', createWindow)
app.on('window-all-closed', function () {
  app.quit()
})

function globalPermissionCheck (event, methodName, args) {
  if (methodName === 'disallowedMethodSync') return false
  if (methodName === 'disallowedMethod') return false
  return true
}

