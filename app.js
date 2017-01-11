const Config = require('electron-config')
const {app, BrowserWindow, ipcMain, dialog} = require('electron')
const spawn = require('child_process').spawn
const fs = require('fs')
const path = require('path')
const sf = require('node-salesforce')
const url = require('url')

const config = new Config();

if (require('electron-squirrel-startup')) return

// Salesforce connection
let sfConn
let sfUsername
let sfPassword
let sfIsSandbox

// Source directory
let sourceDir

// Path to assets directory
let assetsDir

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function startApp() {
  resolveAssetsPath()
  createWindow()
}

function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1050,
    height: 700,
    minWidth: 780,
    minHeight: 400
  })
  // Hide menu bar
  //win.setMenu(null);

  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
}

function resolveAssetsPath() {
  if (fs.existsSync('./resources/app/assets'))
    assetsDir = './resources/app/assets'
  else if (fs.existsSync('./assets'))
    assets = './assets'
  else
    throw Error('Could not find neither ./resources/app/assets nor ./assets directory. Current directory: ' + process.cwd())
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', startApp)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    startApp()
  }
})

Error.prototype.toJSON = function() {
  return {
    name: this.name,
    message: this.message,
    stack: this.stack
  }
}

//
ipcMain.on('open-repo-message', (event) => {
  var srcDir = dialog.showOpenDialog({properties: ['openDirectory']})[0]
  config.set('lastSourceDir', srcDir)
  event.sender.send('open-repo-reply', srcDir)
})

//
ipcMain.on('pull-ddps-message', (event, ddps) => {
  var sandboxSwitch = sfIsSandbox ? '--sandbox' : ''
  var cmd = path.join(assetsDir, 'ddpmigrator.exe')
  var args = ['export', sandboxSwitch, '-u', sfUsername, '-p', sfPassword, '-s', sourceDir, '-d']
  for (var i in ddps)
    args.push(ddps[i])
  var ddpmigrator = spawn(cmd, args)

  ddpmigrator.stdout.on('data', (data) => {
    event.sender.send('pull-ddps-reply', null, -1, data)
  })

  ddpmigrator.stderr.on('data', (data) => {
    event.sender.send('pull-ddps-reply', null, -1, data)
  })

  ddpmigrator.on('close', (code) => {
    if (code == 0)
      event.sender.send('pull-ddps-reply', null, 0)
    else
      event.sender.send('pull-ddps-reply', null, code, `child process exited with code ${code}`)
  })
})

//
ipcMain.on('push-ddps-message', (event, ddps) => {
  var sandboxSwitch = sfIsSandbox ? '--sandbox' : ''
  var cmd = path.join(assetsDir, 'ddpmigrator.exe')
  var args = ['import', sandboxSwitch, '-u', sfUsername, '-p', sfPassword, '-s', sourceDir, '-d']
  for (var i in ddps)
    args.push(ddps[i])
  var ddpmigrator = spawn(cmd, args)

  ddpmigrator.stdout.on('data', (data) => {
    event.sender.send('push-ddps-reply', null, -1, data)
  })

  ddpmigrator.stderr.on('data', (data) => {
    event.sender.send('push-ddps-reply', null, -1, data)
  })

  ddpmigrator.on('close', (code) => {
    if (code == 0)
      event.sender.send('push-ddps-reply', null, 0)
    else
      event.sender.send('push-ddps-reply', null, code, `child process exited with code ${code}`)
  })
})

//
ipcMain.on('log-in-salesforce-message', (event, sfdcUsername, sfdcPassword, isProduction) => {
  if (isProduction)
    var loginUrl = 'https://www.salesforce.com'
  else
    var loginUrl = 'https://test.salesforce.com'
  sfConn = new sf.Connection({loginUrl : loginUrl})
  sfConn.login(sfdcUsername, sfdcPassword, function(err, userInfo) {
    if (err) {
      event.sender.send('log-in-salesforce-reply', JSON.stringify(err), null)
      return
    }

    sfUsername = sfdcUsername
    sfPassword = sfdcPassword
    sfIsSandbox = !isProduction
    config.set('lastSfdcUsername', sfdcUsername)
    event.sender.send('log-in-salesforce-reply', null, sfdcUsername)
  })
})

//
ipcMain.on('get-remote-ddps-message', (event) => {
  sfConn.query('SELECT Name FROM Loop__DDP__c ORDER BY Name', function(err, result) {
    if (err) {
      event.sender.send('get-remote-ddps-reply', JSON.stringify(err), null)
      return
    }

    var ddps = []
    for (i = 0; i < result.totalSize; i++)
      ddps[i] = result.records[i]['Name']
    event.sender.send('get-remote-ddps-reply', null, ddps)
  })
})

function getDirectories(dirName) {
  return fs.readdirSync(dirName).filter(function(file) {
    return fs.statSync(path.join(dirName, file)).isDirectory();
  });
}

//
ipcMain.on('get-local-ddps-message', (event, dirName) => {
  var ddps = getDirectories(path.join(dirName, 'loop', 'data'))
  event.sender.send('get-local-ddps-reply', null, ddps)
})

//
ipcMain.on('get-last-source-dir-message', (event) => {
  sourceDir = config.get('lastSourceDir')
  event.sender.send('get-last-source-dir-reply', sourceDir)
})

//
ipcMain.on('get-last-sfdc-username-message', (event) => {
  event.sender.send('get-last-sfdc-username-reply', config.get('lastSfdcUsername'))
})