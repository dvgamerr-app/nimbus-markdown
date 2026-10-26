// Mermaid pies drawn as an editorial donut: one ring cut by paper gaps, the largest slice takes the accent and the
// rest the muted series palette, every slice named directly on a hairline leader instead of a legend, the focal
// share (or the total with showData) in the centre. Syntax that is not understood falls back to mermaid itself, see render()
var pie = (() => {
  // each body handler answers undefined when the line is not its kind, true when it took it, false when the pie is not
  // one this renderer understands
  var BODY = [
    (model, state, line) => {
      if (!/^acc(Title|Descr)\b/.test(line)) return undefined
      state.skip = /\{\s*$/.test(line)
      return true
    },
    (model, state, line) => {
      if (!/^showData$/i.test(line)) return undefined
      model.showData = true
      return true
    },
    (model, state, line) => {
      var found = /^title\s+(.*)$/i.exec(line)
      if (!found) return undefined
      model.title = found[1].trim()
      return true
    },
    (model, state, line) => {
      var found = /^"([^"]*)"\s*:\s*(-?[\d.]+(?:e[+-]?\d+)?)$/i.exec(line)
      if (!found) return undefined
      var value = parseFloat(found[2])
      if (isNaN(value) || value < 0) return false
      model.slices.push({label: found[1], value})
      return true
    }
  ]

  var readBody = (model, state, line) => {
    for (var i = 0; i < BODY.length; i++) {
      var taken = BODY[i](model, state, line)
      if (taken !== undefined) return taken
    }
    return false
  }

  var readHead = (model, line) => {
    var found = /^pie\b\s*(showData)?\s*(?:title\s+(.*))?$/i.exec(line)
    if (!found) return false
    model.showData = !!found[1]
    model.title = (found[2] || '').trim()
    return true
  }

  var parse = (src) => {
    var lines = draw.lines(src)
    if (!lines) return null
    var model = {title: '', showData: false, slices: []}
    var state = {head: false, skip: false}
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/%%.*$/, '').trim()
      if (!line) continue
      if (!state.head) {
        if (!readHead(model, line)) return null
        state.head = true
      }
      else if (state.skip) state.skip = !line.includes('}')
      else if (!readBody(model, state, line)) return null
    }
    var total = model.slices.reduce((sum, s) => sum + s.value, 0)
    return state.head && total > 0 ? model : null
  }

  var {esc, num, measure} = draw
  // 65 -> 65, 7.5 -> 7.5, 0.04 -> 0.04: no trailing zeros
  var fmt = (v) => String(Math.abs(v) >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100)
  // shares carry one decimal at most
  var pct = (v) => String(Math.round(v * 10) / 10)

  var MARGIN = 32
  var R = 120
  var RING = 44
  var LEAD = 40
  var ROW = 32

  // the palette never repeats the accent, dark mode has it as a series colour
  var paletteOf = (t) => [t.series[1], t.series[0], t.series[2], t.series[3], t.series[4], t.muted, t.soft]
    .filter((c) => c.toLowerCase() !== t.accent.toLowerCase())

  // share, colour, name, note and label width of every slice
  var describe = (slices, focal, total, model, style) => {
    var {t, fonts} = style
    var palette = paletteOf(t)
    var k = 0
    slices.forEach((s, i) => {
      s.share = s.value / total * 100
      s.color = i === focal ? t.accent : palette[k++ % palette.length]
      // the ring closes on itself: the last slice must not wear the colour of the first
      if (i === slices.length - 1 && i > 1 && s.color === slices[0].color) s.color = palette[k % palette.length]
      s.name = s.label
      s.note = model.showData ? `${fmt(s.value)} · ${pct(s.share)}%` : `${pct(s.share)}%`
      s.w = Math.max(measure(s.name, 12, fonts.sans, 600), measure(s.note, 9, fonts.mono, 400) + s.note.length * 0.54)
    })
  }

  // clockwise from twelve o'clock
  var angles = (slices) => {
    var at = 0
    slices.forEach((s) => {
      s.a0 = at
      at += s.share / 100 * Math.PI * 2
      s.a1 = at
      s.mid = (s.a0 + s.a1) / 2
    })
  }

  var side = (s) => (Math.sin(s.mid) >= 0 ? 1 : -1)

  // labels of one half kept in angle order, pushed one row apart and then moved as a block so on average every label
  // sits level with its slice
  var spread = (group) => {
    group.forEach((s) => (s.ly = s.natural = -Math.cos(s.mid) * (R + 12)))
    for (var i = 1; i < group.length; i++) group[i].ly = Math.max(group[i].ly, group[i - 1].ly + ROW)
    var shift = group.reduce((sum, s) => sum + s.ly - s.natural, 0) / (group.length || 1)
    group.forEach((s) => (s.ly -= shift))
  }

  // right half and left half, each top to bottom; answers the widest label of each
  var spreadLabels = (slices) => {
    var right = slices.filter((s) => side(s) > 0)
    var left = slices.filter((s) => side(s) < 0).reverse()
    spread(right)
    spread(left)
    return {leftW: Math.max(0, ...left.map((s) => s.w)), rightW: Math.max(0, ...right.map((s) => s.w))}
  }

  var point = (g, a, r) => [g.cx + Math.sin(a) * r, g.cy - Math.cos(a) * r]

  var arc = (g, s) => {
    var {cx, cy} = g
    var r0 = R - RING
    if (s.a1 - s.a0 >= Math.PI * 2 - 1e-6) {
      return `M${cx},${cy - R}A${R},${R} 0 1 1 ${cx - 0.01},${cy - R}Z` +
        `M${cx},${cy - r0}A${r0},${r0} 0 1 0 ${cx + 0.01},${cy - r0}Z`
    }
    var large = s.a1 - s.a0 > Math.PI ? 1 : 0
    var [x0, y0] = point(g, s.a0, R)
    var [x1, y1] = point(g, s.a1, R)
    var [x2, y2] = point(g, s.a1, r0)
    var [x3, y3] = point(g, s.a0, r0)
    return `M${num(x0)},${num(y0)}A${R},${R} 0 ${large} 1 ${num(x1)},${num(y1)}` +
      `L${num(x2)},${num(y2)}A${r0},${r0} 0 ${large} 0 ${num(x3)},${num(y3)}Z`
  }

  // g: the drawing context {cx, cy, reach, focal, t, id, fonts}
  var mark = (g, s, i) => {
    var {t, fonts} = g
    var hot = i === g.focal
    var dir = side(s)
    // out of the ring along the slice, then to the label row, then level into the label
    var [ex, ey] = point(g, s.mid, R + 4)
    var [rx, ry] = point(g, s.mid, R + 12)
    var ly = g.cy + s.ly
    var kx = g.cx + dir * (R + 24)
    var tx = g.cx + dir * g.reach
    var anchor = dir > 0 ? 'start' : 'end'
    var lx = tx + dir * 8
    return [`<g class="node pie-slice" id="${g.id}-pie-s${i}-0">`,
      `<path d="${arc(g, s)}" fill="${s.color}" fill-opacity="${hot ? 1 : 0.85}" stroke="${t.paper}" stroke-width="2" stroke-linejoin="round"/>`,
      `<path d="M${num(ex)},${num(ey)}L${num(rx)},${num(ry)}L${num(kx)},${num(ly)}H${num(tx)}" fill="none" stroke="${hot ? t.accent : t.ruleSolid}"/>`,
      `<circle cx="${num(tx)}" cy="${num(ly)}" r="2" fill="${hot ? t.accent : t.muted}"/>`,
      `<text x="${num(lx)}" y="${num(ly - 3)}" text-anchor="${anchor}" font-family="${fonts.sans}" font-size="12" font-weight="600" fill="${hot ? t.accentText : t.ink}">${esc(s.name)}</text>`,
      `<text x="${num(lx)}" y="${num(ly + 10)}" text-anchor="${anchor}" font-family="${fonts.mono}" font-size="9" letter-spacing="0.54" fill="${hot ? t.accentText : t.muted}">${esc(s.note)}</text>`,
      '</g>'].join('')
  }

  // the centre carries the focal share, or the total when the source asks for the data
  var centre = (g, model, focalSlice, total) => {
    var {t, fonts} = g
    var big = model.showData ? fmt(total) : `${pct(focalSlice.share)}%`
    var small = model.showData ? 'TOTAL' : focalSlice.name.toUpperCase()
    var smallSize = 8
    var maxSmall = (R - RING) * 2 - 24
    while (small.length > 4 && measure(small, smallSize, fonts.mono, 400) + small.length * 1.44 > maxSmall) small = small.slice(0, -2) + '…'
    return [`<text x="${g.cx}" y="${g.cy + 4}" text-anchor="middle" font-family="${fonts.sans}" font-size="24" font-weight="600" fill="${model.showData ? t.ink : t.accentText}">${esc(big)}</text>`,
      `<text x="${g.cx}" y="${g.cy + 20}" text-anchor="middle" font-family="${fonts.mono}" font-size="${smallSize}" letter-spacing="1.44" fill="${t.muted}">${esc(small)}</text>`]
  }

  // pie source -> svg markup, or '' when mermaid should draw it. t: the style tokens of mermaid.js
  var render = (src, t, fonts, id) => {
    var model = parse(src)
    if (!model) return ''
    var sans = fonts.sans
    var slices = model.slices.filter((s) => s.value > 0)
    var total = slices.reduce((sum, s) => sum + s.value, 0)
    // one accent: the largest slice, the first one when several tie
    var focal = slices.reduce((best, s, i) => (s.value > slices[best].value ? i : best), 0)
    describe(slices, focal, total, model, {t, fonts})
    angles(slices)
    var {leftW, rightW} = spreadLabels(slices)

    var reach = R + LEAD
    var body = []
    var y = MARGIN
    if (model.title) {
      body.push(`<text x="${MARGIN}" y="${y + 14}" font-family="${sans}" font-size="16" font-weight="600" fill="${t.ink}">${esc(model.title)}</text>`)
      y += 40
    }
    var lys = slices.map((s) => s.ly)
    var top = Math.min(-R, ...lys.map((v) => v - 14))
    var bottomEdge = Math.max(R, ...lys.map((v) => v + 18))
    var cx = MARGIN + (leftW ? leftW + 8 : 0) + reach
    var cy = y + 8 - top
    var width = Math.max(cx + reach + (rightW ? rightW + 8 : 0) + MARGIN, 360)
    var height = cy + bottomEdge + MARGIN

    var g = {cx, cy, reach, focal, t, id, fonts}
    var marks = slices.map((s, i) => mark(g, s, i))
    body.push(...centre(g, model, slices[focal], total))

    var info = {nodes: {}}
    slices.forEach((s, i) => {
      info.nodes['s' + i] = {name: s.label, value: s.value, share: Math.round(s.share * 10) / 10, focal: i === focal}
    })
    var summary = `${model.title || 'Pie chart'}: ${slices.length} slices, largest ${slices[focal].label} at ${pct(slices[focal].share)}%`

    return [`<svg xmlns="http://www.w3.org/2000/svg" id="${id}" width="100%" style="max-width: ${num(width)}px;" viewBox="0 0 ${num(width)} ${num(height)}" ` +
      `role="graphics-document document" aria-roledescription="pie" font-family="${esc(sans)}">`,
      `<title>${esc(model.title || 'Pie chart')}</title><desc>${esc(summary)}</desc>`,
      body.join(''), marks.join(''),
      `<metadata class="pie-model">${esc(JSON.stringify(info))}</metadata>`, '</svg>'].join('')
  }

  return {parse, render}
})()
