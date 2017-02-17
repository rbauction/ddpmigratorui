const Config = require('electron-config')
const {app, BrowserWindow, ipcMain, dialog} = require('electron')
const spawn = require('child_process').spawn
const fs = require('fs')
const path = require('path')
const sf = require('node-salesforce')
const url = require('url')

const config = new Config()

if (require('electron-squirrel-startup')) return

// Salesforce connection
let sfConn
let sfUsername
let sfPassword
let sfIsSandbox

// Source directory
let sourceDir

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

// this should be placed at top of main.js to handle setup events quickly
if (handleSquirrelEvent()) {
  // squirrel event handled and app will exit in 1000ms, so don't do anything else
  return
}

function handleSquirrelEvent() {
  if (process.argv.length === 1) {
    return false
  }

  const ChildProcess = require('child_process')

  const appFolder = path.resolve(process.execPath, '..')
  const rootAtomFolder = path.resolve(appFolder, '..')
  const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'))
  const exeName = path.basename(process.execPath)

  const spawnDetached = function(command, args) {
    let spawnedProcess, error

    try {
      spawnedProcess = ChildProcess.spawn(command, args, {detached: true})
    } catch (error) {}

    return spawnedProcess
  }

  const spawnUpdate = function(args) {
    return spawnDetached(updateDotExe, args)
  }

  const squirrelEvent = process.argv[1]
  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      // Install desktop and start menu shortcuts
      var iconPath = path.join(__dirname, '/images/ddp-256x256.ico')
      spawnUpdate(['--createShortcut', `--icon=${iconPath}`, exeName])

      setTimeout(app.quit, 1000)
      return true

    case '--squirrel-uninstall':
      // Remove desktop and start menu shortcuts
      spawnUpdate(['--removeShortcut', exeName])

      setTimeout(app.quit, 1000)
      return true

    case '--squirrel-obsolete':
      // This is called on the outgoing version of your app before
      // we update to the new version - it's the opposite of
      // --squirrel-updated

      app.quit()
      return true
  }
}

function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1050,
    height: 700,
    minWidth: 780,
    minHeight: 400,
    icon: path.join(__dirname, '/images/ddp-256x256.ico')
  })

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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

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
    createWindow()
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
  sourceDir = dialog.showOpenDialog({properties: ['openDirectory']})[0]
  config.set('lastSourceDir', sourceDir)
  event.sender.send('open-repo-reply', sourceDir)
})

//
ipcMain.on('pull-ddps-message', (event, ddps) => {
  var cmd = path.join(__dirname, 'assets', 'ddpmigrator.exe')
  var args = ['export']
  if (sfIsSandbox)
    args.push('--sandbox')
  args.push('-u', sfUsername, '-p', sfPassword, '-s', sourceDir, '-d')
  for (var i in ddps)
    args.push(ddps[i])
  console.log(args)
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
  var cmd = path.join(__dirname, 'assets', 'ddpmigrator.exe')
  var args = ['import']
  if (sfIsSandbox)
    args.push('--sandbox')
  args.push('-u', sfUsername, '-p', sfPassword, '-s', sourceDir, '-d')
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
    return fs.statSync(path.join(dirName, file)).isDirectory()
  })
}

//
ipcMain.on('get-local-ddps-message', (event, dirName) => {
  var loopDir = path.join(dirName, 'loop')
  var dataDir = path.join(loopDir, 'data')
  if (fs.existsSync(loopDir) && fs.existsSync(dataDir))
    var ddps = getDirectories(dataDir)
  else
    var ddps = []
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
