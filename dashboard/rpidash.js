/* RPi Dash - dashboard tactile pour Jeedom */
(function() {
  'use strict'

  var BOOT = window.RPIDASH
  var RELOAD_STRUCTURE_MS = 5 * 60 * 1000
  var CAMERA_REFRESH_MS = 3000
  var HOME_IDLE_MS = 2 * 60 * 1000 // retour à l'accueil après 2 min sans toucher l'écran

  // Libellés des codes de statut (widgets Boîte aux lettres et Présence) : à adapter si besoin
  var MAILBOX_LABELS = { 0: 'Vide', 1: 'Courrier', 2: 'Colis', 3: 'Courrier + colis' }
  var PEOPLE_LABELS = {}

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
    try { return localStorage.getItem('rpidash-room-' + BOOT.id) || '' } catch (e) { return '' }
  }

  function saveRoom(room) {
    try { localStorage.setItem('rpidash-room-' + BOOT.id, room) } catch (e) {}
  }

  function isOn(value) {
    if (typeof value === 'number') return value > 0
    if (value === true) return true
    return /^(1|on|true|yes|oui|marche|allum)/i.test(String(value === null || value === undefined ? '' : value).trim())
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === '') return '—'
    if (typeof value === 'number') return Math.round(value * 10) / 10 + ''
    return String(value)
  }

  function normalize(text) {
    return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  }

  function capitalize(text) {
    text = String(text || '').trim()
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
  }

  function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  // Valeur courante d'une info, avec son unité
  function bindValue(node, id, unit) {
    node.dataset.info = id
    node._update = function(v) {
      node.textContent = formatValue(v)
      if (unit && v !== '' && v !== null) node.appendChild(el('small', '', unit))
    }
    return node
  }

  // Détermine si une commande action est un "on", un "off" ou un "toggle"
  function actionKind(cmd) {
    var gt = (cmd.genericType || '').toUpperCase()
    if (/(^|_)TOGGLE$/.test(gt)) return 'toggle'
    if (/_ON$|_SET_LOCK$/.test(gt)) return 'on'
    if (/_OFF$|_SET_UNLOCK$/.test(gt)) return 'off'
    var name = normalize(cmd.name)
    if (/(^|\s)(toggle|basculer|inverser)(\s|$)/.test(name)) return 'toggle'
    if (/^(on|allumer|marche|activer)(\s|$)|\son$/.test(name)) return 'on'
    if (/^(off|eteindre|arret|desactiver)(\s|$)|\soff$/.test(name)) return 'off'
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
    var colsChanged = state.cols && state.cols !== cols
    state.cols = cols
    var font = Math.max(12, Math.min(24, Math.round(Math.min(width / cols / 15, height / 28))))
    root.style.setProperty('--cols', cols)
    root.style.setProperty('--font', font + 'px')
    root.style.setProperty('--gap', Math.round(font * 0.65) + 'px')

    document.getElementById('title').textContent = c.title || ''
    document.title = c.title || 'RPi Dash'
    document.getElementById('clock').style.display = c.showClock ? '' : 'none'
    rooms.style.display = c.showRooms ? '' : 'none'
    if (colsChanged) render()
  }

  /* -------------------------------------------------------- Rendu */

  function hasHome() {
    return state.objects.some(function(o) { return o.eqLogics.some(function(e) { return e.home }) })
  }

  function render() {
    renderRooms()
    grid.innerHTML = ''
    var home = state.room === 'home'
    var showAll = !state.config.showRooms || state.room === 'all'
    var count = 0
    state.objects.forEach(function(object) {
      if (!home && !showAll && String(object.id) !== state.room) return
      object.eqLogics.forEach(function(eq) {
        if (home && !eq.home) return
        grid.appendChild(renderEqLogic(eq, (showAll || home) && state.config.showRooms ? object.name : ''))
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
    if (!state.config.showRooms) {
      state.room = 'all'
      return
    }
    var entries = (hasHome() ? [{ id: 'home', name: 'Accueil' }] : []).concat([{ id: 'all', name: 'Tout' }], state.objects)
    var exists = entries.some(function(o) { return String(o.id) === state.room })
    if (!exists) state.room = hasHome() ? 'home' : 'all'
    if (entries.length <= 2 && !hasHome()) {
      // Une seule pièce et pas d'accueil : les onglets ne servent à rien
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
    var widget = WIDGETS[eq.widget] ? eq.widget : 'generic'
    var tile = el('div', 'tile w-' + widget)
    if (eq.size > 1 && state.cols > 1) tile.style.gridColumn = 'span ' + Math.min(eq.size, state.cols)
    var head = el('div', 'tile-head')
    head.appendChild(icon(WIDGET_ICONS[widget] || 'cube', 'tile-icon'))
    var titles = el('div', 'tile-titles')
    titles.appendChild(el('div', 'tile-title', eq.name))
    if (roomName) titles.appendChild(el('div', 'tile-room', roomName))
    head.appendChild(titles)
    tile.appendChild(head)

    var ctx = { tile: tile, head: head, eq: eq, used: {} }
    renderBattery(ctx)
    // Partie spécialisée du widget ; les commandes qu'il n'utilise pas sont affichées ensuite
    WIDGETS[widget](ctx)
    renderGeneric(ctx)
    return tile
  }

  // Batterie : petit badge dans l'en-tête plutôt qu'une ligne
  function renderBattery(ctx) {
    ctx.eq.cmds.forEach(function(c) {
      if (c.type !== 'info') return
      var name = normalize(c.name)
      if (c.subType === 'numeric' && ((c.genericType || '').toUpperCase() === 'BATTERY' || /^(batterie|battery|pile)s?$/.test(name))) {
        ctx.used[c.id] = true
        var badge = el('span', 'head-badge')
        badge.dataset.info = c.id
        badge._update = function(v) {
          badge.textContent = ''
          if (v === '' || v === null) return
          badge.appendChild(icon('battery'))
          badge.appendChild(document.createTextNode(formatValue(v) + '%'))
          badge.classList.toggle('warn', Number(v) <= 20)
        }
        ctx.head.appendChild(badge)
      } else if (c.subType === 'binary' && /(batterie|battery|pile).*(faible|critique|basse|low)|low.?batt/.test(name)) {
        ctx.used[c.id] = true
        var low = el('span', 'head-badge warn')
        low.dataset.info = c.id
        low._update = function(v) {
          low.textContent = ''
          low.style.display = isOn(v) ? '' : 'none'
          if (isOn(v)) {
            low.appendChild(icon('battery'))
            low.appendChild(document.createTextNode('faible'))
          }
        }
        ctx.head.appendChild(low)
      }
    })
  }

  function renderGeneric(ctx) {
    var eq = ctx.eq
    var used = ctx.used

    renderToggleGroups(ctx)

    // Curseurs, couleurs, listes : affichent eux-mêmes la valeur liée
    var controls = []
    eq.cmds.forEach(function(a) {
      if (a.type !== 'action' || used[a.id]) return
      if (a.subType === 'slider' || a.subType === 'color' || a.subType === 'select') {
        var infoId = a.linked || infoByName(ctx, a)
        used[a.id] = true
        if (infoId) used[infoId] = true
        controls.push(renderControl(a, infoId))
      }
    })

    eq.cmds.forEach(function(info) {
      if (info.type === 'info' && !used[info.id]) ctx.tile.appendChild(renderInfo(info))
    })
    controls.forEach(function(c) { ctx.tile.appendChild(c) })

    var buttons = el('div', 'actions')
    eq.cmds.forEach(function(a) {
      if (a.type === 'action' && !used[a.id]) buttons.appendChild(renderButton(a))
    })
    if (buttons.childNodes.length) ctx.tile.appendChild(buttons)
  }

  // Info dont le nom contient celui d'une action non liée (ex. "Temp demande" -> "etat temp demande")
  function infoByName(ctx, action) {
    var name = normalize(action.name)
    if (name.length < 3) return 0
    var info = ctx.eq.cmds.filter(function(c) {
      return c.type === 'info' && !ctx.used[c.id] && normalize(c.name) !== name && normalize(c.name).indexOf(name) !== -1
    })[0]
    return info ? info.id : 0
  }

  function findCmd(ctx, id) {
    return ctx.eq.cmds.filter(function(c) { return String(c.id) === String(id) })[0] || null
  }

  // Libellé d'un interrupteur : nom de l'info liée sans "Etat", sinon nom de l'action sans "On/Off"
  function toggleLabel(ctx, linked, actions) {
    var info = findCmd(ctx, linked)
    var label = info ? info.name : actions[0].name
    label = label.replace(/(^|\s)(etat|état|statut|state|status|on|off|toggle)(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim()
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Marche / Arrêt'
  }

  // Actions reliées à une même info binaire (On/Off, Toggle) -> un interrupteur
  function renderToggleGroups(ctx, opts) {
    opts = opts || {}
    var groups = {}
    var order = []
    ctx.eq.cmds.forEach(function(a) {
      if (a.type !== 'action' || ctx.used[a.id] || a.subType !== 'other' || !a.linked || a.linkedSubType !== 'binary') return
      if (!groups[a.linked]) { groups[a.linked] = []; order.push(a.linked) }
      groups[a.linked].push(a)
    })
    var box = opts.container || ctx.tile
    order.forEach(function(linked) {
      var cmds = { on: null, off: null, toggle: null }
      groups[linked].forEach(function(a) {
        var kind = actionKind(a)
        if (kind && !cmds[kind]) cmds[kind] = a
      })
      if (!cmds.toggle && !(cmds.on && cmds.off)) return
      var label = toggleLabel(ctx, linked, groups[linked])
      box.appendChild(renderToggle({
        label: opts.labelFor ? opts.labelFor(label) : label,
        icon: opts.iconFor ? opts.iconFor(label) : '',
        stateId: linked, on: cmds.on, off: cmds.off, toggle: cmds.toggle
      }))
      ;[cmds.on, cmds.off, cmds.toggle].forEach(function(c) { if (c) ctx.used[c.id] = true })
      ctx.used[linked] = true
    })
  }

  function renderToggle(opts) {
    var b = el('button', 'toggle')
    if (opts.icon) b.appendChild(icon(opts.icon))
    b.appendChild(el('span', 'toggle-label', opts.label))
    b.appendChild(el('span', 'switch'))
    b.dataset.info = opts.stateId
    b._update = function(v) { b.classList.toggle('on', isOn(v)) }
    b.addEventListener('click', function() {
      var current = isOn(state.values[opts.stateId])
      var target = (current ? opts.off : opts.on) || opts.toggle
      if (!target) return
      // Retour visuel immédiat, corrigé par la valeur renvoyée par Jeedom
      b.classList.toggle('on', !current)
      run(b, { cmd_id: target.id })
    })
    return b
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

  function renderButton(a, iconName) {
    var b = el('button', 'btn')
    if (iconName) b.appendChild(icon(iconName))
    b.appendChild(document.createTextNode(a.name))
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

  function renderControl(a, infoId) {
    infoId = infoId || a.linked
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
    if (infoId) box.dataset.info = infoId
    box.appendChild(input)
    return box
  }

  /* ------------------------------------------------------- Icônes */

  var CLOUD_UP = '<path d="M7 15h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15z"/>'
  var ICONS = {
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
    power: '<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/>',
    shutter: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M3 13h18M3 18h18"/>',
    thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>',
    droplet: '<path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    cloud: '<path d="M7 19h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 10.5 4.3 4.3 0 0 0 7 19z"/>',
    cloudsun: '<path d="M12 2v1.5M5.6 4.6l1 1M2.5 11H4M18.4 4.6l-1 1"/><path d="M8.3 9.5a4 4 0 0 1 7.3-.8"/><path d="M9 21h8a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8 14a3.5 3.5 0 0 0 1 7z"/>',
    rain: CLOUD_UP + '<path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    snow: CLOUD_UP + '<path d="M8 19h.01M12 19h.01M16 19h.01M10 22h.01M14 22h.01"/>',
    storm: CLOUD_UP + '<path d="M13 15l-2 4h3l-2 4"/>',
    fog: '<path d="M4 10h16M4 14h16M6 18h12M7 6h10"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>',
    arrow: '<path d="M12 21V3M6 9l6-6 6 6"/>',
    sunrise: '<path d="M12 2v6M9 5l3-3 3 3M3 18h18M6 18a6 6 0 0 1 12 0M2 22h20"/>',
    sunset: '<path d="M12 8V2M9 5l3 3 3-3M3 18h18M6 18a6 6 0 0 1 12 0M2 22h20"/>',
    gauge: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
    leaf: '<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
    bolt: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    door: '<path d="M3 21h18M6 21V3h12v18"/><circle cx="15" cy="12" r="1"/>',
    window: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M4 12h16"/>',
    motion: '<circle cx="13" cy="4" r="2"/><path d="M8 22l3-7 3 3v4M6 12l4-4 4 1 3 3"/>',
    fire: '<path d="M12 22c4 0 7-3 7-7 0-5-5-8-6-13-2 3-3 5-3 8-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.9-1"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    camera: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/>',
    gate: '<path d="M3 20V5M21 20V5M3 8h18M3 17h18M7.5 8v9M12 8v9M16.5 8v9"/>',
    waves: '<path d="M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 13c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M8 8V4M12 8V3M16 8V4"/>',
    bubbles: '<circle cx="8" cy="15" r="3"/><circle cx="15" cy="8" r="2.5"/><circle cx="17" cy="16" r="1.5"/>',
    filter: '<path d="M3 4h18l-7 9v6l-4 2v-8z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    parcel: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    robot: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3"/>',
    home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    battery: '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    cube: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16"/>'
  }
  var WIDGET_ICONS = {
    light: 'bulb', plug: 'power', shutter: 'shutter', thermostat: 'thermo', sensor: 'gauge',
    detector: 'motion', lock: 'lock', alarm: 'shield', weather: 'cloudsun', camera: 'camera',
    gate: 'gate', spa: 'waves', mailbox: 'mail', trash: 'trash', vacuum: 'robot', people: 'user',
    generic: 'cube'
  }

  function icon(name, cls) {
    var span = el('span', 'ico' + (cls ? ' ' + cls : ''))
    span.dataset.icon = name
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.cube) + '</svg>'
    return span
  }

  function setIcon(span, name) {
    if (!span || span.dataset.icon === name) return
    span.dataset.icon = name
    span.querySelector('svg').innerHTML = ICONS[name] || ICONS.cube
  }

  // Icône d'une mesure d'après son type générique, son unité ou son nom
  function measureIcon(cmd) {
    var gt = (cmd.genericType || '').toUpperCase()
    var unit = (cmd.unit || '').toLowerCase()
    var name = normalize(cmd.name)
    if (/TEMPERATURE/.test(gt) || unit === '°c' || /temp/.test(name)) return 'thermo'
    if (/HUMIDITY/.test(gt) || /humid|hygro/.test(name)) return 'droplet'
    if (/RAIN/.test(gt) || /^mm/.test(unit) || /pluie|pluvio/.test(name)) return 'rain'
    if (/CO2/.test(gt) || unit === 'ppm' || /co2/.test(name)) return 'leaf'
    if (/NOISE/.test(gt) || unit === 'db' || /sono|bruit/.test(name)) return 'volume'
    if (/PRESSURE/.test(gt) || /^(hpa|mb|mbar|pa)$/.test(unit) || /pression|baro/.test(name)) return 'gauge'
    if (/WIND/.test(gt) || /km\/h|m\/s/.test(unit) || /vent/.test(name)) return 'wind'
    if (/BRIGHTNESS|UV/.test(gt) || unit === 'lux' || /lumino|^uv/.test(name)) return 'sun'
    if (/POWER|CONSUMPTION|VOLTAGE/.test(gt) || /^(w|kw|kwh|wh|v|a)$/.test(unit) || /puissance|conso/.test(name)) return 'bolt'
    return 'gauge'
  }

  /* --------------------------------------------- Recherche de commandes */

  // Cherche une commande non utilisée : d'abord par type générique, puis par nom
  function find(ctx, type, genericRegex, nameRegex, subType) {
    var cmds = ctx.eq.cmds.filter(function(c) {
      return c.type === type && !ctx.used[c.id] && (!subType || c.subType === subType)
    })
    var match = genericRegex ? cmds.filter(function(c) { return genericRegex.test((c.genericType || '').toUpperCase()) })[0] : null
    if (!match && nameRegex) match = cmds.filter(function(c) { return nameRegex.test(normalize(c.name)) })[0]
    return match || null
  }

  function findAll(ctx, type, genericRegex) {
    return ctx.eq.cmds.filter(function(c) {
      return c.type === type && !ctx.used[c.id] && genericRegex.test((c.genericType || '').toUpperCase())
    })
  }

  // Action on/off/toggle : par type générique, sinon d'après son nom
  function findKind(ctx, kind, genericRegex) {
    return find(ctx, 'action', genericRegex, null, 'other') || ctx.eq.cmds.filter(function(c) {
      return c.type === 'action' && c.subType === 'other' && !ctx.used[c.id] && actionKind(c) === kind
    })[0] || null
  }

  function take(ctx) {
    for (var i = 1; i < arguments.length; i++) {
      var cmd = arguments[i]
      if (cmd) {
        ctx.used[cmd.id] = true
        if (cmd.linked) ctx.used[cmd.linked] = true
      }
    }
  }

  function infoSubType(ctx, id) {
    var info = findCmd(ctx, id)
    if (info) return info.subType
    var action = ctx.eq.cmds.filter(function(c) { return String(c.linked) === String(id) })[0]
    return action ? action.linkedSubType : ''
  }

  /* --------------------------------------------- Briques communes */

  // Gros bouton avec icône et libellé d'état
  function renderBigSwitch(ctx, opts) {
    var b = el('button', 'big-switch')
    var ico = icon(opts.icon)
    var label = el('span', 'big-label', '—')
    b.appendChild(ico)
    b.appendChild(label)
    var current = false
    var show = function(on, v) {
      current = on
      b.classList.toggle('on', on)
      label.textContent = opts.label(on, v)
      if (opts.iconFor) setIcon(ico, opts.iconFor(on, v))
    }
    if (opts.stateId) {
      b.dataset.info = opts.stateId
      b._update = function(v) { show(opts.isOn(v), v) }
    }
    b.addEventListener('click', function() {
      var params = opts.click(current)
      if (!params) return
      if (opts.stateId) show(!current, current ? '' : '1') // retour visuel immédiat, corrigé par Jeedom
      run(b, params)
    })
    ctx.tile.appendChild(b)
    return b
  }

  // Interrupteur principal (lumière, prise, chauffage) : types génériques puis noms
  function switchWidget(ctx, prefix, iconName, labels) {
    var stateInfo = find(ctx, 'info', new RegExp('^' + prefix + '_(STATE|STATE_BOOL)$'))
      || find(ctx, 'info', null, /^(statut|etat|state|status)$/)
    var on = findKind(ctx, 'on', new RegExp('^' + prefix + '_ON$'))
    var off = findKind(ctx, 'off', new RegExp('^' + prefix + '_OFF$'))
    var toggle = findKind(ctx, 'toggle', new RegExp('^' + prefix + '_TOGGLE$'))
    var slider = find(ctx, 'action', new RegExp('^' + prefix + '_SLIDER$'), null, 'slider')
    var stateId = stateInfo ? stateInfo.id : ((on && on.linked) || (off && off.linked) || (toggle && toggle.linked) || (slider && slider.linked) || 0)
    // Sans info d'état, un couple On/Off reste en deux boutons simples
    if (!stateId && !toggle) return false
    var sub = infoSubType(ctx, stateId)
    take(ctx, stateInfo, on, off, toggle)
    renderBigSwitch(ctx, {
      icon: iconName,
      stateId: stateId,
      isOn: function(v) { return sub === 'numeric' ? Number(v) > 0 : isOn(v) },
      label: function(isOnNow, v) {
        if (isOnNow && sub === 'numeric' && slider && Number(v) < slider.max) {
          return labels[0] + ' ' + Math.round((Number(v) - slider.min) / ((slider.max - slider.min) || 1) * 100) + ' %'
        }
        return isOnNow ? labels[0] : labels[1]
      },
      click: function(isOnNow) {
        var target = (isOnNow ? off : on) || toggle
        if (target) return { cmd_id: target.id }
        if (slider) return { cmd_id: slider.id, value: isOnNow ? slider.min : slider.max }
        return null
      }
    })
    if (slider) {
      take(ctx, slider)
      ctx.tile.appendChild(renderControl(slider))
    }
    return true
  }

  // Consigne réglable par − / + (thermostat, spa)
  function renderSetpoint(ctx, action, infoId, unit, label) {
    var step = action.step && action.step !== 1 ? action.step : 0.5
    var row = el('div', 'setpoint')
    var minus = el('button', 'btn round')
    minus.appendChild(icon('minus'))
    var plus = el('button', 'btn round')
    plus.appendChild(icon('plus'))
    var shown = el('div', 'setpoint-value')
    shown.appendChild(el('small', '', label || 'Consigne'))
    var shownValue = el('b', '', '—')
    shown.appendChild(shownValue)
    var target = null
    var timer = null
    var display = function(v) { shownValue.textContent = formatValue(Number(v)) + ' ' + unit }
    var bump = function(delta) {
      var base = target !== null ? target : Number(state.values[infoId])
      if (isNaN(base)) base = (action.min + action.max) / 2
      target = Math.max(action.min, Math.min(action.max, Math.round((base + delta) / step) * step))
      display(target)
      clearTimeout(timer)
      // Envoi groupé après la dernière pression
      timer = setTimeout(function() {
        run(shown, { cmd_id: action.id, value: target }).then(function() { target = null })
      }, 900)
    }
    minus.addEventListener('click', function() { bump(-step) })
    plus.addEventListener('click', function() { bump(step) })
    if (infoId) {
      row.dataset.info = infoId
      row._update = function(v) { if (target === null && v !== '') display(v) }
    }
    row.appendChild(minus)
    row.appendChild(shown)
    row.appendChild(plus)
    ctx.tile.appendChild(row)
  }

  // Boutons de mode (thermostat, alarme) : le mode actif est mis en évidence
  function renderModes(ctx, actions, modeInfo) {
    take(ctx, modeInfo)
    var buttons = el('div', 'actions modes')
    actions.forEach(function(a) {
      take(ctx, a)
      if (a.subType === 'select') {
        ctx.tile.appendChild(renderControl(a))
        return
      }
      var b = el('button', 'btn', a.name)
      b.dataset.mode = normalize(a.name)
      b.addEventListener('click', function() { run(b, { cmd_id: a.id }) })
      buttons.appendChild(b)
    })
    if (!buttons.childNodes.length) {
      if (modeInfo) ctx.tile.appendChild(renderInfo(modeInfo))
      return
    }
    if (modeInfo) {
      buttons.dataset.info = modeInfo.id
      buttons._update = function(v) {
        var mode = normalize(v)
        buttons.querySelectorAll('.btn').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === mode) })
      }
    }
    ctx.tile.appendChild(buttons)
  }

  // Pastilles de mesures secondaires (icône + valeur + nom)
  function renderChips(ctx, cmds) {
    if (!cmds.length) return
    var chips = el('div', 'chips')
    cmds.forEach(function(c) {
      take(ctx, c)
      var chip = el('div', 'chip')
      chip.appendChild(icon(c.icon || measureIcon(c)))
      var text = el('div', 'chip-text')
      var value = el('b')
      if (c.format) {
        value.dataset.info = c.id
        value._update = function(v) { value.textContent = c.format(v) }
      } else {
        bindValue(value, c.id, c.unit)
      }
      text.appendChild(value)
      text.appendChild(el('small', '', c.label || c.name))
      chip.appendChild(text)
      if (c.trend) chip.appendChild(trendNode(c.trend))
      chips.appendChild(chip)
    })
    ctx.tile.appendChild(chips)
  }

  function trendNode(trendInfo) {
    var node = el('span', 'trend')
    node.dataset.info = trendInfo.id
    node._update = function(v) {
      var t = normalize(v)
      node.textContent = /up|haus|mont/.test(t) ? '↗' : /down|bais|desc/.test(t) ? '↘' : /stable/.test(t) ? '→' : ''
    }
    return node
  }

  // Info "<nom> (tendance)", "<nom> (minimum)"… associée à une mesure
  function companion(ctx, cmd, suffixRegex) {
    var re = new RegExp('^' + escapeRegex(normalize(cmd.name)) + '\\s*\\(?\\s*(' + suffixRegex + ')\\s*\\)?$')
    return ctx.eq.cmds.filter(function(c) { return c.type === 'info' && !ctx.used[c.id] && re.test(normalize(c.name)) })[0] || null
  }

  /* ------------------------------------------- Widgets spécialisés */

  var WIDGETS = {
    generic: function() {},

    light: function(ctx) {
      switchWidget(ctx, '(?:LIGHT|ENERGY)', 'bulb', ['Allumée', 'Éteinte'])
      var color = find(ctx, 'action', /^LIGHT_SET_COLOR$/, null, 'color')
      if (color) {
        take(ctx, color, find(ctx, 'info', /^LIGHT_COLOR$/))
        ctx.tile.appendChild(renderControl(color))
      }
    },

    plug: function(ctx) {
      switchWidget(ctx, 'ENERGY', 'power', ['Marche', 'Arrêt'])
    },

    shutter: function(ctx) {
      var stateInfo = find(ctx, 'info', /^FLAP_(BSO_)?STATE$/)
      var up = find(ctx, 'action', /^FLAP_(BSO_)?UP$/, /^(monter|haut|ouvrir|up|open)$/, 'other')
      var down = find(ctx, 'action', /^FLAP_(BSO_)?DOWN$/, /^(descendre|bas|fermer|down|close)$/, 'other')
      var stop = find(ctx, 'action', /^FLAP_STOP$/, /^stop$/, 'other')
      var slider = find(ctx, 'action', /^FLAP_SLIDER$/, null, 'slider') || find(ctx, 'action', null, /position|niveau|level/, 'slider')
      var stateId = stateInfo ? stateInfo.id : ((slider && slider.linked) || (up && up.linked) || (down && down.linked) || 0)
      take(ctx, stateInfo, up, down, stop)

      if (stateId) {
        var sub = infoSubType(ctx, stateId)
        var min = slider ? slider.min : 0
        var max = slider ? slider.max : (sub === 'binary' ? 1 : 100)
        var row = el('div', 'shutter-row')
        var visual = el('div', 'shutter')
        var blind = el('div', 'shutter-blind')
        visual.appendChild(blind)
        var label = el('div', 'big-value', '—')
        row.appendChild(visual)
        row.appendChild(label)
        row.dataset.info = stateId
        row._update = function(v) {
          var open = sub === 'binary' ? (isOn(v) ? 1 : 0) : (Number(v) - min) / ((max - min) || 1)
          open = Math.max(0, Math.min(1, open))
          blind.style.height = Math.round((1 - open) * 100) + '%'
          if (sub === 'binary') label.textContent = isOn(v) ? 'Ouvert' : 'Fermé'
          else label.textContent = open <= 0 ? 'Fermé' : open >= 1 ? 'Ouvert' : Math.round(open * 100) + ' %'
        }
        ctx.tile.appendChild(row)
      }

      var buttons = el('div', 'actions icons')
      ;[[up, 'up'], [stop, 'stop'], [down, 'down']].forEach(function(pair) {
        if (!pair[0]) return
        var b = el('button', 'btn')
        b.title = pair[0].name
        b.appendChild(icon(pair[1]))
        b.addEventListener('click', function() { run(b, { cmd_id: pair[0].id }) })
        buttons.appendChild(b)
      })
      if (buttons.childNodes.length) ctx.tile.appendChild(buttons)
      if (slider) {
        take(ctx, slider)
        ctx.tile.appendChild(renderControl(slider))
      }
    },

    thermostat: function(ctx) {
      var temp = find(ctx, 'info', /^(THERMOSTAT_TEMPERATURE|TEMPERATURE)$/)
      var outdoor = find(ctx, 'info', /^THERMOSTAT_TEMPERATURE_OUTDOOR$/)
      var setpoint = find(ctx, 'info', /^THERMOSTAT_SETPOINT$/)
      var setAction = find(ctx, 'action', /^THERMOSTAT_SET_SETPOINT$/, /consigne|setpoint|thermostat/, 'slider')
      var heatState = find(ctx, 'info', /^(THERMOSTAT_STATE_NAME|THERMOSTAT_STATE)$/)
      var modeInfo = find(ctx, 'info', /^THERMOSTAT_MODE$/)

      // Chauffage simple (radiateur, convecteur) : un interrupteur
      if (!temp && !setAction) {
        switchWidget(ctx, 'HEATING', 'fire', ['Chauffe', 'Arrêt'])
        return
      }
      take(ctx, temp, outdoor, setpoint, setAction, heatState)

      var top = el('div', 'thermo-top')
      if (temp) top.appendChild(bindValue(el('div', 'big-value'), temp.id, temp.unit || '°C'))
      if (heatState) {
        var badge = el('span', 'badge')
        badge.dataset.info = heatState.id
        badge._update = function(v) {
          var text = heatState.subType === 'string' ? String(v || '') : (isOn(v) ? 'Chauffe' : 'Arrêt')
          badge.classList.toggle('heat', heatState.subType === 'string' ? /chauff|heat/i.test(text) : isOn(v))
          badge.classList.toggle('cool', /clim|cool|froid/i.test(text))
          badge.textContent = text || '—'
        }
        top.appendChild(badge)
      }
      if (top.childNodes.length) ctx.tile.appendChild(top)
      if (outdoor) {
        var out = el('div', 'subline')
        out.appendChild(icon('home'))
        out.appendChild(document.createTextNode('Extérieur '))
        out.appendChild(bindValue(el('b'), outdoor.id, outdoor.unit || '°C'))
        ctx.tile.appendChild(out)
      }

      if (setAction) {
        renderSetpoint(ctx, setAction, setpoint ? setpoint.id : setAction.linked, (setpoint && setpoint.unit) || '°C')
      }
      renderModes(ctx, findAll(ctx, 'action', /^THERMOSTAT_SET_MODE$/), modeInfo)

      var lock = find(ctx, 'action', /^THERMOSTAT_SET_LOCK$/, null, 'other')
      var unlock = find(ctx, 'action', /^THERMOSTAT_SET_UNLOCK$/, null, 'other')
      if (lock && unlock && lock.linked) {
        take(ctx, lock, unlock)
        ctx.tile.appendChild(renderToggle({ label: 'Verrouillage', icon: 'lock', stateId: lock.linked, on: lock, off: unlock }))
      }
    },

    sensor: function(ctx) {
      var numeric = ctx.eq.cmds.filter(function(c) {
        return c.type === 'info' && c.subType === 'numeric' && !ctx.used[c.id] && !/\((min|max)/.test(normalize(c.name))
      })
      var main = numeric.filter(function(c) { return (c.genericType || '').toUpperCase() === 'TEMPERATURE' })[0]
        || numeric.filter(function(c) { return (c.unit || '').toLowerCase() === '°c' })[0]
        || numeric[0]
      if (!main) return
      take(ctx, main)
      setIcon(ctx.tile.querySelector('.tile-icon'), measureIcon(main))

      var top = el('div', 'thermo-top')
      var value = bindValue(el('div', 'big-value'), main.id, main.unit)
      var trend = companion(ctx, main, 'tendance|trend')
      var line = el('div', 'value-line')
      line.appendChild(value)
      if (trend) {
        take(ctx, trend)
        line.appendChild(trendNode(trend))
      }
      top.appendChild(line)
      var min = companion(ctx, main, 'minimum|min')
      var max = companion(ctx, main, 'maximum|max')
      if (min || max) {
        take(ctx, min, max)
        var range = el('div', 'minmax')
        if (max) { range.appendChild(document.createTextNode('↑ ')); range.appendChild(bindValue(el('b'), max.id, '°')) }
        if (min) { range.appendChild(document.createTextNode(' ↓ ')); range.appendChild(bindValue(el('b'), min.id, '°')) }
        top.appendChild(range)
      }
      ctx.tile.appendChild(top)

      // Autres mesures numériques en pastilles, avec leur tendance éventuelle
      var others = ctx.eq.cmds.filter(function(c) { return c.type === 'info' && c.subType === 'numeric' && !ctx.used[c.id] })
      others.forEach(function(c) {
        var t = companion(ctx, c, 'tendance|trend')
        if (t) { take(ctx, t); c.trend = t }
      })
      renderChips(ctx, others)
    },

    detector: function(ctx) {
      var kinds = {
        opening: { icon: 'door', on: 'Fermé', off: 'Ouvert', normalWhenOn: true },
        window: { icon: 'window', on: 'Fermée', off: 'Ouverte', normalWhenOn: true },
        presence: { icon: 'motion', on: 'Mouvement', off: 'Calme' },
        smoke: { icon: 'fire', on: 'Fumée !', off: 'OK', alert: true },
        flood: { icon: 'droplet', on: 'Fuite !', off: 'OK', alert: true },
        binary: { icon: 'motion', on: 'Actif', off: 'Inactif' }
      }
      var openingName = /ouvrant|ouverture|porte|fenetre|portail|garage|baie/
      // Convention Jeedom pour les ouvertures : 1 = fermé
      var kindOf = function(cmd, fallback) {
        var gt = (cmd.genericType || '').toUpperCase()
        var name = normalize(cmd.name)
        if (/OPENING_WINDOW/.test(gt) || /fenetre|velux|baie/.test(name)) return kinds.window
        if (/OPENING|GARAGE|GATE|BARRIER/.test(gt)) return kinds.opening
        if (/PRESENCE/.test(gt)) return kinds.presence
        if (/SMOKE/.test(gt) || /fumee|smoke/.test(name)) return kinds.smoke
        if (/FLOOD/.test(gt) || /fuite|inond|flood/.test(name)) return kinds.flood
        return fallback || kinds.binary
      }

      var binaries = ctx.eq.cmds.filter(function(c) { return c.type === 'info' && c.subType === 'binary' && !ctx.used[c.id] })
      var main = find(ctx, 'info', /^(OPENING|OPENING_WINDOW|PRESENCE|SMOKE|FLOOD|GARAGE_STATE|GATE_STATE|BARRIER_STATE)$/) || binaries[0]
      if (!main) return

      // Plusieurs ouvrants dans un même équipement : une liste avec un résumé
      if (binaries.length > 1 && openingName.test(normalize(ctx.eq.name))) {
        setIcon(ctx.tile.querySelector('.tile-icon'), 'door')
        var summary = el('div', 'detector')
        summary.appendChild(icon('door'))
        var summaryLabel = el('span', 'big-label', '—')
        summary.appendChild(summaryLabel)
        ctx.tile.appendChild(summary)
        var list = el('div', 'open-list')
        var refreshSummary = function() {
          var open = list.querySelectorAll('.open-item.is-open').length
          summaryLabel.textContent = open === 0 ? 'Tout est fermé' : open === 1 ? '1 ouvert' : open + ' ouverts'
          summary.classList.toggle('active', open === 0)
          summary.classList.toggle('warn', open > 0)
        }
        binaries.forEach(function(c) {
          take(ctx, c)
          var kind = kindOf(c, kinds.opening)
          var item = el('div', 'open-item')
          item.appendChild(icon(kind.icon))
          item.appendChild(el('span', 'open-name', c.name))
          var st = el('span', 'open-state', '—')
          item.appendChild(st)
          item.dataset.info = c.id
          item._update = function(v) {
            var openNow = kind.normalWhenOn ? !isOn(v) : isOn(v)
            st.textContent = isOn(v) ? kind.on : kind.off
            item.classList.toggle('is-open', openNow)
            refreshSummary()
          }
          list.appendChild(item)
        })
        ctx.tile.appendChild(list)
        return
      }

      take(ctx, main)
      var kind = kindOf(main)
      setIcon(ctx.tile.querySelector('.tile-icon'), kind.icon)
      var box = el('div', 'detector')
      box.appendChild(icon(kind.icon))
      var label = el('span', 'big-label', '—')
      box.appendChild(label)
      box.dataset.info = main.id
      box._update = function(v) {
        var on = isOn(v)
        label.textContent = on ? kind.on : kind.off
        box.classList.toggle('active', kind.normalWhenOn ? on : (!kind.alert && on))
        box.classList.toggle('warn', !!kind.normalWhenOn && !on)
        box.classList.toggle('alert', !!kind.alert && on)
      }
      ctx.tile.appendChild(box)
    },

    lock: function(ctx) {
      var open = find(ctx, 'action', /^LOCK_OPEN$/, /^(ouvrir|deverrouiller|unlock|open)$/, 'other')
      var close = find(ctx, 'action', /^LOCK_CLOSE$/, /^(fermer|verrouiller|lock|close)$/, 'other')
      // Nuki & co : l'état lisible ("Verrouillée", "Déverrouillée"…) est plus fiable que le binaire
      var stateInfo = find(ctx, 'info', /^LOCK_STATE$/)
        || find(ctx, 'info', null, /nom\s*etat|state\s*name|^etat$|^statut$/, 'string')
        || find(ctx, 'info', null, /^etat|^statut/, 'binary')
      var stateId = stateInfo ? stateInfo.id : ((open && open.linked) || (close && close.linked) || 0)
      if (!stateId || (!open && !close)) return
      take(ctx, stateInfo, open, close, find(ctx, 'info', null, /^etat$/, 'numeric'))
      var textual = stateInfo && stateInfo.subType === 'string'
      var locked = function(v) { return textual ? /^(verrouill|locked|ferm)/.test(normalize(v)) : isOn(v) }
      renderBigSwitch(ctx, {
        icon: 'lock',
        stateId: stateId,
        isOn: locked,
        iconFor: function(isLocked) { return isLocked ? 'lock' : 'unlock' },
        label: function(isLocked, v) { return textual && v ? capitalize(v) : (isLocked ? 'Verrouillée' : 'Déverrouillée') },
        click: function(isLocked) {
          if (isLocked) {
            if (!open || !window.confirm('Déverrouiller « ' + ctx.eq.name + ' » ?')) return null
            return { cmd_id: open.id }
          }
          return close ? { cmd_id: close.id } : null
        }
      })
    },

    alarm: function(ctx) {
      var enabled = find(ctx, 'info', /^ALARM_ENABLE_STATE$/)
      var triggered = find(ctx, 'info', /^ALARM_STATE$/)
      var modeInfo = find(ctx, 'info', /^ALARM_MODE$/)
      var arm = find(ctx, 'action', /^ALARM_ARMED$/, /^(activer|armer|on)$/, 'other')
      var disarm = find(ctx, 'action', /^ALARM_RELEASED$/, /^(desactiver|desarmer|off)$/, 'other')
      take(ctx, enabled, triggered)
      var enabledId = enabled ? enabled.id : ((arm && arm.linked) || (disarm && disarm.linked) || 0)
      if (enabledId && (arm || disarm)) {
        take(ctx, arm, disarm)
        renderBigSwitch(ctx, {
          icon: 'shield',
          stateId: enabledId,
          isOn: isOn,
          label: function(armed) { return armed ? 'Activée' : 'Désactivée' },
          click: function(armed) {
            if (armed) {
              if (!disarm || !window.confirm('Désactiver l\'alarme ?')) return null
              return { cmd_id: disarm.id }
            }
            return arm ? { cmd_id: arm.id } : null
          }
        })
      }
      if (triggered) {
        var alert = el('div', 'detector')
        alert.appendChild(icon('shield'))
        var text = el('span', 'big-label', '—')
        alert.appendChild(text)
        alert.dataset.info = triggered.id
        alert._update = function(v) {
          text.textContent = isOn(v) ? 'Déclenchée !' : 'Pas d\'intrusion'
          alert.classList.toggle('alert', isOn(v))
        }
        ctx.tile.appendChild(alert)
      }
      renderModes(ctx, findAll(ctx, 'action', /^ALARM_SET_MODE$/), modeInfo)
    },

    weather: function(ctx) {
      var cmds = ctx.eq.cmds
      // Commande d'un type générique ; les prévisions horaires "H+n" passent après
      var byType = function(gt) {
        var all = cmds.filter(function(c) { return (c.genericType || '').toUpperCase() === gt })
        return all.filter(function(c) { return !/h\+\d/i.test(c.name) })[0] || all[0] || null
      }
      var temp = byType('WEATHER_TEMPERATURE')
      var cond = byType('WEATHER_CONDITION')
      var condId = byType('WEATHER_CONDITION_ID')
      var tmax = byType('WEATHER_TEMPERATURE_MAX')
      var tmin = byType('WEATHER_TEMPERATURE_MIN')

      var now = el('div', 'wx-now')
      var bigIcon = icon('cloudsun', 'wx-icon')
      now.appendChild(bigIcon)
      if (condId || cond) {
        bigIcon.dataset.info = (condId || cond).id
        bigIcon._update = function(v) {
          var text = cond ? state.values[cond.id] : ''
          setIcon(bigIcon, weatherIcon(condId ? v : null, text))
        }
      }
      var main = el('div', 'wx-main')
      if (temp) main.appendChild(bindValue(el('div', 'big-value'), temp.id, temp.unit || '°C'))
      if (cond) main.appendChild(bindValue(el('div', 'wx-cond'), cond.id))
      now.appendChild(main)
      if (tmax || tmin) {
        var range = el('div', 'minmax')
        if (tmax) { range.appendChild(document.createTextNode('↑ ')); range.appendChild(bindValue(el('b'), tmax.id, '°')) }
        if (tmin) { range.appendChild(document.createTextNode(' ↓ ')); range.appendChild(bindValue(el('b'), tmin.id, '°')) }
        now.appendChild(range)
      }
      ctx.tile.appendChild(now)

      var chips = []
      var hum = byType('WEATHER_HUMIDITY')
      var wind = byType('WEATHER_WIND_SPEED')
      var dir = byType('WEATHER_WIND_DIRECTION')
      var rain = byType('WEATHER_RAIN')
      var pressure = byType('WEATHER_PRESSURE')
      var sunrise = byType('WEATHER_SUNRISE')
      var sunset = byType('WEATHER_SUNSET')
      var hhmm = function(v) {
        var n = String(v || '').replace(/\D/g, '')
        if (!n) return '—'
        n = ('0000' + n).slice(-4)
        return n.slice(0, 2) + ':' + n.slice(2)
      }
      if (hum) chips.push({ id: hum.id, unit: hum.unit || '%', label: 'Humidité', icon: 'droplet' })
      if (wind) chips.push({ id: wind.id, unit: wind.unit || 'km/h', label: 'Vent', icon: 'wind', dir: dir })
      if (rain) chips.push({ id: rain.id, unit: rain.unit || 'mm', label: 'Pluie', icon: 'rain' })
      if (pressure) chips.push({ id: pressure.id, unit: 'hPa', label: 'Pression', icon: 'gauge' })
      if (sunrise) chips.push({ id: sunrise.id, label: 'Lever', icon: 'sunrise', format: hhmm })
      if (sunset) chips.push({ id: sunset.id, label: 'Coucher', icon: 'sunset', format: hhmm })
      renderChips(ctx, chips)
      if (dir) {
        // Flèche de direction du vent sur la pastille "Vent"
        var arrow = icon('arrow', 'wind-dir')
        arrow.dataset.info = dir.id
        arrow._update = function(v) {
          // La direction indique d'où vient le vent : la flèche pointe où il va
          arrow.style.transform = 'rotate(' + ((Number(v) || 0) + 180) + 'deg)'
          arrow.style.visibility = v === '' || v === null ? 'hidden' : ''
        }
        var windChip = ctx.tile.querySelectorAll('.chip')[hum ? 1 : 0]
        if (windChip) windChip.appendChild(arrow)
      }

      // Prévisions des jours suivants
      var days = el('div', 'wx-days')
      var names = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
      var today = new Date().getDay()
      for (var n = 1; n <= 6; n++) {
        var dCond = byType('WEATHER_CONDITION_ID_' + n)
        var dText = byType('WEATHER_CONDITION_' + n)
        var dMax = byType('WEATHER_TEMPERATURE_MAX_' + n)
        var dMin = byType('WEATHER_TEMPERATURE_MIN_' + n)
        if (!dMax && !dCond) continue
        var day = el('div', 'wx-day')
        day.appendChild(el('span', 'wx-day-name', n === 1 ? 'Demain' : names[(today + n) % 7]))
        var dIcon = icon('cloudsun')
        if (dCond || dText) {
          dIcon.dataset.info = (dCond || dText).id
          ;(function(dIcon, dCond, dText) {
            dIcon._update = function(v) { setIcon(dIcon, weatherIcon(dCond ? v : null, dText ? state.values[dText.id] : '')) }
          })(dIcon, dCond, dText)
        }
        day.appendChild(dIcon)
        var temps = el('span', 'wx-day-temps')
        if (dMax) temps.appendChild(bindValue(el('b'), dMax.id, '°'))
        if (dMin) temps.appendChild(bindValue(el('small'), dMin.id, '°'))
        day.appendChild(temps)
        days.appendChild(day)
      }
      if (days.childNodes.length) ctx.tile.appendChild(days)

      // Les dizaines d'autres commandes météo (horaires, pollution…) ne sont pas affichées
      cmds.forEach(function(c) { if (c.type === 'info') ctx.used[c.id] = true })
    },

    camera: function(ctx) {
      if (!ctx.eq.camera) return
      var src = /^https?:\/\//.test(ctx.eq.camera) ? ctx.eq.camera : BOOT.root + ctx.eq.camera.replace(/^\//, '')
      var wrap = el('div', 'camera')
      var img = el('img')
      img.alt = ctx.eq.name
      var fail = el('div', 'camera-fail', 'Image indisponible')
      var load = function() {
        img.src = src + (src.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now()
      }
      var next = function(delay) {
        // Recharge tant que l'image est affichée
        setTimeout(function() { if (img.isConnected) load() }, delay)
      }
      img.addEventListener('load', function() { wrap.classList.remove('failed'); next(CAMERA_REFRESH_MS) })
      img.addEventListener('error', function() { wrap.classList.add('failed'); next(10000) })
      wrap.appendChild(img)
      wrap.appendChild(fail)
      wrap.addEventListener('click', function() { openCamera(ctx.eq.name, src) })
      ctx.tile.appendChild(wrap)
      load()
      var buttons = el('div', 'actions')
      ctx.eq.cmds.forEach(function(a) {
        if (a.type !== 'action' || ctx.used[a.id]) return
        take(ctx, a)
        var gt = (a.genericType || '').toUpperCase()
        buttons.appendChild(renderButton(a, gt === 'CAMERA_TAKE' ? 'camera' : gt === 'CAMERA_STOP' ? 'stop' : ''))
      })
      if (buttons.childNodes.length) ctx.tile.appendChild(buttons)
    },

    gate: function(ctx) {
      // Les actions "Off …" remettent à zéro les impulsions du virtuel : inutiles à l'écran
      ctx.eq.cmds.forEach(function(a) {
        if (a.type === 'action' && /^off\b/.test(normalize(a.name))) ctx.used[a.id] = true
      })
      var walk = find(ctx, 'action', /^GB_TOGGLE$/, /passage|pieton/, 'other')
      take(ctx, walk)
      var open = find(ctx, 'action', /^GB_OPEN$/, /ouvr|open/, 'other')
      take(ctx, open)
      var close = find(ctx, 'action', /^GB_CLOSE$/, /ferm|close/, 'other')
      take(ctx, close)
      var status = el('div', 'subline', '')
      var buttons = el('div', 'actions big-actions')
      var entries = [[open, 'up', 'Ouvrir', 'Ouverture en cours…'], [close, 'down', 'Fermer', 'Fermeture en cours…'], [walk, 'motion', 'Piéton', 'Passage piéton en cours…']]
      var refreshStatus = function() {
        var active = buttons.querySelector('.btn.active')
        status.textContent = active ? active.dataset.status : 'Portail au repos'
      }
      entries.forEach(function(entry) {
        var a = entry[0]
        if (!a) return
        var b = el('button', 'btn')
        b.appendChild(icon(entry[1]))
        b.appendChild(document.createTextNode(entry[2]))
        b.dataset.status = entry[3]
        b.addEventListener('click', function() { run(b, { cmd_id: a.id }) })
        if (a.linked) {
          b.dataset.info = a.linked
          b._update = function(v) { b.classList.toggle('active', isOn(v)); refreshStatus() }
        }
        buttons.appendChild(b)
      })
      ctx.tile.appendChild(buttons)
      ctx.tile.appendChild(status)
      refreshStatus()
    },

    spa: function(ctx) {
      var set = find(ctx, 'action', null, /temp|consigne/, 'slider')
      if (set) {
        var infoId = set.linked || infoByName(ctx, set)
        take(ctx, set)
        if (infoId) ctx.used[infoId] = true
        renderSetpoint(ctx, set, infoId, '°C', 'Température demandée')
      }
      var labels = { power: 'Marche', bubble: 'Bulles', bubbles: 'Bulles', filter: 'Filtration', heater: 'Chauffe', heat: 'Chauffe' }
      var icons = { marche: 'power', bulles: 'bubbles', filtration: 'filter', chauffe: 'fire' }
      var grid2 = el('div', 'toggle-grid')
      renderToggleGroups(ctx, {
        container: grid2,
        labelFor: function(label) { return labels[normalize(label)] || label },
        iconFor: function(label) { return icons[normalize(labels[normalize(label)] || label)] || (/power/i.test(label) ? 'power' : 'waves') }
      })
      if (grid2.childNodes.length) ctx.tile.appendChild(grid2)
    },

    mailbox: function(ctx) {
      var info = find(ctx, 'info', null, /boite|courrier|mail|lettre|colis/) || find(ctx, 'info', null, /./)
      if (!info) return
      take(ctx, info)
      var box = el('div', 'detector')
      var ico = icon('mail')
      box.appendChild(ico)
      var label = el('span', 'big-label', '—')
      box.appendChild(label)
      box.dataset.info = info.id
      box._update = function(v) {
        var key = String(v === null || v === undefined ? '' : v).trim()
        var empty = key === '' || key === '0'
        label.textContent = MAILBOX_LABELS[key] || (empty ? 'Vide' : key)
        setIcon(ico, /colis/i.test(label.textContent) ? 'parcel' : 'mail')
        box.classList.toggle('active', !empty)
        box.classList.toggle('notify', !empty)
      }
      ctx.tile.appendChild(box)
    },

    trash: function(ctx) {
      var colors = {
        jaune: '#facc15', verte: '#22c55e', vert: '#22c55e', bleue: '#3b82f6', bleu: '#3b82f6',
        grise: '#94a3b8', gris: '#94a3b8', noire: '#475569', noir: '#475569', marron: '#a16207', rouge: '#ef4444', blanche: '#e2e8f0'
      }
      var bins = ctx.eq.cmds.filter(function(c) {
        return c.type === 'info' && c.subType === 'binary' && !ctx.used[c.id] && !/vide|vider/.test(normalize(c.name))
          && !ctx.eq.cmds.some(function(a) { return a.type === 'action' && String(a.linked) === String(c.id) })
      })
      if (!bins.length) return
      var row = el('div', 'bins')
      bins.forEach(function(c) {
        take(ctx, c)
        var bin = el('div', 'bin')
        var ico = icon('trash')
        ico.style.color = colors[normalize(c.name).split(/\s+/).pop()] || colors[normalize(c.name)] || 'var(--accent)'
        bin.appendChild(ico)
        bin.appendChild(el('span', 'bin-name', c.name))
        var st = el('span', 'bin-state', '—')
        bin.appendChild(st)
        bin.dataset.info = c.id
        bin._update = function(v) {
          bin.classList.toggle('out', isOn(v))
          st.textContent = isOn(v) ? 'À sortir' : '—'
        }
        row.appendChild(bin)
      })
      ctx.tile.appendChild(row)
    },

    vacuum: function(ctx) {
      var order = find(ctx, 'info', null, /^(ordre|etat|statut|status|state|mode)/, 'string')
      var box = el('div', 'detector')
      box.appendChild(icon('robot'))
      var label = el('span', 'big-label', '—')
      box.appendChild(label)
      if (order) {
        take(ctx, order)
        box.dataset.info = order.id
        box._update = function(v) {
          label.textContent = v ? capitalize(v) : 'Au repos'
          var current = normalize(v)
          rooms2.querySelectorAll('.btn').forEach(function(b) { b.classList.toggle('active', b.dataset.room === current) })
        }
      }
      ctx.tile.appendChild(box)

      var main = el('div', 'actions')
      var rooms2 = el('div', 'actions rooms-grid')
      ctx.eq.cmds.forEach(function(a) {
        if (a.type !== 'action' || a.subType !== 'other' || ctx.used[a.id]) return
        var name = normalize(a.name)
        if (/^raz$|^reset/.test(name)) return
        take(ctx, a)
        if (/^(base|dock|retour|home|maison)$/.test(name)) main.appendChild(renderButton(a, 'home'))
        else if (/^(charge|recharge)$/.test(name)) main.appendChild(renderButton(a, 'bolt'))
        else if (/^(stop|pause|arret)$/.test(name)) main.appendChild(renderButton(a, 'stop'))
        else {
          var b = renderButton(a)
          b.dataset.room = name
          rooms2.appendChild(b)
        }
      })
      if (main.childNodes.length) ctx.tile.appendChild(main)
      if (rooms2.childNodes.length) ctx.tile.appendChild(rooms2)
    },

    people: function(ctx) {
      var list = el('div', 'people')
      ctx.eq.cmds.forEach(function(c) {
        if (c.type !== 'info' || ctx.used[c.id]) return
        var m = /^statut\s+(.+)$/i.exec(c.name.trim())
        if (!m) return
        take(ctx, c)
        list.appendChild(renderPerson(m[1], c))
      })
      // Les coordonnées GPS brutes ne sont pas utiles sur l'écran
      ctx.eq.cmds.forEach(function(c) { if (c.type === 'info' && /^position\s/i.test(c.name.trim())) ctx.used[c.id] = true })
      if (list.childNodes.length) ctx.tile.appendChild(list)
    }
  }

  /* ------------------------------------------------- Présence */

  // Libellé d'un état à partir du nom de l'action qui le déclenche ("pre Will" -> "À la maison")
  function personStateLabel(actionName, person, key) {
    var label = actionName ? String(actionName).replace(new RegExp('\\s*\\b' + escapeRegex(person) + '\\b\\s*', 'i'), ' ').trim() : ''
    var n = normalize(label)
    if (/^(pre|pres|present|presente|maison)$/.test(n)) return 'À la maison'
    if (/^(abs|absent|absente|dehors|parti)$/.test(n)) return 'Pas à la maison'
    if (/^(taf|travail|boulot|job)$/.test(n)) return 'Au taf'
    if (label) return label.charAt(0).toUpperCase() + label.slice(1)
    if (PEOPLE_LABELS[key]) return PEOPLE_LABELS[key]
    return key === '1' ? 'À la maison' : key === '0' ? 'Pas à la maison' : key === '' ? '—' : 'Statut ' + key
  }

  function personStateColor(label, key) {
    var n = normalize(label)
    if (/^a la maison/.test(n)) return '#16a34a'
    if (/absent|dehors|pas a la maison/.test(n)) return '#64748b'
    if (/taf|travail|bureau|cabinet/.test(n)) return '#c73b38'
    if (/animation/.test(n)) return '#ea580c'
    if (/domicile/.test(n)) return '#2563eb'
    if (/vacances|voyage/.test(n)) return '#0891b2'
    return ['#64748b', '#16a34a', '#c73b38', '#2563eb', '#ea580c', '#9333ea', '#0891b2'][Number(key) % 7] || '#7c3aed'
  }

  // Avatars : plugins/rpidash/data/avatars/<prénom>-<code>.png (par état) ou <prénom>.png
  var missingImages = {}
  function setAvatar(img, fallback, candidates) {
    var src = candidates.filter(function(c) { return !missingImages[c] })[0]
    if (!src) {
      img.style.display = 'none'
      fallback.style.display = ''
      return
    }
    if (img.dataset.src === src) return
    img.dataset.src = src
    img.onload = function() { img.style.display = ''; fallback.style.display = 'none' }
    img.onerror = function() { missingImages[src] = true; img.dataset.src = ''; setAvatar(img, fallback, candidates) }
    img.src = src
  }

  function renderPerson(person, info) {
    var slug = normalize(person).replace(/[^a-z0-9]+/g, '-')
    var base = BOOT.root + 'plugins/rpidash/data/avatars/' + slug
    var card = el('div', 'person-card')
    var avatar = el('div', 'pc-avatar')
    var img = el('img')
    img.alt = person
    img.style.display = 'none'
    var initial = el('span', 'pc-initial', person.charAt(0).toUpperCase())
    avatar.appendChild(img)
    avatar.appendChild(initial)
    card.appendChild(avatar)
    card.appendChild(el('div', 'pc-name', person))
    var banner = el('div', 'pc-banner', '—')
    card.appendChild(banner)
    card.dataset.info = info.id
    card._update = function(v) {
      var key = String(v === null || v === undefined ? '' : v).trim()
      var st = (info.states || []).filter(function(s) { return String(s.value) === key })[0]
      var label = personStateLabel(st ? st.label : '', person, key)
      var color = personStateColor(label, key)
      banner.textContent = label
      banner.style.background = color
      initial.style.background = color
      card.classList.toggle('away', /absent|dehors|pas a la maison/.test(normalize(label)))
      setAvatar(img, initial, [base + '-' + key + '.png', base + '.png'])
    }
    return card
  }

  // Icône météo d'après le code (WeatherAPI ou OpenWeatherMap), sinon d'après le texte
  function weatherIcon(code, text) {
    var c = Number(code)
    if (c >= 1000) {
      if (c === 1000) return 'sun'
      if (c === 1003) return 'cloudsun'
      if (c === 1006 || c === 1009) return 'cloud'
      if (c === 1030 || c === 1135 || c === 1147) return 'fog'
      if (c === 1087 || c >= 1273) return 'storm'
      if (c === 1066 || c === 1114 || c === 1117 || (c >= 1210 && c <= 1225) || (c >= 1255 && c <= 1264)) return 'snow'
      return 'rain'
    }
    if (c >= 200 && c < 300) return 'storm'
    if (c >= 300 && c < 600) return 'rain'
    if (c >= 600 && c < 700) return 'snow'
    if (c >= 700 && c < 800) return 'fog'
    if (c === 800) return 'sun'
    if (c === 801 || c === 802) return 'cloudsun'
    if (c > 802) return 'cloud'
    var t = normalize(text)
    if (/orage/.test(t)) return 'storm'
    if (/neige|flocon/.test(t)) return 'snow'
    if (/pluie|pluvieu|averse|bruine/.test(t)) return 'rain'
    if (/brouillard|brume/.test(t)) return 'fog'
    if (/partiel|eclaircie|peu nuageux/.test(t)) return 'cloudsun'
    if (/couvert|nuage/.test(t)) return 'cloud'
    if (/soleil|ensoleill|clair|degage/.test(t)) return 'sun'
    return 'cloudsun'
  }

  // Caméra en plein écran (toucher pour fermer)
  function openCamera(name, src) {
    var overlay = el('div', 'overlay')
    var img = el('img')
    img.alt = name
    overlay.appendChild(img)
    overlay.appendChild(el('div', 'overlay-title', name))
    var load = function() { img.src = src + (src.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now() }
    img.addEventListener('load', function() { setTimeout(function() { if (img.isConnected) load() }, 1000) })
    overlay.addEventListener('click', function() { overlay.remove() })
    app.appendChild(overlay)
    load()
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
      // Les valeurs d'abord, pour que les widgets s'affichent directement à jour
      Object.keys(result.values || {}).forEach(function(k) { state.values[k] = result.values[k] })
      if (key !== state.structureKey) {
        state.structureKey = key
        state.objects = result.objects
        applyScreen()
        render()
      }
      updateValues({})
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

  // Retour automatique à l'accueil quand personne n'utilise l'écran
  var idleTimer = null
  function armIdle() {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(function() {
      var overlay = app.querySelector('.overlay')
      if (overlay) overlay.remove()
      if (state.config && state.config.showRooms && hasHome() && state.room !== 'home') {
        state.room = 'home'
        render()
        grid.scrollTop = 0
      }
    }, HOME_IDLE_MS)
  }
  document.addEventListener('pointerdown', armIdle)
  armIdle()

  window.addEventListener('resize', function() { if (state.config) applyScreen() })
  document.addEventListener('visibilitychange', function() { if (!document.hidden) poll() })
  document.addEventListener('contextmenu', function(e) { e.preventDefault() })

  tickClock()
  setInterval(tickClock, 1000)
  poll()
})()
