// Mermaid gantt charts drawn to the diagram-design gantt: task names in a left column, hairline bars on a dated axis,
// sections as ink-wash phase zones under a tracked eyebrow. The critical path takes the accent, done work recedes,
// the active task carries an ink outline. Syntax that is not understood falls back to mermaid itself, see render()
var gantt = (() => {
  var DAY = 86400000
  var UNITS = {ms: 1, s: 1000, m: 60000, h: 3600000, d: DAY, w: 7 * DAY}
  var TAGS = ['done', 'active', 'crit', 'milestone', 'vert']

  // a dateFormat as a regex over its tokens, only the numeric ones are understood
  var dateParser = (format) => {
    var fields = []
    var source = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/YYYY|MM|DD|HH|mm|ss|M|D|H/g, (token) => {
      fields.push(token[0] === 'Y' ? 'Y' : token === 'mm' ? 'n' : token === 'ss' ? 's' : token[0])
      return token.length === 4 ? '(\\d{4})' : token.length === 2 ? '(\\d{2})' : '(\\d{1,2})'
    })
    if (!fields.includes('Y') || !fields.includes('M') || !fields.includes('D')) return null
    var regex = new RegExp('^' + source + '$')
    return (text) => {
      var match = regex.exec(text)
      if (!match) return null
      var v = {Y: 0, M: 1, D: 1, H: 0, n: 0, s: 0}
      fields.forEach((f, i) => (v[f] = parseInt(match[i + 1], 10)))
      return Date.UTC(v.Y, v.M - 1, v.D, v.H, v.n, v.s)
    }
  }

  var duration = (text) => {
    var match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/.exec(text)
    return match ? parseFloat(match[1]) * UNITS[match[2]] : null
  }

  var weekend = (time) => {
    var day = new Date(time).getUTCDay()
    return day === 0 || day === 6
  }

  // the plain `name value` settings, keyed by the lowercased directive
  var SETTINGS = {title: 'title', dateformat: 'dateFormat', axisformat: 'axisFormat', tickinterval: 'tickInterval'}
  // switches the drawing does not follow: let mermaid draw the chart
  var UNSUPPORTED = /^(displayMode|includes|inclusiveEndDates|topAxis|weekday|weekend)\b/i

  // every directive handler returns false when the chart is not understood, mermaid then draws it
  var directives = [
    [/^acc(Title|Descr)\b/, (state, found, line) => {
      state.skip = /\{\s*$/.test(line)
      return true
    }],
    [/^(title|dateFormat|axisFormat|tickInterval)\s+(.*)$/i, (state, found) => {
      state.model[SETTINGS[found[1].toLowerCase()]] = found[2].trim()
      return true
    }],
    [/^todayMarker\s+(.*)$/i, (state, found) => {
      state.model.today = found[1].trim() !== 'off'
      return true
    }],
    [/^excludes\s+(.*)$/i, (state, found) => {
      var rest = found[1].split(/[\s,]+/).filter(Boolean)
      if (rest.some((w) => !/^weekends?$/i.test(w))) return false
      state.model.weekends = true
      return true
    }],
    [/^section\s*(.*)$/i, (state, found) => {
      addSection(state, found[1].trim())
      return true
    }],
    [/^click\s+(\S+)\s+href\s+"([^"]*)"/i, (state, found) => {
      found[1].split(',').forEach((id) => (state.model.links[id.trim()] = found[2]))
      return true
    }],
    // a click that calls a function needs the page's script, the task stays a plain bar
    [/^click\s/i, () => true],
    [UNSUPPORTED, () => false],
  ]

  var addSection = (state, name) => {
    state.section = {name, tasks: []}
    state.model.sections.push(state.section)
  }

  // `name : tags, id, start, end` -> a task in the current section, false when the metadata does not fit
  var parseTask = (state, line) => {
    var colon = line.indexOf(':')
    if (colon < 1) return false
    if (!state.section) addSection(state, '')
    var task = {name: line.slice(0, colon).trim(), section: state.section.name, tags: []}
    var meta = line.slice(colon + 1).split(',').map((m) => m.trim()).filter(Boolean)
    while (meta.length && TAGS.includes(meta[0])) task.tags.push(meta.shift())
    if (meta.length > 3 || !meta.length) return false
    if (meta.length === 3) task.id = meta.shift()
    if (meta.length === 2) task.start = meta.shift()
    task.end = meta[0]
    state.section.tasks.push(task)
    state.raw.push(task)
    return true
  }

  var parseLine = (state, line) => {
    for (var [regex, handle] of directives) {
      var found = regex.exec(line)
      if (found) return handle(state, found, line)
    }
    return parseTask(state, line)
  }

  // the lines after the gantt header into sections and unresolved tasks, null when a line is not understood
  var parseLines = (lines, model) => {
    var state = {model, section: null, raw: [], skip: false}
    var head = false
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/%%.*$/, '').trim()
      if (!line) continue
      if (!head) {
        if (!/^gantt$/i.test(line)) return null
        head = true
      }
      else if (state.skip) state.skip = !line.includes('}')
      else if (!parseLine(state, line)) return null
    }
    return head && state.raw.length ? state.raw : null
  }

  // the start: the end of the task above, the latest end of the tasks it comes after, or a date. false when unknown
  var resolveStart = (task, previous, byId, date) => {
    if (task.start === undefined) {
      if (!previous) return false
      task.from = previous.to
      return true
    }
    if (/^after\s/.test(task.start)) {
      var names = task.start.split(/\s+/).slice(1)
      var refs = names.map((r) => byId[r])
      if (!refs.length || refs.some((r) => !r)) return false
      task.from = Math.max(...refs.map((r) => r.to))
      task.after = names
      return true
    }
    task.from = date(task.start)
    return task.from !== null
  }

  // excluded days do not count toward a duration, each one pushes the end a day further. As in mermaid the bar
  // stops where the last working day ends (until), the next task still starts after the skipped days (to)
  var skipWeekends = (task) => {
    var off = false
    for (var at = task.from; at <= task.to; at += DAY) {
      if (!off) task.until = task.to
      off = weekend(at)
      if (off) task.to += DAY
    }
  }

  var resolveEnd = (task, model, date) => {
    var length = duration(task.end)
    if (length === null) {
      task.to = date(task.end)
      return task.to !== null
    }
    task.to = task.from + length
    if (model.weekends && length >= DAY) skipWeekends(task)
    return true
  }

  // ids and dates, in source order
  var resolveTasks = (raw, model, date) => {
    var byId = {}
    var previous = null
    for (var k = 0; k < raw.length; k++) {
      var task = raw[k]
      task.id = task.id || 'task' + (k + 1)
      if (!resolveStart(task, previous, byId, date) || !resolveEnd(task, model, date)) return false
      if (task.to < task.from) return false
      if (task.until === undefined) task.until = task.to
      byId[task.id] = task
      previous = task
    }
    return true
  }

  var parse = (src) => {
    var lines = draw.lines(src)
    if (!lines) return null
    var model = {title: '', dateFormat: 'YYYY-MM-DD', axisFormat: '', tickInterval: '', weekends: false, today: true, sections: [], links: {}}
    var raw = parseLines(lines, model)
    if (!raw) return null
    var date = dateParser(model.dateFormat)
    if (!date || !resolveTasks(raw, model, date)) return null
    model.tasks = raw
    return model
  }

  var {esc, num, grid, measure, fit} = draw

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  var pad = (v, n) => String(v).padStart(n || 2, '0')
  var strftime = (format, time) => {
    var d = new Date(time)
    return format.replace(/%([a-zA-Z%])/g, (all, c) => ({
      d: pad(d.getUTCDate()), e: String(d.getUTCDate()), m: pad(d.getUTCMonth() + 1), Y: String(d.getUTCFullYear()),
      y: pad(d.getUTCFullYear() % 100), b: MONTHS[d.getUTCMonth()].slice(0, 3), B: MONTHS[d.getUTCMonth()],
      a: DAYS[d.getUTCDay()].slice(0, 3), A: DAYS[d.getUTCDay()], H: pad(d.getUTCHours()), M: pad(d.getUTCMinutes()),
      j: pad(Math.floor((time - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1, 3), '%': '%'
    }[c] ?? all))
  }

  // tick times between from and to: every n units, days and weeks on calendar boundaries (weeks start on Sunday).
  // null past limit ticks: the walk stops there, a fine step over a long chart would otherwise freeze the page
  var ticks = (interval, from, to, limit) => {
    var out = []
    var d = new Date(from)
    if (interval.unit === 'month') {
      var at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
      for (var i = 0; at <= to; i++) {
        if (at >= from && out.push(at) > limit) return null
        at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (i + 1) * interval.n, 1)
      }
      return out
    }
    var step = interval.n * (interval.unit === 'week' ? 7 * DAY : interval.unit === 'day' ? DAY : UNITS[interval.unit])
    var start = interval.unit === 'week' ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay())
      : interval.unit === 'day' ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : Math.floor(from / step) * step
    for (var t = start; t <= to; t += step) if (t >= from && out.push(t) > limit) return null
    return out
  }

  var INTERVAL = {millisecond: 'ms', second: 's', minute: 'm', hour: 'h', day: 'day', week: 'week', month: 'month'}

  var MARGIN = 32
  var ROW = 40
  var BAR = 24
  var HEAD = 28
  var ZONE_GAP = 12
  var AXIS = 32

  var has = (task, tag) => task.tags.includes(tag)
  var iso = (time) => new Date(time).toISOString().slice(0, 10)

  var STEPS = [{n: 1, unit: 'h', size: 3600000}, {n: 6, unit: 'h', size: 6 * 3600000}, {n: 1, unit: 'day', size: DAY},
    {n: 2, unit: 'day', size: 2 * DAY}, {n: 1, unit: 'week', size: 7 * DAY}, {n: 2, unit: 'week', size: 14 * DAY},
    {n: 1, unit: 'month', size: 30 * DAY}, {n: 3, unit: 'month', size: 91 * DAY}, {n: 12, unit: 'month', size: 365 * DAY}]

  // a format without a day (or a month) would print the same label on every tick of a finer step: the finest step
  // that still shows a different label
  var stepFloor = (format) => {
    if (/%[HM]/.test(format)) return 0
    if (/%[deaAj]/.test(format)) return DAY
    return /%[bBm]/.test(format) ? 30 * DAY : 365 * DAY
  }

  // the axis: an explicit tickInterval, or the smallest calendar step that leaves room for its label. null for a
  // tickInterval that is not understood
  var axisInterval = (model, format, geo, mono) => {
    if (model.tickInterval) {
      var match = /^(\d+)(millisecond|second|minute|hour|day|week|month)$/.exec(model.tickInterval)
      // a zero step never moves on
      if (!match || !parseInt(match[1], 10)) return null
      return {n: parseInt(match[1], 10), unit: INTERVAL[match[2]]}
    }
    var label = measure(strftime(format, geo.from), 9, mono) + 24
    var floor = stepFloor(format)
    return STEPS.find((s) => s.size >= floor && (s.size / geo.span) * geo.timeW >= label) || STEPS[STEPS.length - 1]
  }

  // the label column fits the longest name, the time area gets a pitch that keeps day-scale charts readable
  var geometry = (model, rows, sans) => {
    var from = Math.min(...model.tasks.map((task) => task.from))
    var to = Math.max(...model.tasks.map((task) => task.until))
    if (to === from) to = from + DAY
    var span = to - from
    var labelW = grid(Math.min(240, Math.max(120, ...rows.map((task) => measure(task.name, 12, sans, 600) + 24))))
    var x0 = MARGIN + labelW + 16
    var timeW = grid(Math.max(480, Math.min(880, (span / DAY) * 20)))
    var right = x0 + timeW
    var zoneRight = right + 12
    return {from, to, span, labelW, x0, timeW, right, zoneRight, width: zoneRight + MARGIN, x: (time) => x0 + ((time - from) / span) * timeW}
  }

  // phase zones, one per section, rows inside: the zones, each row's top and where the last zone ends
  var layoutZones = (model, top0) => {
    var zones = []
    var rowY = {}
    var y = top0
    model.sections.forEach((section) => {
      var tasks = section.tasks.filter((task) => !has(task, 'vert'))
      if (!tasks.length) return
      var top = y
      var first = top + (section.name ? HEAD : 4)
      tasks.forEach((task, i) => (rowY[task.id] = first + i * ROW))
      var bottom = first + tasks.length * ROW + 4
      zones.push({name: section.name, top, bottom})
      y = bottom + ZONE_GAP
    })
    return {zones, rowY, chartBottom: y - ZONE_GAP}
  }

  var titleMarkup = (c) => `<text x="${MARGIN}" y="${MARGIN + 14}" font-family="${c.sans}" font-size="16" font-weight="600" fill="${c.t.ink}">${esc(c.model.title)}</text>`

  // zones go first, the grid draws over their wash
  var zoneMarkup = (c) => c.zones.map((zone) => {
    var box = `<rect x="${MARGIN}" y="${zone.top}" width="${c.zoneRight - MARGIN}" height="${zone.bottom - zone.top}" rx="6" ` +
      `fill="rgba(${c.t.inkRgb},0.02)" stroke="rgba(${c.t.inkRgb},0.10)"/>`
    if (!zone.name) return box
    return box + `<text x="${MARGIN + 12}" y="${zone.top + 18}" font-family="${c.mono}" font-size="8" letter-spacing="1.44" fill="${c.t.muted}">${esc(zone.name.toUpperCase())}</text>`
  })

  // excluded weekends as faint bands across the time area
  var weekendMarkup = (c) => {
    var out = []
    var start = new Date(c.from)
    for (var day = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()); day < c.to; day += DAY) {
      if (!weekend(day)) continue
      var a = Math.max(c.x(day), c.x0)
      var b = Math.min(c.x(day + DAY), c.right)
      if (b > a) out.push(`<rect x="${num(a)}" y="${c.axisY}" width="${num(b - a)}" height="${c.chartBottom - c.axisY}" fill="rgba(${c.t.inkRgb},0.035)"/>`)
    }
    return out
  }

  // mono ticks above a solid baseline with a short notch each, no lines through the zones: the only full-height
  // lines are today, the vert markers and the cursor
  var axisMarkup = (c) => [`<path d="M${c.x0},${c.axisY}H${c.right}" stroke="${c.t.ruleSolid}"/>`].concat(c.marks.map((time) => {
    var at = num(c.x(time))
    return `<path d="M${at},${c.axisY - 4}V${c.axisY}" stroke="${c.t.ruleSolid}"/>` +
      `<text x="${at}" y="${c.axisY - 10}" text-anchor="middle" font-family="${c.mono}" font-size="9" fill="${c.t.muted}">${esc(strftime(c.format, time))}</text>`
  }))

  var milestoneMarkup = (c, task, a, b, top) => {
    var cx = num((a + b) / 2)
    var cy = top + 20
    return `<path d="M${cx},${cy - 8}L${cx + 8},${cy}L${cx},${cy + 8}L${cx - 8},${cy}Z" fill="${has(task, 'crit') ? c.t.accent : c.t.ink}" stroke="${c.t.paper}" stroke-width="1.5"/>`
  }

  var barFill = (t, crit, done, active) => {
    if (crit) return t.accentTint
    if (done) return `rgba(${t.inkRgb},0.05)`
    return active ? t.node : `rgba(${t.mutedRgb || t.inkRgb},0.15)`
  }

  var barStroke = (t, crit, done, active) => {
    if (crit) return t.accent
    if (done) return t.ruleSolid
    return active ? t.ink : t.muted
  }

  var barMarkup = (c, task, a, b, top) => {
    var t = c.t
    var crit = has(task, 'crit')
    var done = has(task, 'done')
    var active = has(task, 'active')
    var w = Math.max(b - a, 4)
    var weight = active ? (crit ? 1.6 : 1.4) : 1
    // an opaque mask first, so the grid stays behind a translucent bar
    return `<rect x="${num(a)}" y="${top + 8}" width="${num(w)}" height="${BAR}" rx="4" fill="${t.paper}"/>` +
      `<rect class="gantt-bar" x="${num(a)}" y="${top + 8}" width="${num(w)}" height="${BAR}" rx="4" fill="${barFill(t, crit, done, active)}" stroke="${barStroke(t, crit, done, active)}" stroke-width="${weight}"${done && crit ? ' stroke-opacity="0.5"' : ''}/>`
  }

  var nameFill = (t, task) => {
    if (has(task, 'crit')) return t.accentText
    return has(task, 'done') ? t.muted : t.ink
  }

  // the task name in the left column, a link when the click directive gave an http one
  var nameMarkup = (c, task, top) => {
    var name = `<text x="${MARGIN + 12}" y="${top + 20}" dominant-baseline="central" font-family="${c.sans}" font-size="12" font-weight="600" fill="${nameFill(c.t, task)}">${esc(fit(task.name, c.labelW - 24, 12, c.sans, 600))}</text>`
    var link = c.model.links[task.id]
    return link && /^https?:/i.test(link) ? `<a href="${esc(link)}" target="_blank" rel="noopener">${name}</a>` : name
  }

  // the bars: name in the left column, bar on the axis
  var cardMarkup = (c, task) => {
    var top = c.rowY[task.id]
    var a = c.x(task.from)
    var b = c.x(task.until)
    var shape = has(task, 'milestone') ? milestoneMarkup(c, task, a, b, top) : barMarkup(c, task, a, b, top)
    return `<g class="node gantt-task" id="${c.id}-gantt-${esc(task.id)}-0">` + nameMarkup(c, task, top) + shape + '</g>'
  }

  // vertical markers run the full height, their name under the chart
  var vertMarkup = (c, task) => {
    var at = num(c.x(task.from))
    return `<g class="gantt-vert"><path d="M${at},${c.axisY}V${c.chartBottom + 6}" stroke="${c.t.muted}" stroke-dasharray="4 3"/>` +
      `<text x="${at}" y="${c.chartBottom + 18}" text-anchor="middle" font-family="${c.mono}" font-size="8" letter-spacing="1.12" fill="${c.t.muted}">${esc(task.name.toUpperCase())}</text></g>`
  }

  var todayMarkup = (c) => {
    var tx = num(c.x(c.now))
    return `<g class="gantt-today"><path d="M${tx},${c.axisY}V${c.chartBottom}" stroke="${c.t.accent}"/>` +
      `<text x="${tx}" y="${c.chartBottom + 12}" text-anchor="middle" font-family="${c.mono}" font-size="8" letter-spacing="1.12" fill="${c.t.accentText}">TODAY</text></g>`
  }

  // the cursor: a hairline that follows the pointer across the time area and names the date under it, see bind().
  // A chart that spans less than two days reads to the minute
  var cursorMarkup = (c) => {
    var cursorFormat = c.span < 2 * DAY ? '%a %d %b %Y %H:%M' : '%a %d %b %Y'
    return `<g class="gantt-cursor" display="none" pointer-events="none" data-x0="${c.x0}" data-x1="${c.right}" data-from="${c.from}" data-to="${c.to}" ` +
      `data-top="${c.axisY}" data-bottom="${c.chartBottom}" data-format="${cursorFormat}">` +
      `<path d="M0,${c.axisY}V${c.chartBottom}" stroke="${c.t.ink}" stroke-opacity="0.55"/>` +
      `<rect x="0" y="${c.axisY - 24}" width="0" height="18" rx="2" fill="${c.t.ink}"/>` +
      `<text x="0" y="${c.axisY - 15}" text-anchor="middle" dominant-baseline="central" font-family="${c.mono}" font-size="9" letter-spacing="0.5" fill="${c.t.paper}"></text></g>`
  }

  // the text an assistive reader gets, and the model the page's script reads back
  var describe = (c) => {
    var info = {nodes: {}}
    c.rows.forEach((task) => {
      info.nodes[task.id] = {name: task.name, section: task.section, start: iso(task.from), end: iso(task.until), tags: task.tags, after: task.after || []}
    })
    var critical = c.rows.filter((task) => has(task, 'crit')).map((task) => task.name)
    var summary = `${c.model.title || 'Gantt chart'}: ${c.rows.length} tasks from ${iso(c.from)} to ${iso(c.to)}` +
      (critical.length ? `, critical path ${critical.join(', ')}` : '')
    return {info, summary}
  }

  // everything the markup helpers share: the model, tokens, geometry and the vertical layout
  var chartContext = (model, t, fonts, id) => {
    var rows = model.tasks.filter((task) => !has(task, 'vert'))
    if (!rows.length) return null
    var geo = geometry(model, rows, fonts.sans)
    var format = model.axisFormat || '%Y-%m-%d'
    var interval = axisInterval(model, format, geo, fonts.mono)
    var marks = interval && ticks(interval, geo.from, geo.to, 60)
    if (!marks) return null
    var verts = model.tasks.filter((task) => has(task, 'vert'))
    var axisY = MARGIN + (model.title ? 40 : 0) + AXIS
    var layout = layoutZones(model, axisY + 12)
    // task dates are wall-clock times kept as UTC, as mermaid reads them in local time, so now is the local clock too
    var now = Date.now() - new Date().getTimezoneOffset() * 60000
    var today = model.today && now >= geo.from && now <= geo.to
    var footer = verts.length || today ? 24 : 0
    return Object.assign({model, t, id, rows, verts, marks, format, axisY, now, today, sans: fonts.sans, mono: fonts.mono,
      height: layout.chartBottom + footer + MARGIN}, geo, layout)
  }

  // gantt source -> svg markup, or '' when mermaid should draw it. t: the style tokens of mermaid.js
  var render = (src, t, fonts, id) => {
    var model = parse(src)
    var c = model && chartContext(model, t, fonts, id)
    if (!c) return ''
    var body = []
    if (model.title) body.push(titleMarkup(c))
    body.push(...zoneMarkup(c))
    if (model.weekends) body.push(...weekendMarkup(c))
    body.push(...axisMarkup(c))
    var cards = c.rows.map((task) => cardMarkup(c, task))
    var lines = c.verts.map((task) => vertMarkup(c, task))
    if (c.today) lines.push(todayMarkup(c))
    lines.push(cursorMarkup(c))
    var {info, summary} = describe(c)
    var title = esc(model.title || 'Gantt chart')

    return [`<svg xmlns="http://www.w3.org/2000/svg" id="${id}" width="100%" style="max-width: ${c.width}px;" viewBox="0 0 ${c.width} ${num(c.height)}" ` +
      `role="graphics-document document" aria-roledescription="gantt" font-family="${esc(c.sans)}">`,
      `<title>${title}</title><desc>${esc(summary)}</desc>`,
      body.join(''), cards.join(''), lines.join(''),
      `<metadata class="gantt-model">${esc(JSON.stringify(info))}</metadata>`, '</svg>'].join('')
  }

  // the cursor follows the pointer over a drawn chart; the chart may be scaled or panned, so the pointer is mapped
  // through the svg's own screen matrix
  var bind = (svg) => {
    var cursor = svg.querySelector('g.gantt-cursor')
    if (!cursor || cursor.dataset.bound) return
    cursor.dataset.bound = '1'
    var d = cursor.dataset
    var x0 = +d.x0
    var x1 = +d.x1
    var from = +d.from
    var to = +d.to
    var line = cursor.querySelector('path')
    var chip = cursor.querySelector('rect')
    var label = cursor.querySelector('text')
    var hide = () => cursor.setAttribute('display', 'none')
    svg.addEventListener('pointermove', (e) => {
      var matrix = svg.getScreenCTM()
      if (!matrix) return
      var p = svg.createSVGPoint()
      p.x = e.clientX
      p.y = e.clientY
      p = p.matrixTransform(matrix.inverse())
      if (p.x < x0 || p.x > x1 || p.y < +d.top - 28 || p.y > +d.bottom) return hide()
      var at = Math.round(p.x * 2) / 2
      label.textContent = strftime(d.format, from + ((p.x - x0) / (x1 - x0)) * (to - from))
      cursor.removeAttribute('display')
      line.setAttribute('d', `M${at},${d.top}V${d.bottom}`)
      var w = Math.ceil(label.getComputedTextLength()) + 12
      // the chip stays inside the time area at both ends
      var cx = Math.min(Math.max(at, x0 + w / 2), x1 - w / 2)
      chip.setAttribute('x', cx - w / 2)
      chip.setAttribute('width', w)
      label.setAttribute('x', cx)
    })
    svg.addEventListener('pointerleave', hide)
  }

  return {parse, render, bind}
})()
