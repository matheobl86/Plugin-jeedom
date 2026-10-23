/* This file is part of Jeedom.
 *
 * Jeedom is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

function rpidashToggleCustomSize() {
  var custom = document.getElementById('sel_rpidashPreset').value == 'custom'
  document.querySelectorAll('.rpidashCustomSize').forEach(function(el) {
    el.style.display = custom ? '' : 'none'
  })
}

function rpidashUpdateLink(_id) {
  var url = _id ? rpidashBaseUrl + '?apikey=' + encodeURIComponent(rpidashApiKey) + '&id=' + _id : ''
  document.getElementById('in_rpidashUrl').value = url
  document.getElementById('bt_rpidashOpen').href = url || '#'
  document.getElementById('ta_rpidashKiosk').value = url
    ? 'chromium-browser --kiosk --noerrdialogs --disable-infobars --incognito --check-for-update-interval=31536000 "' + url + '"'
    : ''
}

// Appelé par plugin.template.js à l'affichage d'un équipement
function printEqLogic(_eqLogic) {
  var selected = String((_eqLogic.configuration && _eqLogic.configuration.equipments) || '').split(',')
  document.querySelectorAll('.rpidashEqSelect').forEach(function(el) {
    el.checked = selected.indexOf(el.dataset.id) != -1
  })
  var options = {}
  String((_eqLogic.configuration && _eqLogic.configuration.widgets) || '').split(',').forEach(function(entry) {
    var parts = entry.split(':')
    if (parts.length >= 2) options[parts[0]] = { widget: parts[1], size: parts[2] || '1' }
  })
  document.querySelectorAll('.rpidashEqWidget').forEach(function(el) {
    el.value = options[el.dataset.id] ? options[el.dataset.id].widget : 'auto'
    if (el.value == '') el.value = 'auto'
  })
  document.querySelectorAll('.rpidashEqSize').forEach(function(el) {
    el.value = options[el.dataset.id] ? options[el.dataset.id].size : '1'
  })
  document.getElementById('ta_rpidashDiagnostic').style.display = 'none'
  document.getElementById('bt_rpidashDiagnosticCopy').style.display = 'none'
  rpidashToggleCustomSize()
  rpidashUpdateLink(_eqLogic.id)
}

// Appelé par plugin.template.js avant la sauvegarde
function saveEqLogic(_eqLogic) {
  var ids = []
  document.querySelectorAll('.rpidashEqSelect:checked').forEach(function(el) {
    ids.push(el.dataset.id)
  })
  // On ne garde que les réglages différents du défaut (Automatique, tuile normale)
  var widgets = []
  document.querySelectorAll('.rpidashEqWidget').forEach(function(el) {
    var size = document.querySelector('.rpidashEqSize[data-id="' + el.dataset.id + '"]').value
    if (el.value != 'auto' || size != '1') widgets.push(el.dataset.id + ':' + el.value + ':' + size)
  })
  _eqLogic.configuration = _eqLogic.configuration || {}
  _eqLogic.configuration.equipments = ids.join(',')
  _eqLogic.configuration.widgets = widgets.join(',')
  return _eqLogic
}

document.getElementById('sel_rpidashPreset').addEventListener('change', rpidashToggleCustomSize)

document.getElementById('in_rpidashFilter').addEventListener('input', function() {
  var search = this.value.toLowerCase()
  document.querySelectorAll('.rpidashEqItem').forEach(function(el) {
    el.style.display = el.dataset.search.indexOf(search) != -1 ? '' : 'none'
  })
})

function rpidashCheckVisible(_checked) {
  document.querySelectorAll('.rpidashEqItem').forEach(function(el) {
    if (el.style.display != 'none') {
      el.querySelector('.rpidashEqSelect').checked = _checked
    }
  })
}
document.getElementById('bt_rpidashCheckAll').addEventListener('click', function() { rpidashCheckVisible(true) })
document.getElementById('bt_rpidashUncheckAll').addEventListener('click', function() { rpidashCheckVisible(false) })

document.getElementById('ta_rpidashKiosk').addEventListener('focus', function() { this.select() })
document.getElementById('in_rpidashUrl').addEventListener('focus', function() { this.select() })

document.getElementById('bt_rpidashDiagnostic').addEventListener('click', function() {
  var id = document.querySelector('.eqLogicAttr[data-l1key="id"]').value
  $.ajax({
    type: 'POST',
    url: 'plugins/rpidash/core/ajax/rpidash.ajax.php',
    data: { action: 'diagnostic', id: id },
    dataType: 'json',
    global: false,
    error: function(request, status, error) {
      handleAjaxError(request, status, error)
    },
    success: function(data) {
      if (data.state != 'ok') {
        $.fn.showAlert({ message: data.result, level: 'danger' })
        return
      }
      var ta = document.getElementById('ta_rpidashDiagnostic')
      ta.value = JSON.stringify(data.result, null, 2)
      ta.style.display = ''
      document.getElementById('bt_rpidashDiagnosticCopy').style.display = ''
    }
  })
})

document.getElementById('bt_rpidashDiagnosticCopy').addEventListener('click', function() {
  var ta = document.getElementById('ta_rpidashDiagnostic')
  ta.select()
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(ta.value)
  } else {
    document.execCommand('copy')
  }
})
document.getElementById('ta_rpidashDiagnostic').addEventListener('focus', function() { this.select() })
