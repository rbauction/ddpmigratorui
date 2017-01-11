const electron = require('electron-connect').server.create()
const electronInstaller = require('electron-winstaller')
const fs = require('fs')
const gulp = require('gulp')
const download = require('gulp-download')
const rename = require('gulp-rename')

const ddpmigrator = './assets/ddpmigrator.exe'

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

// Start app instance and restart it if app.js changes
gulp.task('dev', ['download-ddpmigratorcli'], function() {
  // Start browser process
  electron.start()

  // Restart browser process
  gulp.watch('app.js', electron.restart)
})

// Create Windows installer
gulp.task('release', ['delete-ddpmigratorcli', 'download-ddpmigratorcli'], function () {
  var outdir = 'builds/win-installer-64'
  resultPromise = electronInstaller.createWindowsInstaller({
    appDirectory: 'builds/DDPMigratorUI-win32-x64',
    outputDirectory: outdir,
    authors: 'Ritchie Bros. Auctioneers',
    exe: 'ddpmigratorui.exe'
  })

  return resultPromise.then(
    () => console.log(`Windows installer was created successfully and can be found in ${outdir} directory`),
    (err) => console.log(`No dice: ${err.message}`)
  )
})
