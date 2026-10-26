// Mermaid quadrant charts drawn to the diagram-design quadrant: a hairline cross through the centre, axis names as
// tracked mono eyebrows at the arrow tips, quadrant names as corner tags, items as small labelled dots. Only the
// "do first" cell (quadrant-1) is tinted and its item nearest the top-right corner takes the accent. Syntax that is
// not understood falls back to mermaid itself, see render()
var quadrant = (() => {
  var axis = (text) => {
    var parts = text.split('-->').map((p) => p.trim())
    // an axis with one name is named at its tip, where it grows towards
    return parts.length < 2 ? ['', parts[0]] : [parts[0], parts[1]]
  }

  // per-point style keys -> the model field they fill, and whether the value is a number
  var STYLE_FIELD = {radius: 'radius', 'stroke-width': 'strokeWidth', color: 'color', 'stroke-color': 'stroke'}
  var STYLE_NUMERIC = {radius: true, 'stroke-width': true}

  // one "key: value" style of a point, false when it is not one the map draws
  var applyStyle = (point, part) => {
    var kv = /^(radius|color|stroke-color|stroke-width)\s*:\s*(.+)$/i.exec(part.trim())
    if (!kv) return false
    var key = kv[1].toLowerCase()
    var value = kv[2].trim()
    if (!STYLE_NUMERIC[key]) {
      point[STYLE_FIELD[key]] = value
      return true
    }
    var n = parseFloat(value)
    if (isNaN(n)) return false
    point[STYLE_FIELD[key]] = n
    return true
  }

  var inUnit = (v) => !isNaN(v) && v >= 0 && v <= 1

  // "Label: [x, y] styles" -> point, or null when mermaid should keep it (classes, out of range, unknown styles)
  var readPoint = (found) => {
    if (found[1].includes(':::')) return null
    var x = parseFloat(found[2])
    var y = parseFloat(found[3])
    if (!inUnit(x) || !inUnit(y)) return null
    var point = {label: found[1].trim(), x, y}
    var styles = found[4].trim()
    if (styles && !styles.split(',').every((part) => applyStyle(point, part))) return null
    return point
  }

  // each handler gets the model and the regex match, and answers false when mermaid should draw the chart instead
  var DIRECTIVES = [
    [/^title\s+(.*)$/i, (model, found) => { model.title = found[1].trim(); return true }],
    [/^x-axis\s+(.*)$/i, (model, found) => { model.x = axis(found[1]); return true }],
    [/^y-axis\s+(.*)$/i, (model, found) => { model.y = axis(found[1]); return true }],
    [/^quadrant-([1-4])\s+(.*)$/i, (model, found) => { model.quadrants[found[1] - 1] = found[2].trim(); return true }],
    // classes and per-point classes are styling the map does not draw, mermaid keeps them
    [/^classDef\b/, () => false],
    [/^(.+?)\s*:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*(.*)$/, (model, found) => {
      var point = readPoint(found)
      if (point) model.points.push(point)
      return !!point
    }],
  ]

  var readDirective = (model, line) => {
    for (var [pattern, handler] of DIRECTIVES) {
      var found = pattern.exec(line)
      if (found) return handler(model, found)
    }
    return false
  }

  var parse = (src) => {
    var lines = draw.lines(src)
    if (!lines) return null
    var model = {title: '', x: ['', ''], y: ['', ''], quadrants: ['', '', '', ''], points: []}
    var head = false
    var skip = false
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/%%.*$/, '').trim()
      if (!line) continue
      if (!head) {
        if (!/^quadrantChart$/i.test(line)) return null
        head = true
      }
      else if (skip) skip = !line.includes('}')
      else if (/^acc(Title|Descr)\b/.test(line)) skip = /\{\s*$/.test(line)
      else if (!readDirective(model, line)) return null
    }
    return head ? model : null
  }

  var {esc, num, measure} = draw
  // a colour from the source goes into an attribute, keep it to something that is a colour
  var colour = (v) => (/^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([\d\s.,%]+\))$/i.test(v || '') ? v : '')

  var MARGIN = 32
  var W = 560
  var H = 400
  var PAD = 20

  var eyebrow = (s) => s.toUpperCase()
  var tracked = (s, size, mono) => measure(s, size, mono, 400) + s.length * size * 0.18
  var cell = (p) => (p.y > 0.5 ? (p.x > 0.5 ? 1 : 2) : (p.x > 0.5 ? 4 : 3))

  // label spots tried in order: right of the dot first, then left, each level, then above and below
  var SPOTS = []
  ;[1, -1].forEach((dir) => [0, -14, 14].forEach((dy) => SPOTS.push({dir, dy})))

  var CHEVRONS = {
    r: (x, y) => `M${x - 6},${y - 4}L${x},${y}L${x - 6},${y + 4}`,
    l: (x, y) => `M${x + 6},${y - 4}L${x},${y}L${x + 6},${y + 4}`,
    u: (x, y) => `M${x - 4},${y + 6}L${x},${y}L${x + 4},${y + 6}`,
    d: (x, y) => `M${x - 4},${y - 6}L${x},${y}L${x + 4},${y - 6}`,
  }

  // the plot box and the maps from 0..1 data to svg space; the top tip label sits above the plot
  var plotBox = (model, top) => {
    var x0 = MARGIN
    var y0 = top + (model.y[1] ? 20 : 0)
    var plot = {x0, y0, x1: x0 + W, y1: y0 + H, cx: x0 + W / 2, cy: y0 + H / 2}
    plot.px = (v) => x0 + PAD + v * (W - PAD * 2)
    plot.py = (v) => plot.y1 - PAD - v * (H - PAD * 2)
    return plot
  }

  // the cross, with an open chevron at each end that carries a label
  var axisMarks = (model, plot, t, mono) => {
    var {x0, y0, x1, y1, cx, cy} = plot
    var stroke = `rgba(${t.inkRgb},0.45)`
    var out = [`<path d="M${x0},${cy}H${x1}M${cx},${y0}V${y1}" stroke="${stroke}" fill="none"/>`]
    var ends = [
      {text: model.x[1], chevron: true, at: [x1, cy], dir: 'r', label: [x1, cy + 16, 'end']},
      {text: model.x[0], chevron: !!model.x[1], at: [x0, cy], dir: 'l', label: [x0, cy + 16, 'start']},
      {text: model.y[1], chevron: true, at: [cx, y0], dir: 'u', label: [cx, y0 - 8, 'middle']},
      {text: model.y[0], chevron: !!model.y[1], at: [cx, y1], dir: 'd', label: [cx, y1 + 16, 'middle']},
    ]
    ends.filter((end) => end.text).forEach((end) => {
      if (end.chevron) out.push(`<path d="${CHEVRONS[end.dir](...end.at)}" stroke="${stroke}" fill="none"/>`)
      var [x, y, anchor] = end.label
      out.push(`<text x="${num(x)}" y="${num(y)}" text-anchor="${anchor}" font-family="${mono}" font-size="8" letter-spacing="1.44" fill="${t.muted}">${esc(eyebrow(end.text))}</text>`)
    })
    return out
  }

  // corner tags in the outer corner of each cell, quadrant-1 in the accent
  var cornerTags = (model, plot, t, mono) => {
    var {x0, y0, x1, y1} = plot
    var corners = [[x1 - 16, y0 + 24, 'end'], [x0 + 16, y0 + 24, 'start'], [x0 + 16, y1 - 16, 'start'], [x1 - 16, y1 - 16, 'end']]
    var out = []
    model.quadrants.forEach((name, q) => {
      if (!name) return
      var [x, yy, anchor] = corners[q]
      out.push(`<text x="${x}" y="${yy}" text-anchor="${anchor}" font-family="${mono}" font-size="9" letter-spacing="1.62" ` +
        `fill="${q === 0 ? t.accentText : t.muted}"${q === 0 ? ' font-weight="600"' : ''}>${esc(eyebrow(name))}</text>`)
    })
    return out
  }

  // one accent: the item in quadrant-1 nearest its outer corner, unless the source coloured it
  var findFocal = (points) => {
    var focal = -1
    var best = Infinity
    points.forEach((p, i) => {
      if (p.x <= 0.5 || p.y <= 0.5 || p.color) return
      var d = (1 - p.x) ** 2 + (1 - p.y) ** 2
      if (d < best) {
        best = d
        focal = i
      }
    })
    return focal
  }

  // the boxes the corner tags take up, labels step off them
  var tagBoxes = (model, plot, mono) => {
    var {x0, y0, x1, y1} = plot
    var width = (q) => tracked(eyebrow(model.quadrants[q] || ''), 9, mono)
    return [[x0 + 8, y0 + 8, x0 + 16 + width(1), y0 + 30],
      [x1 - 16 - width(0), y0 + 8, x1 - 8, y0 + 30],
      [x0 + 8, y1 - 30, x0 + 16 + width(2), y1 - 8],
      [x1 - 16 - width(3), y1 - 30, x1 - 8, y1 - 8]]
  }

  // the box a label takes at a spot, or null when it would cross the vertical axis, the edge or the horizontal axis
  var fits = (spot, at, plot) => {
    var left = spot.dir > 0 ? at.x + at.gap : at.x - at.gap - at.w
    var right = left + at.w
    var top = at.y + spot.dy - 8
    var bottom = at.y + spot.dy + 4
    var blocked = left < plot.x0 || right > plot.x1 || (left < plot.cx && right > plot.cx) || (top < plot.cy && bottom > plot.cy)
    return blocked ? null : [left, top, right, bottom]
  }

  var overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]

  // labels sit to the right of their dot, or to the left when that would cross the vertical axis or the edge,
  // and step off any label already placed or off the horizontal axis
  var placeLabel = (at, plot, taken) => {
    var open = SPOTS.map((spot) => ({o: spot, box: fits(spot, at, plot)})).filter((pick) => pick.box)
    var clear = open.find((pick) => !taken.some((b) => overlaps(pick.box, b)))
    return clear || open[0] || {o: {dir: 1, dy: 0}, box: [at.x + at.gap, at.y - 8, at.x + at.gap + at.w, at.y + 4]}
  }

  var strokeAttrs = (p, fill) => {
    var ring = colour(p.stroke)
    if (ring) return ` stroke="${ring}" stroke-width="${num(p.strokeWidth || 1)}"`
    return p.strokeWidth ? ` stroke="${fill}" stroke-width="${num(p.strokeWidth)}"` : ''
  }

  var pointMark = (p, i, env) => {
    var {plot, t, sans, id} = env
    var hot = i === env.focal
    var x = plot.px(p.x)
    var yy = plot.py(p.y)
    var r = p.radius || (hot ? 6 : 4)
    var gap = r + 6
    var pick = placeLabel({x, y: yy, gap, w: measure(p.label, 11, sans, hot ? 600 : 400)}, plot, env.taken)
    env.taken.push(pick.box)
    var fill = colour(p.color) || (hot ? t.accent : t.ink)
    var start = pick.o.dir > 0
    return [`<g class="node quadrant-point" id="${id}-quadrant-p${i}-0">`,
      `<circle cx="${num(x)}" cy="${num(yy)}" r="${num(r)}" fill="${fill}"${strokeAttrs(p, fill)}/>`,
      `<text x="${num(start ? x + gap : x - gap)}" y="${num(yy + pick.o.dy + 4)}" text-anchor="${start ? 'start' : 'end'}" font-family="${sans}" font-size="11"` +
        `${hot ? ' font-weight="600"' : ''} fill="${hot ? t.ink : t.muted}">${esc(p.label)}</text>`,
      '</g>'].join('')
  }

  // the model the popup reads
  var popupModel = (model, focal) => {
    var info = {nodes: {}}
    model.points.forEach((p, i) => {
      info.nodes['p' + i] = {name: p.label, x: p.x, y: p.y, quadrant: cell(p), cell: model.quadrants[cell(p) - 1], focal: i === focal}
    })
    return info
  }

  var describe = (model, focal) => `${model.title || 'Quadrant chart'}: ${model.points.length} items` +
    (model.x[0] || model.x[1] ? `, x from ${model.x[0]} to ${model.x[1]}` : '') +
    (model.y[0] || model.y[1] ? `, y from ${model.y[0]} to ${model.y[1]}` : '') +
    (focal >= 0 ? `, focal ${model.points[focal].label}` : '')

  // quadrant source -> svg markup, or '' when mermaid should draw it. t: the style tokens of mermaid.js
  var render = (src, t, fonts, id) => {
    var model = parse(src)
    if (!model) return ''
    var {sans, mono} = fonts
    var body = []
    var y = MARGIN
    if (model.title) {
      body.push(`<text x="${MARGIN}" y="${y + 14}" font-family="${sans}" font-size="16" font-weight="600" fill="${t.ink}">${esc(model.title)}</text>`)
      y += 40
    }
    var plot = plotBox(model, y)

    // the "do first" cell is the only tinted one
    body.push(`<rect x="${plot.cx}" y="${plot.y0}" width="${W / 2}" height="${H / 2}" fill="${t.accent}" fill-opacity="${t.dark ? 0.06 : 0.04}"/>`)
    body.push(...axisMarks(model, plot, t, mono), ...cornerTags(model, plot, t, mono))

    var focal = findFocal(model.points)
    var env = {plot, t, sans, id, focal, taken: tagBoxes(model, plot, mono)}
    var marks = model.points.map((p, i) => pointMark(p, i, env))

    var width = plot.x1 + MARGIN
    var height = plot.y1 + (model.y[0] ? 24 : 0) + MARGIN
    return [`<svg xmlns="http://www.w3.org/2000/svg" id="${id}" width="100%" style="max-width: ${num(width)}px;" viewBox="0 0 ${num(width)} ${num(height)}" ` +
      `role="graphics-document document" aria-roledescription="quadrantChart" font-family="${esc(sans)}">`,
      `<title>${esc(model.title || 'Quadrant chart')}</title><desc>${esc(describe(model, focal))}</desc>`,
      body.join(''), marks.join(''),
      `<metadata class="quadrant-model">${esc(JSON.stringify(popupModel(model, focal)))}</metadata>`, '</svg>'].join('')
  }

  return {parse, render}
})()
