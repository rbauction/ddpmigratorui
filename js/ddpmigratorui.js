const {ipcRenderer} = require('electron')
var localDir = ''
var loggedInUser = ''

$(document).ready(function() {
  loadLastProperties(function() {
    if (localDir === '') {
      openRepo(function() {
        $('#sfdcLoginModal').modal('show')
      })
    } else
      $('#sfdcLoginModal').modal('show')
  })
})

function openRepo(callback) {
  callback = callback || function () {}
  ipcRenderer.once('open-repo-reply', (event, srcDir) => {
    setLocalDirName(srcDir)
    refreshListOfLocalDdps(callback)
  })
  ipcRenderer.send('open-repo-message')
}

function setLocalDirName(dirName) {
  localDir = dirName
  $('#localDirName').text(localDir)
}

function logInSalesforce(idPrefix) {
  $(`#${idPrefix}SpinnerIcon`).addClass('spinning')
  ipcRenderer.once('log-in-salesforce-reply', (event, err, sfdcUsername) => {
    $(`#${idPrefix}SpinnerIcon`).removeClass('spinning')
    if (err) {
      var errObj = JSON.parse(err)
      $(`#${idPrefix}Alert`).removeClass('hidden')
      $(`#${idPrefix}Alert > span`).text(errObj.message)
    } else {
      $(`#${idPrefix}Alert`).addClass('hidden')
      setLoggedInUser(sfdcUsername)
      $(`#${idPrefix}Modal`).modal('hide')
      refreshListOfRemoteDdps()
    }
  })
  ipcRenderer.send(
    'log-in-salesforce-message',
    $(`#${idPrefix}Username`).val(),
    $(`#${idPrefix}Password`).val(),
    $(`#${idPrefix}IsProduction`).is(':checked')
  )
}

function onTableHeaderCheckboxChange(tbodyId) {
  $(`#${tbodyId} > tr > td > input`).each(function(index) {
    if ($(this).parent().parent().is(":visible"))
      $(this).prop("checked", !$(this).prop("checked"))
  })
}

function refreshLocalAndRemote() {
  // Refresh local DDPs first, then remote
  refreshListOfLocalDdps(refreshListOfRemoteDdps);
}

function filterDdps(tbodyId, element) {
  var value = $(element).val();

  $(`#${tbodyId} > tr > td:nth-child(2)`).each(function() {
    if ($(this).text().search(value) > -1)
      $(this).parent().show()
    else
      $(this).parent().hide()
  });
}

function refreshListOfRemoteDdps() {
  ipcRenderer.once('get-remote-ddps-reply', (event, err, ddps) => {
    if (err) {
      var errObj = JSON.parse(err)
      window.alert(errObj.message)
      return
    }

    $('#remoteDdps').empty()
    ddps.sort()
    for (i = 0; i < ddps.length; i++)
      $('#remoteDdps').append('<tr><td><input type="checkbox" id="remote-ddp-checkbox-' + i + '"><label for="remote-ddp-checkbox-' + i + '"><span class="fa fa-lg fa-check-square-o"></span><span class="fa fa-lg fa-square-o"></span></label></td><td>' + ddps[i] + '</td><td class="text-center"><a href="#" onclick="pullOneDdp(\'' + ddps[i] + '\')"><span class="glyphicon glyphicon-download" aria-hidden="true"></span></a></td></tr>')
    $('#navRefreshIcon').removeClass('spinning')
  })
  $('#navRefreshIcon').addClass('spinning')
  ipcRenderer.send('get-remote-ddps-message')
}

function refreshListOfLocalDdps(callback) {
  callback = callback || function () {}
  ipcRenderer.once('get-local-ddps-reply', (event, err, ddps) => {
    if (err) {
      var errObj = JSON.parse(err)
      window.alert(errObj.message)
      callback(err)
      return
    }

    $('#localDdps').empty()
    ddps.sort()
    for (i = 0; i < ddps.length; i++)
      $('#localDdps').append('<tr><td><input type="checkbox" id="local-ddp-checkbox-' + i + '"><label for="local-ddp-checkbox-' + i + '"><span class="fa fa-lg fa-check-square-o"></span><span class="fa fa-lg fa-square-o"></span></label></td><td>' + ddps[i] + '</td><td class="text-center"><a href="#" onclick="pushOneDdp(\'' + ddps[i] + '\')"><span class="glyphicon glyphicon-upload" aria-hidden="true"></span></a></td></tr>')
    $('#navRefreshIcon').removeClass('spinning')
    callback(null)
  })
  $('#navRefreshIcon').addClass('spinning')
  ipcRenderer.send('get-local-ddps-message', localDir)
}

function pullOrPushDdps(ddps, messageChannelName, replyChannelName, callback) {
  callback = callback || function () {}
  var dmExitcode = $('#ddpMigratorExitcode')
  ipcRenderer.removeAllListeners(replyChannelName)
  ipcRenderer.on(replyChannelName, (event, err, exitcode, stdout) => {
    if (exitcode >= 0) {
      ipcRenderer.removeAllListeners(replyChannelName)
      $('#ddpMigratorCloseButton').removeClass('hidden')
      dmExitcode.removeClass('alert-info')
      if (exitcode == 0) {
        dmExitcode.removeClass('alert-danger')
        dmExitcode.addClass('alert-success')
      } else {
        dmExitcode.removeClass('alert-success')
        dmExitcode.addClass('alert-danger')
      }
      dmExitcode.find('span').text(`Exit code: ${exitcode}`)
      callback(err)
      // Dismiss modal window if execution was successful
      if (!err)
        $('#ddpMigratorModal').modal('hide')
      return
    } else {
      var dmOutput = $('#ddpMigratorOutput')
      dmOutput.text($('#ddpMigratorOutput').text() + stdout)
      dmOutput.scrollTop(dmOutput.prop("scrollHeight"))
    }
  })
  $('#ddpMigratorCloseButton').addClass('hidden')
  $('#ddpMigratorOutput').text('')
  $('#ddpMigratorModal').modal('show')
  dmExitcode.removeClass('alert-danger')
  dmExitcode.removeClass('alert-success')
  dmExitcode.addClass('alert-info')
  dmExitcode.find('span').text('DDP Migrator is running')
  ipcRenderer.send(messageChannelName, ddps)
}

function collectSelectedDdps(tbodyId, callback) {
  var ddps = []
  $(`#${tbodyId} > tr > td:nth-child(2)`)
    .each(function() {
      if ($(this).parent().find('td:first-child > input').is(':checked'))
        ddps.push($(this).text())
    })
    .promise()
    .done(function() {
      if (ddps.length > 0)
        callback(ddps)
    })
}

function pullDdps(ddps) {
  pullOrPushDdps(ddps, 'pull-ddps-message', 'pull-ddps-reply', function() {
    $('#localDdpFilter').val('')
    $('#local-all-ddps-checkbox').prop('checked', false)
    refreshListOfLocalDdps()
  })
}

function pullOneDdp(ddpName) {
  pullDdps([ddpName])
}

function pullSelectedDdps() {
  collectSelectedDdps('remoteDdps', pullDdps)
}

function pushDdps(ddps) {
  pullOrPushDdps(ddps, 'push-ddps-message', 'push-ddps-reply', function () {
    $('#remoteDdpFilter').val('')
    $('#remote-all-ddps-checkbox').prop('checked', false)
    refreshListOfRemoteDdps()
  })
}

function pushOneDdp(ddpName) {
  pushDdps([ddpName])
}

function pushSelectedDdps() {
  collectSelectedDdps('localDdps', pushDdps)
}

function setLoggedInUser(username) {
  loggedInUser = username
  $('#sfdcLoggedIn').text('Change sandbox')
  $('#sfdcLoggedInUser').text(loggedInUser)
}

function loadLastSourceDir(callback) {
  callback = callback || function () {}
  ipcRenderer.once('get-last-source-dir-reply', (event, srcDir) => {
    if (srcDir === null)
      callback(null)
    else {
      setLocalDirName(srcDir)
      refreshListOfLocalDdps(callback)
    }
  })
  ipcRenderer.send('get-last-source-dir-message')
}

function loadLastSfdcUsername(callback) {
  callback = callback || function () {}
  ipcRenderer.once('get-last-sfdc-username-reply', (event, sfdcUsername) => {
    $('#sfdcLoginUsername').val(sfdcUsername)
    callback(null)
  })
  ipcRenderer.send('get-last-sfdc-username-message')
}

function loadLastProperties(callback) {
  callback = callback || function () {}
  loadLastSourceDir(function() {
    loadLastSfdcUsername(callback)
  })
}
