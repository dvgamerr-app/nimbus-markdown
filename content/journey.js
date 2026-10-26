// Mermaid user journeys drawn to the diagram-design journey map: stage columns under one sentiment curve that
// runs through five ordinal levels, the lowest stage and its incoming segment take the accent. Syntax that is not
// understood falls back to mermaid itself, see render()
var journey = (() => {
  // mermaid scores a stage 1 to 5, the map names the five levels
  var LEVELS = ['LOW', 'MED-LOW', 'NEUTRAL', 'MED-HIGH', 'HIGH']

  var parse = (src) => {
    var lines = draw.lines(src)
    if (!lines) return null
    var model = {title: '', sections: []}
    var head = false
    var section = null
    var skip = false
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/%%.*$/, '').trim()
      if (!line) continue
      if (!head) {
        if (!/^journey$/i.test(line)) return null
        head = true
        continue
      }
      if (skip) {
        skip = !line.includes('}')
        continue
      }
      var found
      if (/^acc(Title|Descr)\b/.test(line)) {
        skip = /\{\s*$/.test(line)
      }
      else if ((found = /^title\s+(.*)$/i.exec(line))) model.title = found[1].trim()
      else if ((found = /^section\s*(.*)$/i.exec(line))) {
        section = {name: found[1].trim(), stages: []}
        model.sections.push(section)
      }
      else {
        var parts = line.split(':')
        var score = parseInt(parts[1], 10)
        if (parts.length < 2 || isNaN(score)) return null
        if (!section) {
          section = {name: '', stages: []}
          model.sections.push(section)
        }
        section.stages.push({
          name: parts[0].trim(), score: Math.max(1, Math.min(5, score)),
          actors: parts.slice(2).join(':').split(',').map((a) => a.trim()).filter(Boolean)
        })
      }
    }
    return head && model.sections.some((s) => s.stages.length) ? model : null
  }

  var {esc, num, wrap} = draw

  var MARGIN = 24
  var LEFT = 64
  var COL = 200
  var GUTTER = 24
  var BAND = 160

  // journey source -> svg markup, or '' when mermaid should draw it. t: the style tokens of mermaid.js
  var render = (src, t, fonts, id) => {
    var model = parse(src)
    if (!model) return ''
    var sans = fonts.sans
    var mono = fonts.mono
    var stages = []
    model.sections.forEach((section) => section.stages.forEach((s) => stages.push(Object.assign(s, {section: section.name}))))
    var n = stages.length
    var x0 = MARGIN + LEFT
    var colX = (i) => x0 + i * (COL + GUTTER)
    var right = colX(n - 1) + COL
    var width = right + MARGIN
    var lowest = Math.min(...stages.map((s) => s.score))
    // a map where every stage feels the same has no trough to point at
    var trough = lowest < Math.max(...stages.map((s) => s.score)) ? stages.findIndex((s) => s.score === lowest) : -1
    var accent = t.accent
    // the light accent is a bright orange for marks, text on paper needs the darker one
    var accentText = t.accentText
    var level = (score) => LEVELS[score - 1]
    var out = []
    var y = MARGIN

    // the figure is drawn top down: title, sections, stage headers, sentiment band, content rows
    var body = []
    if (model.title) {
      body.push(`<text x="${MARGIN}" y="${y + 14}" font-family="${sans}" font-size="16" font-weight="600" fill="${t.ink}">${esc(model.title)}</text>`)
      y += 40
    }
    var named = model.sections.some((s) => s.name)
    if (named) {
      var at = 0
      model.sections.forEach((section) => {
        if (!section.stages.length) return
        var from = colX(at)
        var to = colX(at + section.stages.length - 1) + COL
        body.push(`<text x="${from}" y="${y + 8}" font-family="${mono}" font-size="8" letter-spacing="1.44" fill="${t.muted}">${esc(section.name.toUpperCase())}</text>` +
          `<path d="M${from},${y + 18}H${to}" stroke="${t.ruleSolid}"/>`)
        at += section.stages.length
      })
      y += 34
    }
    var headTop = y
    var titles = stages.map((s) => wrap(s.name, COL - 24, 12, sans, 600, 3))
    var headH = 24 + Math.max(...titles.map((l) => l.length)) * 15 + 8
    y += headH

    // the sentiment band: three labelled hairlines, five ordinal levels between them
    var bandY = y + 18
    var levelY = (score) => bandY + (5 - score) * (BAND / 4)
    ;[['HIGH', 5], ['NEUTRAL', 3], ['LOW', 1]].forEach(([name, score]) => {
      body.push(`<path d="M${x0 - 4},${levelY(score)}H${right}" stroke="${t.rule}"/>` +
        `<text x="${x0 - 12}" y="${levelY(score)}" text-anchor="end" dominant-baseline="central" font-family="${mono}" font-size="8" letter-spacing="1.44" fill="${t.muted}">${name}</text>`)
    })
    y = bandY + BAND + 24

    // content rows
    var rows = []
    if (stages.some((s) => s.actors.length)) rows.push('actors')
    rows.push('level')
    var actorLines = stages.map((s) => wrap(s.actors.join(' · '), COL - 24, 9, mono, 400, 3))
    var rowTop = {}
    var rowH = {}
    rows.forEach((row) => {
      rowTop[row] = y
      rowH[row] = row === 'actors'
        ? 16 + Math.max(...actorLines.map((l, i) => (stages[i].actors.length ? l.length : 0)), 1) * 13
        : 16 + 13 + (trough >= 0 ? 26 : 0)
      y += rowH[row]
    })
    var bottom = y
    rows.forEach((row) => {
      body.push(`<path d="M${MARGIN},${rowTop[row]}H${right}" stroke="${t.rule}"/>` +
        `<text x="${MARGIN}" y="${rowTop[row] + 16}" dominant-baseline="central" font-family="${mono}" font-size="8" letter-spacing="1.44" fill="${t.muted}">${row === 'actors' ? 'ACTORS' : 'LEVEL'}</text>`)
    })
    body.push(`<path d="M${MARGIN},${bottom}H${right}" stroke="${t.rule}"/>`)

    // the curve: one segment between neighbours, flat where it meets a dot so the line stays smooth
    var dot = (i) => ({x: colX(i) + COL / 2, y: levelY(stages[i].score)})
    var segments = []
    for (var i = 1; i < n; i++) {
      var a = dot(i - 1)
      var b = dot(i)
      var mid = (a.x + b.x) / 2
      var hot = i === trough
      segments.push(`<path class="journey-line relationshipLine" id="${id}-S-${i}" data-from="s${i - 1}" data-to="s${i}" ` +
        `d="M${a.x},${a.y}C${mid},${a.y} ${mid},${b.y} ${b.x},${b.y}" fill="none" stroke="${hot ? accent : t.muted}" stroke-width="${hot ? 2 : 1.5}" stroke-linecap="round"/>`)
    }
    // the accent segment goes last, on top
    if (trough > 0) segments.push(segments.splice(trough - 1, 1)[0])

    var cards = stages.map((s, i) => {
      var cx = colX(i) + COL / 2
      var d = dot(i)
      var low = i === trough
      var g = [`<g class="node journey-stage" id="${id}-journey-s${i}-0">`,
        `<rect class="journey-hit" x="${colX(i)}" y="${headTop - 6}" width="${COL}" height="${num(bottom - headTop + 12)}" rx="8" fill="rgba(0,0,0,0)"/>`,
        '<g class="journey-body">',
        `<text x="${cx}" y="${headTop + 8}" text-anchor="middle" font-family="${mono}" font-size="8" letter-spacing="1.44" fill="${t.muted}">STAGE ${i + 1}</text>`]
      titles[i].forEach((line, k) => g.push(
        `<text x="${cx}" y="${headTop + 24 + k * 15}" text-anchor="middle" font-family="${sans}" font-size="12" font-weight="600" fill="${t.ink}">${esc(line)}</text>`))
      g.push(`<circle cx="${d.x}" cy="${d.y}" r="${low ? 6 : 5}" fill="${low ? accent : t.muted}" stroke="${t.paper}" stroke-width="2"/>`)
      if (rows.includes('actors')) {
        actorLines[i].forEach((line, k) => s.actors.length && g.push(
          `<text x="${cx}" y="${rowTop.actors + 22 + k * 13}" text-anchor="middle" font-family="${mono}" font-size="9" fill="${t.muted}">${esc(line)}</text>`))
      }
      g.push(`<text x="${cx}" y="${rowTop.level + 22}" text-anchor="middle" font-family="${mono}" font-size="9"  fill="${low ? accentText : t.muted}"${low ? ' font-weight="600"' : ''}>${level(s.score)} · ${s.score}/5</text>`)
      if (low) {
        var tagW = 112
        g.push(`<rect x="${cx - tagW / 2}" y="${rowTop.level + 34}" width="${tagW}" height="18" rx="2" fill="${t.accentTint}" stroke="${accent}" stroke-opacity="0.5" stroke-dasharray="3 3"/>`,
          `<text x="${cx}" y="${rowTop.level + 43}" text-anchor="middle" dominant-baseline="central" font-family="${mono}" font-size="8" letter-spacing="0.5" fill="${accentText}">LOWEST POINT</text>`)
      }
      g.push('</g></g>')
      return g.join('')
    })

    var info = {nodes: {}}
    stages.forEach((s, i) => {
      info.nodes['s' + i] = {
        name: s.name, section: s.section, n: i + 1, score: s.score, level: level(s.score), actors: s.actors,
        prev: i ? 's' + (i - 1) : '', next: i < n - 1 ? 's' + (i + 1) : '', low: i === trough
      }
    })
    var summary = `${model.title || 'User journey'}: ${n} stages, sentiment ${level(stages[0].score)} at the start and ${level(stages[n - 1].score)} at the end` +
      (trough >= 0 ? `, lowest at ${stages[trough].name}` : '')

    out.push(`<svg xmlns="http://www.w3.org/2000/svg" id="${id}" width="100%" style="max-width: ${width}px;" viewBox="0 0 ${width} ${num(bottom + MARGIN)}" ` +
      `role="graphics-document document" aria-roledescription="journey" font-family="${esc(sans)}">`,
      `<title>${esc(model.title || 'User journey')}</title><desc>${esc(summary)}</desc>`,
      body.join(''), segments.join(''), cards.join(''),
      `<metadata class="journey-model">${esc(JSON.stringify(info))}</metadata>`, '</svg>')
    return out.join('')
  }

  return {parse, render}
})()
