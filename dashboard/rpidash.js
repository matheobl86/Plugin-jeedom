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

    // Partie spécialisée du widget ; les commandes qu'il n'utilise pas sont affichées ensuite
    var used = {}
    WIDGETS[widget]({ tile: tile, eq: eq, used: used })
    renderGeneric(tile, eq, used)
    return tile
  }

  function renderGeneric(tile, eq, used) {
    var infos = eq.cmds.filter(function(c) { return c.type === 'info' })
    var actions = eq.cmds.filter(function(c) { return c.type === 'action' })
    // Les id de commandes sont uniques : une seule table suffit
    var consumedInfos = used
    var consumedActions = used

    // Couples ON/OFF reliés à la même info binaire -> un interrupteur
    var groups = {}
    actions.forEach(function(a) {
      if (!consumedActions[a.id] && a.subType === 'other' && a.linked && a.linkedSubType === 'binary') {
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

  /* ------------------------------------------- Widgets spécialisés */

  var ICONS = {
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
    power: '<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/>',
    shutter: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M3 13h18M3 18h18"/>',
    thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>',
    droplet: '<path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    bolt: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    gauge: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
    door: '<path d="M3 21h18M6 21V3h12v18"/><circle cx="15" cy="12" r="1"/>',
    motion: '<circle cx="13" cy="4" r="2"/><path d="M8 22l3-7 3 3v4M6 12l4-4 4 1 3 3"/>',
    fire: '<path d="M12 22c4 0 7-3 7-7 0-5-5-8-6-13-2 3-3 5-3 8-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.9-1"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    cube: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16"/>'
  }
  var WIDGET_ICONS = {
    light: 'bulb', plug: 'power', shutter: 'shutter', thermostat: 'thermo', sensor: 'gauge',
    detector: 'motion', lock: 'lock', alarm: 'shield', generic: 'cube'
  }

  function icon(name, cls) {
    var span = el('span', 'ico' + (cls ? ' ' + cls : ''))
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.cube) + '</svg>'
    return span
  }

  function setIcon(span, name) {
    if (span.dataset.icon === name) return
    span.dataset.icon = name
    span.querySelector('svg').innerHTML = ICONS[name] || ICONS.cube
  }

  // Cherche une commande non utilisée : d'abord par type générique, puis par nom
  function find(ctx, type, genericRegex, nameRegex, subType) {
    var cmds = ctx.eq.cmds.filter(function(c) {
      return c.type === type && !ctx.used[c.id] && (!subType || c.subType === subType)
    })
    var match = cmds.filter(function(c) { return genericRegex && genericRegex.test((c.genericType || '').toUpperCase()) })[0]
    if (!match && nameRegex) match = cmds.filter(function(c) { return nameRegex.test((c.name || '').trim()) })[0]
    return match || null
  }

  function findAll(ctx, type, genericRegex) {
    return ctx.eq.cmds.filter(function(c) {
      return c.type === type && !ctx.used[c.id] && genericRegex.test((c.genericType || '').toUpperCase())
    })
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
    var info = ctx.eq.cmds.filter(function(c) { return String(c.id) === String(id) })[0]
    if (info) return info.subType
    var action = ctx.eq.cmds.filter(function(c) { return String(c.linked) === String(id) })[0]
    return action ? action.linkedSubType : ''
  }

  function stateIsOn(subType, v) {
    if (subType === 'numeric') return Number(v) > 0
    return isOn(v)
  }

  var NAME_ON = /^(on|allumer|marche|activer)$/i
  var NAME_OFF = /^(off|éteindre|eteindre|arr[êe]t|désactiver|desactiver)$/i
  var NAME_TOGGLE = /^(toggle|basculer|inverser)$/i

  // Gros bouton rond avec icône et libellé d'état
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
      if (opts.stateId) show(!current) // retour visuel immédiat, corrigé par Jeedom
      run(b, params)
    })
    ctx.tile.appendChild(b)
    return b
  }

  function switchWidget(ctx, prefix, iconName, labels) {
    var stateInfo = find(ctx, 'info', new RegExp('^' + prefix + '_(STATE|STATE_BOOL)$'))
    var on = find(ctx, 'action', new RegExp('^' + prefix + '_ON$'), NAME_ON, 'other')
    var off = find(ctx, 'action', new RegExp('^' + prefix + '_OFF$'), NAME_OFF, 'other')
    var toggle = find(ctx, 'action', new RegExp('^' + prefix + '_TOGGLE$'), NAME_TOGGLE, 'other')
    var slider = find(ctx, 'action', new RegExp('^' + prefix + '_SLIDER$'), null, 'slider')
    var stateId = stateInfo ? stateInfo.id : ((on && on.linked) || (off && off.linked) || (toggle && toggle.linked) || (slider && slider.linked) || 0)
    // Sans info d'état, un couple On/Off reste en deux boutons simples
    if (!stateId && !toggle) return
    var sub = infoSubType(ctx, stateId)
    take(ctx, stateInfo, on, off, toggle)
    renderBigSwitch(ctx, {
      icon: iconName,
      stateId: stateId,
      isOn: function(v) { return stateIsOn(sub, v) },
      label: function(isOnNow, v) {
        if (isOnNow && sub === 'numeric' && slider && Number(v) < slider.max) {
          return labels[0] + ' ' + Math.round((Number(v) - slider.min) / ((slider.max - slider.min) || 1) * 100) + ' %'
        }
        return isOnNow ? labels[0] : labels[1]
      },
      click: function(isOnNow) {
        if (toggle && !(isOnNow ? off : on)) return { cmd_id: toggle.id }
        var target = isOnNow ? off : on
        if (target) return { cmd_id: target.id }
        if (slider) return { cmd_id: slider.id, value: isOnNow ? slider.min : slider.max }
        return null
      }
    })
    if (slider) {
      take(ctx, slider)
      ctx.tile.appendChild(renderControl(slider))
    }
  }

  var WIDGETS = {
    generic: function() {},

    light: function(ctx) {
      switchWidget(ctx, 'LIGHT', 'bulb', ['Allumée', 'Éteinte'])
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
      var up = find(ctx, 'action', /^FLAP_(BSO_)?UP$/, /^(monter|haut|ouvrir|up|open)$/i, 'other')
      var down = find(ctx, 'action', /^FLAP_(BSO_)?DOWN$/, /^(descendre|bas|fermer|down|close)$/i, 'other')
      var stop = find(ctx, 'action', /^FLAP_STOP$/, /^stop$/i, 'other')
      var slider = find(ctx, 'action', /^FLAP_SLIDER$/, null, 'slider') || find(ctx, 'action', null, /position|niveau|level/i, 'slider')
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
      var temp = find(ctx, 'info', /^(THERMOSTAT_TEMPERATURE|TEMPERATURE)$/) || find(ctx, 'info', null, /temp/i, 'numeric')
      var setpoint = find(ctx, 'info', /^THERMOSTAT_SETPOINT$/)
      var setAction = find(ctx, 'action', /^THERMOSTAT_SET_SETPOINT$/, /consigne|setpoint|thermostat/i, 'slider')
      var heatState = find(ctx, 'info', /^(THERMOSTAT_STATE|THERMOSTAT_STATE_NAME|HEATING_STATE)$/)
      var modeInfo = find(ctx, 'info', /^THERMOSTAT_MODE$/)
      take(ctx, temp, setpoint, setAction, heatState)

      var top = el('div', 'thermo-top')
      if (temp) {
        var value = el('div', 'big-value')
        value.dataset.info = temp.id
        value._update = function(v) {
          value.textContent = formatValue(v)
          value.appendChild(el('small', '', temp.unit || '°C'))
        }
        top.appendChild(value)
      }
      if (heatState) {
        var badge = el('span', 'badge')
        badge.dataset.info = heatState.id
        badge._update = function(v) {
          var on = heatState.subType === 'string' ? !/^(off|arr[êe]t|stopped|idle|0)?$/i.test(String(v).trim()) : isOn(v)
          badge.classList.toggle('heat', on)
          badge.textContent = heatState.subType === 'string' && v ? String(v) : (on ? 'Chauffe' : 'Arrêt')
        }
        top.appendChild(badge)
      }
      if (top.childNodes.length) ctx.tile.appendChild(top)

      var setpointId = setpoint ? setpoint.id : (setAction && setAction.linked)
      if (setAction) {
        var step = setAction.step && setAction.step !== 1 ? setAction.step : 0.5
        var row = el('div', 'setpoint')
        var minus = el('button', 'btn round')
        minus.appendChild(icon('minus'))
        var plus = el('button', 'btn round')
        plus.appendChild(icon('plus'))
        var shown = el('div', 'setpoint-value')
        shown.appendChild(el('small', '', 'Consigne'))
        var shownValue = el('b', '', '—')
        shown.appendChild(shownValue)
        var target = null
        var timer = null
        var display = function(v) { shownValue.textContent = formatValue(Number(v)) + ' °C' }
        var bump = function(delta) {
          var base = target !== null ? target : Number(state.values[setpointId])
          if (isNaN(base)) base = (setAction.min + setAction.max) / 2
          target = Math.max(setAction.min, Math.min(setAction.max, Math.round((base + delta) / step) * step))
          display(target)
          clearTimeout(timer)
          // Envoi groupé après la dernière pression
          timer = setTimeout(function() {
            var value = target
            run(shown, { cmd_id: setAction.id, value: value }).then(function() { target = null })
          }, 900)
        }
        minus.addEventListener('click', function() { bump(-step) })
        plus.addEventListener('click', function() { bump(step) })
        if (setpointId) {
          row.dataset.info = setpointId
          row._update = function(v) { if (target === null) display(v) }
        }
        row.appendChild(minus)
        row.appendChild(shown)
        row.appendChild(plus)
        ctx.tile.appendChild(row)
      }

      renderModes(ctx, findAll(ctx, 'action', /^THERMOSTAT_SET_MODE$/), modeInfo)
    },

    sensor: function(ctx) {
      var numeric = ctx.eq.cmds.filter(function(c) { return c.type === 'info' && c.subType === 'numeric' && !ctx.used[c.id] })
      var main = find(ctx, 'info', /^TEMPERATURE$/, null, 'numeric')
        || numeric.filter(function(c) { return (c.unit || '').toLowerCase() === '°c' })[0]
        || numeric[0]
      if (!main) return
      take(ctx, main)
      var gt = (main.genericType || '').toUpperCase()
      var unit = (main.unit || '').toLowerCase()
      var iconName = /TEMPERATURE/.test(gt) || unit === '°c' ? 'thermo'
        : /HUMIDITY/.test(gt) || /humid/i.test(main.name) ? 'droplet'
        : /BRIGHTNESS|UV/.test(gt) || unit === 'lux' ? 'sun'
        : /POWER|CONSUMPTION|VOLTAGE/.test(gt) || /^(w|kw|kwh|wh|v|a)$/.test(unit) ? 'bolt' : 'gauge'
      setIcon(ctx.tile.querySelector('.tile-icon'), iconName)
      var value = el('div', 'big-value')
      value.dataset.info = main.id
      value._update = function(v) {
        value.textContent = formatValue(v)
        if (main.unit) value.appendChild(el('small', '', main.unit))
      }
      ctx.tile.appendChild(value)
    },

    detector: function(ctx) {
      var main = find(ctx, 'info', /^(OPENING|OPENING_WINDOW|PRESENCE|SMOKE|FLOOD|GARAGE_STATE|GATE_STATE|BARRIER_STATE)$/) || find(ctx, 'info', null, /./, 'binary')
      if (!main) return
      take(ctx, main)
      var gt = (main.genericType || '').toUpperCase()
      // Convention Jeedom pour les ouvertures : 1 = fermé (utilisez « Inverser » sur la commande sinon)
      var kinds = {
        opening: { icon: 'door', on: 'Fermé', off: 'Ouvert' },
        presence: { icon: 'motion', on: 'Mouvement', off: 'Calme' },
        smoke: { icon: 'fire', on: 'Fumée !', off: 'OK', alert: true },
        flood: { icon: 'droplet', on: 'Fuite !', off: 'OK', alert: true },
        binary: { icon: 'motion', on: 'Actif', off: 'Inactif' }
      }
      var kind = /OPENING|GARAGE|GATE|BARRIER/.test(gt) ? kinds.opening
        : /PRESENCE/.test(gt) ? kinds.presence
        : /SMOKE/.test(gt) ? kinds.smoke
        : /FLOOD/.test(gt) ? kinds.flood : kinds.binary
      setIcon(ctx.tile.querySelector('.tile-icon'), kind.icon)
      var box = el('div', 'detector')
      var ico = icon(kind.icon)
      var label = el('span', 'big-label', '—')
      box.appendChild(ico)
      box.appendChild(label)
      box.dataset.info = main.id
      box._update = function(v) {
        var on = isOn(v)
        label.textContent = on ? kind.on : kind.off
        box.classList.toggle('active', kind === kinds.opening ? !on : on)
        box.classList.toggle('alert', !!kind.alert && on)
      }
      ctx.tile.appendChild(box)
    },

    lock: function(ctx) {
      var stateInfo = find(ctx, 'info', /^LOCK_STATE$/)
      var open = find(ctx, 'action', /^LOCK_OPEN$/, /^(ouvrir|déverrouiller|deverrouiller|unlock|open)$/i, 'other')
      var close = find(ctx, 'action', /^LOCK_CLOSE$/, /^(fermer|verrouiller|lock|close)$/i, 'other')
      var stateId = stateInfo ? stateInfo.id : ((open && open.linked) || (close && close.linked) || 0)
      if (!stateId || (!open && !close)) return
      take(ctx, stateInfo, open, close)
      renderBigSwitch(ctx, {
        icon: 'lock',
        stateId: stateId,
        isOn: isOn,
        iconFor: function(locked) { return locked ? 'lock' : 'unlock' },
        label: function(locked) { return locked ? 'Verrouillé' : 'Déverrouillé' },
        click: function(locked) {
          if (locked) {
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
      var arm = find(ctx, 'action', /^ALARM_ARMED$/, /^(activer|armer|on)$/i, 'other')
      var disarm = find(ctx, 'action', /^ALARM_RELEASED$/, /^(désactiver|desactiver|désarmer|desarmer|off)$/i, 'other')
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
    }
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
      b.dataset.mode = a.name.trim().toLowerCase()
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
        var mode = String(v || '').trim().toLowerCase()
        buttons.querySelectorAll('.btn').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === mode) })
      }
    }
    ctx.tile.appendChild(buttons)
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
