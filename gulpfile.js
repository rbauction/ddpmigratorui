const electron = require('electron-connect').server.create()
const electronInstaller = require('electron-winstaller')
const fs = require('fs')
const gulp = require('gulp')
const download = require('gulp-download')
const packager = require('electron-packager')
const rename = require('gulp-rename')

const ddpmigrator = './assets/ddpmigrator.exe'

// Start app instance and restart it if app.js changes
gulp.task('dev', ['download-ddpmigratorcli'], function() {
  // Start browser process
  electron.start()

  // Restart browser process
  gulp.watch('app.js', electron.restart)
})

// Delete ddpmigrator.exe
gulp.task('delete-ddpmigratorcli', function() {
  if (fs.existsSync(ddpmigrator))
    fs.unlink(ddpmigrator)
})

// Download ddpmigrator.exe if it is not in the assets directory
gulp.task('download-ddpmigratorcli', function() {
  if (fs.existsSync(ddpmigrator))
    return

  // Download latest DDP Migrator
  var ver = require('./package.json')['ddpmigrator-version']
  console.log(`Downloading DDP Migrator v${ver} ...`)
  var url = `https://github.com/rbauction/ddpmigrator/releases/download/v${ver}/ddpmigrator-${ver}.exe`
  return download(url)
    .pipe(rename('ddpmigrator.exe'))
    .pipe(gulp.dest('assets'))
})

// Package the app
gulp.task('package', ['download-ddpmigratorcli'], function (cb) {
  var packageJson = require('./package.json')
  var options = {
    dir: '.',
    name: packageJson['name'],
    platform: 'win32',
    arch: 'x64',
    icon: 'images/ddp-256x256.ico',
    ignore: [
      '.gitignore',
      'gulpfile.js',
      'misc',
      'npm-debug.log'
    ],
    out: 'builds',
    overwrite: true,
    'app-copyright': 'Copyright (C) 2017 Ritchie Bros. Auctioneers',
    win32metadata: {
      CompanyName: 'DDP Migrator',
      FileDescription: packageJson['description'],
      OriginalFilename: 'DDPMigratorUI.exe',
      ProductName: packageJson['productName'],
      InternalName: packageJson['productName']
    }
  }

  packager(options, function (err, appPaths) {
    cb(err)
  })
})

// Create Windows installer
gulp.task('release', ['delete-ddpmigratorcli', 'package', 'download-ddpmigratorcli'], function () {
  var outdir = 'builds/win-installer-64'
  resultPromise = electronInstaller.createWindowsInstaller({
    appDirectory: 'builds/ddpmigratorui-win32-x64',
    outputDirectory: outdir,
    authors: 'Ritchie Bros. Auctioneers',
    exe: 'ddpmigratorui.exe',
    iconUrl: 'https://raw.githubusercontent.com/rbauction/ddpmigratorui/master/images/ddp-256x256.ico',
    setupIcon: 'images/ddp-256x256.ico',
    loadingGif: 'misc/installer-progress.gif'
  })

  return resultPromise.then(
    () => console.log(`Windows installer was created successfully and can be found in ${outdir} directory`),
    (err) => console.log(`No dice: ${err.message}`)
  )
})
