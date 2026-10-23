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
  rpidashToggleCustomSize()
  rpidashUpdateLink(_eqLogic.id)
}

// Appelé par plugin.template.js avant la sauvegarde
function saveEqLogic(_eqLogic) {
  var ids = []
  document.querySelectorAll('.rpidashEqSelect:checked').forEach(function(el) {
    ids.push(el.dataset.id)
  })
  _eqLogic.configuration = _eqLogic.configuration || {}
  _eqLogic.configuration.equipments = ids.join(',')
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
