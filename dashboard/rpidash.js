/* RPi Dash - dashboard tactile pour Jeedom */
(function() {
  'use strict'

  var BOOT = window.RPIDASH
  var RELOAD_STRUCTURE_MS = 5 * 60 * 1000

  var state = {
    config: null,
    objects: [],
    values: {},
    room: readRoom(),
    structureKey: '',
    lastStructure: 0,
    pollTimer: null,
    holding: 0 // > 0 tant qu'un curseur est en cours de manipulation
  }
  var app = document.getElementById('app')
  var grid = document.getElementById('grid')
  var rooms = document.getElementById('rooms')
  var statusDot = document.getElementById('status')

  /* ------------------------------------------------------------ API */

  function api(params) {
    var body = new URLSearchParams({ apikey: BOOT.apikey, id: BOOT.id })
    Object.keys(params).forEach(function(k) { body.append(k, params[k]) })
    return fetch(BOOT.apiUrl, { method: 'POST', body: body, cache: 'no-store' })
      .then(function(r) { return r.json() })
      .then(function(json) {
        if (json.state !== 'ok') throw new Error(json.error || 'Erreur')
        setOnline(true)
        return json.result
      })
  }

  function setOnline(online) {
    statusDot.classList.toggle('offline', !online)
  }

  /* ------------------------------------------------------- Helpers */

  function el(tag, cls, text) {
    var node = document.createElement(tag)
    if (cls) node.className = cls
    if (text !== undefined && text !== null) node.textContent = text
    return node
  }

  function readRoom() {
    try { return localStorage.getItem('rpidash-room-' + BOOT.id) || 'all' } catch (e) { return 'all' }
  }

  function saveRoom(room) {
    try { localStorage.setItem('rpidash-room-' + BOOT.id, room) } catch (e) {}
  }

  function isOn(value) {
    return value === true || value === 1 || value === '1' || (typeof value === 'number' && value > 0)
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === '') return '—'
    if (typeof value === 'number') {
      return Math.round(value * 100) / 100 + ''
    }
    return String(value)
  }

  // Détermine si une commande action est un "ON" ou un "OFF"
  function actionKind(cmd) {
    var gt = (cmd.genericType || '').toUpperCase()
    if (/_ON$/.test(gt)) return 'on'
    if (/_OFF$/.test(gt)) return 'off'
    var name = (cmd.name || '').trim().toLowerCase()
    if (/^(on|allumer|marche|activer|ouvrir)$/.test(name)) return 'on'
    if (/^(off|éteindre|eteindre|arrêt|arret|désactiver|desactiver|fermer)$/.test(name)) return 'off'
    return ''
  }

  /* ------------------------------------------------ Mise en page */

  function applyScreen() {
    var c = state.config
    var root = document.documentElement
    root.dataset.theme = c.theme === 'light' ? 'light' : 'dark'

    var w = c.width, h = c.height
    if (w && h && c.orientation === 'portrait' && w > h) { var t = w; w = h; h = t }
    if (w && h && c.orientation !== 'portrait' && h > w) { var t2 = w; w = h; h = t2 }

    var fixed = !!(w && h)
    var width = fixed ? w : window.innerWidth
    var height = fixed ? h : window.innerHeight

    if (fixed) {
      app.style.width = w + 'px'
      app.style.height = h + 'px'
      var scale = Math.min(1, window.innerWidth / w, window.innerHeight / h)
      app.style.transform = scale < 1 ? 'scale(' + scale + ')' : ''
    } else {
      app.style.width = '100vw'
      app.style.height = '100vh'
      app.style.transform = ''
    }

    var cols = c.columns > 0 ? c.columns : Math.max(1, Math.min(8, Math.floor(width / 230)))
    var font = Math.max(12, Math.min(24, Math.round(Math.min(width / cols / 15, height / 28))))
    root.style.setProperty('--cols', cols)
    root.style.setProperty('--font', font + 'px')
    root.style.setProperty('--gap', Math.round(font * 0.65) + 'px')

    document.getElementById('title').textContent = c.title || ''
    document.title = c.title || 'RPi Dash'
    document.getElementById('clock').style.display = c.showClock ? '' : 'none'
    rooms.style.display = c.showRooms ? '' : 'none'
  }

  /* -------------------------------------------------------- Rendu */

  function render() {
    renderRooms()
    grid.innerHTML = ''
    var showAll = !state.config.showRooms || state.room === 'all'
    var count = 0
    state.objects.forEach(function(object) {
      if (!showAll && String(object.id) !== state.room) return
      object.eqLogics.forEach(function(eq) {
        grid.appendChild(renderEqLogic(eq, showAll && state.config.showRooms ? object.name : ''))
        count++
      })
    })
    if (count === 0) {
      grid.appendChild(el('div', 'message', 'Aucun équipement à afficher. Sélectionnez-en dans la configuration de l\'écran sur Jeedom.'))
    }
    updateValues({})
  }

  function renderRooms() {
    rooms.innerHTML = ''
    if (!state.config.showRooms) return
    var exists = state.objects.some(function(o) { return String(o.id) === state.room })
    if (!exists) state.room = 'all'
    var entries = [{ id: 'all', name: 'Tout' }].concat(state.objects)
    if (entries.length <= 2) {
      // Une seule pièce : les onglets ne servent à rien
      state.room = 'all'
      return
    }
    entries.forEach(function(o) {
      var b = el('button', String(o.id) === state.room ? 'active' : '', o.name)
      b.addEventListener('click', function() {
        state.room = String(o.id)
        saveRoom(state.room)
        render()
      })
      rooms.appendChild(b)
    })
  }

  function renderEqLogic(eq, roomName) {
    var tile = el('div', 'tile')
    tile.appendChild(el('div', 'tile-title', eq.name))
    if (roomName) tile.appendChild(el('div', 'tile-room', roomName))

    var infos = eq.cmds.filter(function(c) { return c.type === 'info' })
    var actions = eq.cmds.filter(function(c) { return c.type === 'action' })
    var consumedInfos = {}
    var consumedActions = {}

    // Couples ON/OFF reliés à la même info binaire -> un interrupteur
    var groups = {}
    actions.forEach(function(a) {
      if (a.subType === 'other' && a.linked && a.linkedSubType === 'binary') {
        (groups[a.linked] = groups[a.linked] || []).push(a)
      }
    })
    Object.keys(groups).forEach(function(linked) {
      var on = null, off = null
      groups[linked].forEach(function(a) {
        var kind = actionKind(a)
        if (kind === 'on' && !on) on = a
        if (kind === 'off' && !off) off = a
      })
      if (!on || !off) return
      tile.appendChild(renderToggle(eq, linked, on, off))
      consumedActions[on.id] = consumedActions[off.id] = true
      consumedInfos[linked] = true
    })

    // Curseurs, couleurs, listes : affichent eux-mêmes la valeur liée
    var controls = []
    actions.forEach(function(a) {
      if (consumedActions[a.id]) return
      if (a.subType === 'slider' || a.subType === 'color' || a.subType === 'select') {
        controls.push(renderControl(a))
        consumedActions[a.id] = true
        if (a.linked) consumedInfos[a.linked] = true
      }
    })

    infos.forEach(function(info) {
      if (!consumedInfos[info.id]) tile.appendChild(renderInfo(info))
    })
    controls.forEach(function(c) { tile.appendChild(c) })

    var buttons = el('div', 'actions')
    actions.forEach(function(a) {
      if (!consumedActions[a.id]) buttons.appendChild(renderButton(a))
    })
    if (buttons.childNodes.length) tile.appendChild(buttons)
    return tile
  }

  function renderInfo(info) {
    var row = el('div', 'info')
    row.appendChild(el('span', 'label', info.name))
    var value = el('span', 'value')
    value.dataset.info = info.id
    value._update = function(v) {
      value.innerHTML = ''
      if (info.subType === 'binary') {
        value.appendChild(el('span', 'badge' + (isOn(v) ? ' on' : ''), isOn(v) ? 'ON' : 'OFF'))
      } else {
        value.appendChild(document.createTextNode(formatValue(v)))
        if (info.unit) value.appendChild(el('small', '', info.unit))
      }
    }
    row.appendChild(value)
    return row
  }

  function renderToggle(eq, linked, on, off) {
    var b = el('button', 'toggle')
    var info = eq.cmds.filter(function(c) { return String(c.id) === String(linked) })[0]
    b.appendChild(el('span', '', info ? info.name : 'Marche / Arrêt'))
    b.appendChild(el('span', 'switch'))
    b.dataset.info = linked
    b._update = function(v) { b.classList.toggle('on', isOn(v)) }
    b.addEventListener('click', function() {
      var target = isOn(state.values[linked]) ? off : on
      // Retour visuel immédiat, corrigé par la valeur renvoyée par Jeedom
      b.classList.toggle('on', target === on)
      run(b, { cmd_id: target.id })
    })
    return b
  }

  function renderButton(a) {
    var b = el('button', 'btn', a.name)
    b.addEventListener('click', function() {
      if (a.subType === 'message') {
        var message = window.prompt(a.name, '')
        if (message === null) return
        run(b, { cmd_id: a.id, title: a.name, message: message })
      } else {
        run(b, { cmd_id: a.id })
      }
    })
    return b
  }

  function renderControl(a) {
    var box = el('div', 'control')
    var head = el('div', 'row')
    head.appendChild(el('span', '', a.name))
    var current = el('b', '', '')
    head.appendChild(current)
    box.appendChild(head)

    var input
    if (a.subType === 'slider') {
      input = el('input')
      input.type = 'range'
      input.min = a.min
      input.max = a.max
      input.step = a.step || 1
      var unit = a.linkedUnit || ''
      var show = function(v) { current.textContent = formatValue(Number(v)) + (unit ? ' ' + unit : '') }
      input.addEventListener('pointerdown', function() { state.holding++ })
      var release = function() { if (state.holding > 0) state.holding-- }
      input.addEventListener('pointerup', release)
      input.addEventListener('pointercancel', release)
      input.addEventListener('input', function() { show(input.value) })
      input.addEventListener('change', function() { run(input, { cmd_id: a.id, value: input.value }) })
      box._update = function(v) {
        if (state.holding) return
        if (v === null || v === undefined || v === '') return
        input.value = v
        show(v)
      }
      show(input.value)
    } else if (a.subType === 'color') {
      input = el('input')
      input.type = 'color'
      input.addEventListener('change', function() { run(input, { cmd_id: a.id, value: input.value }) })
      box._update = function(v) {
        if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) input.value = v
        current.textContent = ''
      }
    } else {
      input = el('select')
      var placeholder = el('option', '', '—')
      placeholder.value = ''
      input.appendChild(placeholder)
      ;(a.list || []).forEach(function(item) {
        var opt = el('option', '', item.label)
        opt.value = item.value
        input.appendChild(opt)
      })
      input.addEventListener('change', function() {
        if (input.value !== '') run(input, { cmd_id: a.id, value: input.value })
      })
      box._update = function(v) {
        if (document.activeElement === input) return
        input.value = v === null || v === undefined ? '' : String(v)
      }
    }
    if (a.linked) box.dataset.info = a.linked
    box.appendChild(input)
    return box
  }

  /* ------------------------------------------------- Actions */

  function run(node, params) {
    node.classList.add('pending')
    params.action = 'exec'
    return api(params)
      .then(function(result) {
        flash(node, 'ok')
        updateValues(result.values)
      })
      .catch(function() {
        flash(node, 'err')
        updateValues({}) // remet l'affichage sur le dernier état connu
      })
  }

  function flash(node, cls) {
    node.classList.remove('pending')
    if (!node.classList.contains('btn')) return
    node.classList.add(cls)
    setTimeout(function() { node.classList.remove(cls) }, 600)
  }

  /* -------------------------------------- Valeurs & rafraîchissement */

  function updateValues(values) {
    Object.keys(values || {}).forEach(function(k) { state.values[k] = values[k] })
    grid.querySelectorAll('[data-info]').forEach(function(node) {
      var v = state.values[node.dataset.info]
      if (v !== undefined && node._update) node._update(v)
    })
  }

  function loadStructure() {
    return api({ action: 'get' }).then(function(result) {
      state.lastStructure = Date.now()
      var key = JSON.stringify([result.config, result.objects])
      state.config = result.config
      if (key !== state.structureKey) {
        state.structureKey = key
        state.objects = result.objects
        applyScreen()
        render()
      }
      updateValues(result.values)
    })
  }

  function poll() {
    clearTimeout(state.pollTimer)
    var job = Date.now() - state.lastStructure > RELOAD_STRUCTURE_MS
      ? loadStructure()
      : api({ action: 'values' }).then(function(r) { updateValues(r.values) })
    job.catch(function(e) {
      setOnline(false)
      if (!state.config) {
        grid.innerHTML = ''
        grid.appendChild(el('div', 'message error', 'Impossible de joindre Jeedom : ' + e.message + '. Nouvel essai…'))
      }
    }).then(function() {
      var delay = state.config ? Math.max(1, state.config.refresh) * 1000 : 5000
      state.pollTimer = setTimeout(poll, delay)
    })
  }

  function tickClock() {
    var now = new Date()
    document.getElementById('clock').textContent =
      String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  }

  window.addEventListener('resize', function() { if (state.config) applyScreen() })
  document.addEventListener('visibilitychange', function() { if (!document.hidden) poll() })
  document.addEventListener('contextmenu', function(e) { e.preventDefault() })

  tickClock()
  setInterval(tickClock, 1000)
  poll()
})()
