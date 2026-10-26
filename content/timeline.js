// Mermaid timelines drawn to the diagram-design timeline: one hairline baseline, a dot per period, labels that
// alternate above and below on a hairline drop, the busiest period is the major milestone in the accent. Periods
// that are all numbers (years) sit by value so the spacing is honest, anything else is spaced evenly. Syntax that
// is not understood falls back to mermaid itself, see render()
var timeline = (() => {
  var openSection = (model, name) => {
    var section = {name, periods: []}
    model.sections.push(section)
    return section
  }

  // "2004 : a : b" starts a period, a line that starts with a colon carries more events of the period above it.
  // False when there is no period above to carry them
  var addPeriod = (section, line) => {
    var parts = line.split(':').map((p) => p.trim())
    var events = parts.slice(1).filter(Boolean)
    if (parts[0]) {
      section.periods.push({label: parts[0], events})
      return true
    }
    var last = section.periods[section.periods.length - 1]
    if (!last) return false
    last.events.push(...events)
    return true
  }

  // one line after the header. state: the open section and whether a multi-line accessibility block is being skipped.
  // False when the line makes the source something else than a timeline
  var readLine = (model, state, line) => {
    if (state.skip) {
      state.skip = !line.includes('}')
      return true
    }
    if (/^acc(Title|Descr)\b/.test(line)) {
      state.skip = /\{\s*$/.test(line)
      return true
    }
    var title = /^title\s+(.*)$/i.exec(line)
    if (title) {
      model.title = title[1].trim()
      return true
    }
    var named = /^section\s*(.*)$/i.exec(line)
    if (named) {
      state.section = openSection(model, named[1].trim())
      return true
    }
    if (!state.section) state.section = openSection(model, '')
    return addPeriod(state.section, line)
  }

  var parse = (src) => {
    var lines = draw.lines(src)
    if (!lines) return null
    var model = {title: '', sections: []}
    var state = {section: null, skip: false}
    var head = false
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/%%.*$/, '').trim()
      if (!line) continue
      if (!head) {
        if (!/^timeline(\s+(LR|TD))?$/i.test(line)) return null
        head = true
      }
      else if (!readLine(model, state, line)) return null
    }
    return head && model.sections.some((s) => s.periods.length) ? model : null
  }

  var {esc, num, grid, measure, wrap} = draw

  // the skill's type ramp: date eyebrow 8px mono tracked 0.14em, event names 12px sans 600 (14px on the milestone),
  // a 16px line pitch. Structure sits on the 4px grid
  var MARGIN = 32
  var LABEL = 144
  var PAD = 8
  var DROP = 56
  var MAJOR = 80
  var GAP = 24
  var STEP = 32
  var CAP = 20
  var EVENTS = 4
  var TRACK = 1.12

  // "a", "a and b", "a, b and c"
  var list = (items) => (items.length > 1 ? items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1] : items[0] || '')

  // the distance between periods a and b: years read as years, other numbers as plain steps
  var span = ({numeric, values}, a, b) => {
    if (!numeric) return ''
    var gap = Math.round((values[b] - values[a]) * 10) / 10
    var years = values.every((v) => Number.isInteger(v) && v >= 1000 && v <= 2999)
    return years ? gap + (gap === 1 ? ' year' : ' years') : gap + ' steps'
  }

  var named = (q) => q.label + (q.events.length ? ' (' + list(q.events) + ')' : '')

  // where an end of the timeline sits, in words
  var atEnd = (periods, i, ctx) => {
    if (!periods[i - 1]) return `It opens the timeline, ${ctx.numeric ? span(ctx, i, i + 1) + ' before' : 'ahead of'} ${named(periods[i + 1])}.`
    return `It closes the timeline, ${ctx.numeric ? span(ctx, i - 1, i) + ' after' : 'following'} ${named(periods[i - 1])}.`
  }

  // where period i sits among its neighbours
  var position = (periods, i, ctx) => {
    var before = periods[i - 1]
    var after = periods[i + 1]
    if (!before && !after) return 'It is the only period on the timeline.'
    if (!before || !after) return atEnd(periods, i, ctx)
    if (ctx.numeric) return `It comes ${span(ctx, i - 1, i)} after ${named(before)} and ${span(ctx, i, i + 1)} before ${named(after)}.`
    return `It follows ${named(before)} and leads to ${named(after)}.`
  }

  // how much of the timeline period i holds, '' when it holds all of it
  var share = (p, isMajor, total) => {
    if (isMajor) return `The busiest period: ${p.events.length} of the ${total} events on the timeline happen here.`
    if (p.events.length && total > p.events.length) return `It holds ${p.events.length} of the ${total} events on the timeline.`
    return ''
  }

  // what happened in period i, in words: what it brings, where it sits among its neighbours and how much of the
  // timeline it holds
  var story = (periods, i, ctx) => {
    var p = periods[i]
    return [
      p.events.length ? `${p.label} brings ${list(p.events)}.` : `${p.label} is marked with no events.`,
      p.section ? `It falls in ${p.section}.` : '',
      position(periods, i, ctx),
      share(p, i === ctx.major, ctx.total)
    ].filter(Boolean).join(' ')
  }

  // the major milestone: the period with the most events, when one period has more than every other
  var busiest = (periods) => {
    var most = Math.max(...periods.map((p) => p.events.length))
    var ties = periods.filter((p) => p.events.length === most).length
    return most > 1 && ties === 1 ? periods.findIndex((p) => p.events.length === most) : -1
  }

  // what a label holds and how much room it takes
  var measureLabel = (p, big, {sans, mono}) => {
    p.size = big ? 14 : 12
    p.date = wrap(p.label.toUpperCase(), LABEL, 8, mono, 400, 2, TRACK)
    var shown = p.events.length > EVENTS ? p.events.slice(0, EVENTS - 1) : p.events
    p.names = shown.map((e, k) => wrap(e, LABEL, k ? 12 : p.size, sans, 600, 2))
    p.more = p.events.length - shown.length
    var widths = p.date.map((l) => measure(l, 8, mono, 400, TRACK))
      .concat(p.names.flatMap((lines, k) => lines.map((l) => measure(l, k ? 12 : p.size, sans, 600))))
    p.w = grid(Math.max(...widths, 24) + PAD * 2)
    p.drop = big ? MAJOR : DROP
    // label lines below the drop: dates on a 12px pitch, names and the overflow on 16px
    p.rows = p.date.length * 12 + p.names.reduce((sum, l) => sum + l.length * 16, 0) + (p.more ? 16 : 0)
  }

  // numbers sit by value when every label is one and they only ever grow
  var isNumeric = (periods, values) => {
    var plain = periods.every((p) => /^-?\d+(\.\d+)?$/.test(p.label))
    return periods.length > 1 && plain && values.every((v, i) => !i || v > values[i - 1])
  }

  // the axis at its tightest: the whole axis stretches until no two labels on one side meet
  var tightScale = (periods, values, numeric) => {
    var n = periods.length
    var spans = values.slice(1).map((v, i) => v - values[i])
    var scale = n > 1 ? STEP / Math.min(...spans) : 0
    for (var i = 0; i + 2 < n; i++) {
      scale = Math.max(scale, (periods[i].w / 2 + periods[i + 2].w / 2 + GAP) / (values[i + 2] - values[i]))
    }
    // evenly spaced periods have nothing to measure, give them the width of a label
    return numeric ? scale : Math.max(scale, ...periods.map((p) => p.w / 2 + GAP / 2))
  }

  // an honest axis: numbers sit by value, anything else is spaced evenly
  var spacing = (periods) => {
    var values = periods.map((p) => parseFloat(p.label))
    var numeric = isNumeric(periods, values)
    if (!numeric) values = periods.map((p, i) => i)
    return {numeric, values, scale: tightScale(periods, values, numeric)}
  }

  // x of every period and the ends of the axis, with the left-most label at the margin
  var place = (periods, values, scale) => {
    var n = periods.length
    var xs = values.map((v) => (v - values[0]) * scale)
    var left = Math.min(xs[0] - CAP, ...periods.map((p, i) => xs[i] - p.w / 2))
    xs = xs.map((x) => x - left + MARGIN)
    var capR = xs[n - 1] + CAP
    return {xs, capL: xs[0] - CAP, capR, right: Math.max(capR, ...periods.map((p, i) => xs[i] + p.w / 2))}
  }

  // the axis fills the room it is given: only the distances grow, the type keeps its size. A label that stuck out
  // past an end stops doing so once the axis grows, so the stretch is measured again until it fits
  var stretch = (periods, values, scale, fit) => {
    var n = periods.length
    var pos = place(periods, values, scale)
    if (n < 2 || !fit) return pos
    for (var pass = 0; pass < 3 && pos.right + MARGIN < fit - 1; pass++) {
      var width = pos.xs[n - 1] - pos.xs[0]
      scale *= (width + fit - pos.right - MARGIN) / width
      pos = place(periods, values, scale)
    }
    return pos
  }

  var titleText = (title, y, sans, t) =>
    `<text x="${MARGIN}" y="${y + 14}" font-family="${sans}" font-size="16" font-weight="600" fill="${t.ink}">${esc(title)}</text>`

  // sections: a tracked eyebrow over a hairline that spans the periods it holds, a tick where one ends
  var bands = (model, c, bandY, base) => {
    var {xs, capL, capR, t, mono, n} = c
    var out = []
    var at = 0
    model.sections.forEach((section) => {
      var count = section.periods.length
      if (!count) return
      var from = at ? (xs[at - 1] + xs[at]) / 2 : capL
      var to = at + count < n ? (xs[at + count - 1] + xs[at + count]) / 2 : capR
      out.push(`<text x="${num(from + 4)}" y="${bandY + 8}" font-family="${mono}" font-size="8" letter-spacing="1.44" fill="${t.muted}">${esc(section.name.toUpperCase())}</text>`,
        `<path d="M${num(from + 4)},${bandY + 18}H${num(to - 4)}" stroke="${t.ruleSolid}"/>`)
      if (at + count < n) out.push(`<path d="M${num(to)},${base - 8}V${base + 8}" stroke="${c.faint(0.2)}"/>`)
      at += count
    })
    return out
  }

  // the baseline: a cap at both ends
  var caps = (c, base) => {
    var {xs, capL, capR, t, n} = c
    var line = `stroke="${t.muted}" stroke-opacity="0.45"`
    return [`<path d="M${num(capL)},${base - 8}V${base + 8}M${num(capR)},${base - 8}V${base + 8}" stroke="${c.faint(0.2)}"/>`,
      `<path d="M${num(capL)},${base}H${num(xs[0])}M${num(xs[n - 1])},${base}H${num(capR)}" ${line}/>`]
  }

  // the stretches between periods are the links the viewer plays along
  var links = (c, base) => {
    var {xs, capL, capR, t, n, id} = c
    var line = `stroke="${t.muted}" stroke-opacity="0.45"`
    var segments = []
    for (var k = 1; k < n; k++) {
      segments.push(`<path class="timeline-line relationshipLine" id="${id}-S-${k}" data-from="p${k - 1}" data-to="p${k}" ` +
        `d="M${num(xs[k - 1])},${base}H${num(xs[k])}" fill="none" ${line}/>`)
    }
    // playback only: an ink stroke drawn along the baseline up to the period in play, see motion()
    segments.push(`<path class="tl-progress" aria-hidden="true" d="M${num(capL)},${base}H${num(capR)}" pathLength="1" fill="none" stroke="${t.ink}" stroke-width="1.5"/>`)
    return segments
  }

  // the text of one label, top down: the date, the names, the overflow count
  var labelText = (p, x, top, big, c) => {
    var {sans, mono, t} = c
    var out = []
    var yy = top
    p.date.forEach((l) => {
      yy += 12
      out.push(`<text x="${x}" y="${num(yy - 4)}" text-anchor="middle" font-family="${mono}" font-size="8" letter-spacing="${TRACK}" fill="${big ? t.accentText : t.muted}">${esc(l)}</text>`)
    })
    p.names.forEach((lines, k) => lines.forEach((l) => {
      yy += 16
      out.push(`<text x="${x}" y="${num(yy - 4)}" text-anchor="middle" font-family="${sans}" font-size="${k ? 12 : p.size}" font-weight="600" fill="${t.ink}">${esc(l)}</text>`)
    }))
    if (p.more) {
      yy += 16
      out.push(`<text x="${x}" y="${num(yy - 5)}" text-anchor="middle" font-family="${mono}" font-size="8" letter-spacing="${TRACK}" fill="${t.soft}">+${p.more} MORE</text>`)
    }
    return out
  }

  var mark = (p, i, c, base) => {
    var {xs, t, id} = c
    var x = num(xs[i])
    var up = i % 2 === 0
    var big = i === c.major
    var edge = up ? base - p.drop : base + p.drop
    // the label reads top down either way: above it ends a line short of the drop, below it starts one past it
    var top = up ? edge - 8 - p.rows : edge + 8
    return [`<g class="node timeline-period" id="${id}-timeline-p${i}-0">`,
      `<rect class="timeline-hit" x="${num(xs[i] - p.w / 2)}" y="${num((up ? top : base) - PAD)}" width="${p.w}" height="${num(p.rows + p.drop + PAD * 2 + 8)}" rx="6" fill="rgba(0,0,0,0)"/>`,
      // the drop runs out from the dot, so drawing it in playback grows it from the baseline
      `<path class="tl-drop" d="M${x},${base}V${edge}" pathLength="1" stroke="${big ? t.accent : c.faint(0.3)}"/>`,
      `<circle class="tl-ring" aria-hidden="true" cx="${x}" cy="${base}" r="${big ? 11 : 9}" fill="none" stroke="${t.ink}"/>`,
      `<circle cx="${x}" cy="${base}" r="${big ? 6 : 4}" fill="${big ? t.accent : t.ink}"/>`,
      `<g class="tl-label ${up ? 'tl-up' : 'tl-down'}">`,
      ...labelText(p, x, top, big, c),
      '</g></g>'].join('')
  }

  // legend: a bottom strip naming the marks in use and how the axis is spaced, left out when it has nothing to say.
  // Returns its markup, the width it needs and the y below it
  var legend = (c, ly, right) => {
    var {t, sans, mono, major, numeric} = c
    if (major < 0 && !numeric) return {parts: [], right, y: ly}
    var parts = [`<text x="${MARGIN}" y="${ly + 16}" font-family="${mono}" font-size="8" letter-spacing="1.44" fill="${t.muted}">LEGEND</text>`]
    var lx = MARGIN + 12
    var item = (r, fill, text) => {
      parts.push(`<circle cx="${lx}" cy="${ly + 32}" r="${r}" fill="${fill}"/>`,
        `<text x="${lx + 16}" y="${ly + 32}" dominant-baseline="central" font-family="${sans}" font-size="9" fill="${t.muted}">${esc(text)}</text>`)
      lx = grid(lx + 16 + measure(text, 9, sans, 400) + 32)
    }
    item(4, t.ink, 'Period')
    if (major >= 0) item(6, t.accent, 'Busiest period')
    var note = 'Spacing is proportional to elapsed time.'
    if (numeric) parts.push(`<text x="${lx - 8}" y="${ly + 32}" dominant-baseline="central" font-family="${sans}" font-size="9" font-style="italic" fill="${t.muted}">${note}</text>`)
    // the strip may run wider than the axis, the figure widens with it
    var wide = Math.max(right, numeric ? lx - 8 + measure(note, 9, sans, 400) : lx - 32)
    parts.unshift(`<path d="M${MARGIN},${ly}H${num(wide)}" stroke="${c.faint(0.1)}" stroke-width="0.8"/>`)
    return {parts, right: wide, y: ly + 48}
  }

  // the model the viewer reads back: every period with its place, neighbours and story
  var describe = (periods, c) => {
    var {xs, numeric, values, major, n} = c
    var total = periods.reduce((sum, p) => sum + p.events.length, 0)
    var info = {axis: [num(c.capL), num(c.capR)], nodes: {}}
    periods.forEach((p, i) => {
      info.nodes['p' + i] = {
        name: p.label, section: p.section, n: i + 1, events: p.events, major: i === major, x: num(xs[i]),
        gap: numeric && i ? num(values[i] - values[i - 1]) : null,
        prev: i ? 'p' + (i - 1) : '', next: i < n - 1 ? 'p' + (i + 1) : '',
        story: story(periods, i, {numeric, values, major, total})
      }
    })
    return {info, total}
  }

  // timeline source -> svg markup, or '' when mermaid should draw it. t: the style tokens of mermaid.js, fit: the
  // width the axis may stretch to
  var render = (src, t, fonts, id, fit) => {
    var model = parse(src)
    if (!model) return ''
    var periods = model.sections.flatMap((section) => section.periods.map((p) => Object.assign(p, {section: section.name})))
    var n = periods.length
    var major = busiest(periods)
    periods.forEach((p, i) => measureLabel(p, i === major, fonts))
    var {numeric, values, scale} = spacing(periods)
    var pos = stretch(periods, values, scale, fit)
    var c = {...pos, ...fonts, t, id, n, numeric, values, major, faint: (alpha) => `rgba(${t.inkRgb},${alpha})`}

    var body = []
    var y = MARGIN
    if (model.title) {
      body.push(titleText(model.title, y, fonts.sans, t))
      y += 40
    }
    var named = model.sections.some((s) => s.name)
    var bandY = y
    if (named) y += 36

    // even periods hang above the baseline, odd ones below
    var reach = (p) => p.drop + 8 + p.rows
    var side = (parity) => Math.max(0, ...periods.filter((p, k) => k % 2 === parity).map(reach))
    var base = grid(y + side(0))
    y = base + Math.max(side(1), 16) + 24

    if (named) body.push(...bands(model, c, bandY, base))
    body.push(...caps(c, base))
    var strip = legend(c, y, pos.right)
    var width = fit && strip.right + MARGIN <= fit + 4 ? Math.floor(fit) : grid(strip.right + MARGIN)
    var height = grid(strip.y)
    var {info, total} = describe(periods, c)
    var summary = `${model.title || 'Timeline'}: ${n} periods from ${periods[0].label} to ${periods[n - 1].label}, ${total} events` +
      (major >= 0 ? `, busiest at ${periods[major].label}` : '')

    return [`<svg xmlns="http://www.w3.org/2000/svg" id="${id}" width="100%" style="max-width: ${width}px;" viewBox="0 0 ${width} ${height}" ` +
      `role="graphics-document document" aria-roledescription="timeline" font-family="${esc(fonts.sans)}">`,
      `<title>${esc(model.title || 'Timeline')}</title><desc>${esc(summary)}</desc>`,
      `<style>${motionCss('#' + id, t)}</style>`,
      body.join(''), links(c, base).join(''), periods.map((p, i) => mark(p, i, c, base)).join(''), strip.parts.join(''),
      `<metadata class="timeline-model">${esc(JSON.stringify(info))}</metadata>`, '</svg>'].join('')
  }

  // playback, the skill's step mode: the figure is complete until a run starts. In a run an ink stroke draws along
  // the baseline to the period in play, which is ringed while its drop draws out of the dot and its label rises off
  // the baseline. Periods behind stay, periods ahead wait faint. The run ends on the complete figure.
  // One clock: 160ms fast, 480ms step, every delay a multiple of 160ms.
  // The viewer's hover and focus skin every node with a glow and an accent outline; a period has no box to outline,
  // so it takes its ring instead: ink under the pointer or a find match, the accent while it is the one in focus
  var motionCss = (root, t) => `
    ${root} g.node, ${root} g.node:hover, ${root} g.node.mmd-selected { filter: none !important; }
    ${root} g.node > .timeline-hit { stroke: none !important; fill: transparent !important; }
    ${root} g.node > circle:not(.tl-ring) { stroke: none !important; }
    ${root} g.node > .tl-ring { stroke: ${t.ink} !important; stroke-width: 1px !important; fill: none !important; }
    ${root} g.node:hover > .tl-ring, ${root} g.node.mmd-match > .tl-ring, ${root} g.node.mmd-selected > .tl-ring { opacity: 1; }
    ${root} g.node.mmd-selected > .tl-ring { stroke: ${t.accent} !important; stroke-width: 1.5px !important; }
    ${root} .tl-progress { stroke-dasharray: 1 1; stroke-dashoffset: 1; opacity: 0; pointer-events: none;
      transition: stroke-dashoffset 480ms cubic-bezier(.2,.8,.2,1), opacity 160ms linear; }
    ${root}.tl-motion .tl-progress { opacity: 1; }
    ${root} .tl-ring { opacity: 0; pointer-events: none; transition: opacity 160ms linear; }
    ${root}.tl-motion [data-tl=now] .tl-ring { opacity: 1; transition-delay: 320ms; }
    ${root} .timeline-period, ${root} .tl-label { transition: opacity 480ms cubic-bezier(.2,.8,.2,1), transform 480ms cubic-bezier(.2,.8,.2,1); }
    ${root} .tl-drop { stroke-dasharray: 1 1; stroke-dashoffset: 0; transition: stroke-dashoffset 480ms cubic-bezier(.2,.8,.2,1); }
    ${root}.tl-motion [data-tl=wait] { opacity: .12; }
    ${root}.tl-motion [data-tl=wait] .tl-drop { stroke-dashoffset: 1; }
    ${root}.tl-motion [data-tl=wait] .tl-label { opacity: 0; }
    ${root}.tl-motion [data-tl=wait] .tl-up { transform: translateY(8px); }
    ${root}.tl-motion [data-tl=wait] .tl-down { transform: translateY(-8px); }
    ${root}.tl-motion [data-tl=now], ${root}.tl-motion [data-tl=now] .tl-drop { transition-delay: 160ms; }
    ${root}.tl-motion [data-tl=now] .tl-label { transition-delay: 320ms; }
    @media (prefers-reduced-motion: reduce) {
      ${root} * { transition: none !important; }
    }
    @media print {
      ${root} .tl-progress, ${root} .tl-ring { display: none; }
      ${root} [data-tl], ${root} .tl-label { opacity: 1 !important; transform: none !important; }
      ${root} .tl-drop { stroke-dashoffset: 0 !important; }
    }`

  var readInfo = (svg) => {
    try {
      return JSON.parse(svg.querySelector('metadata.timeline-model').textContent)
    }
    catch (err) {
      return null
    }
  }

  // consecutive periods of one section
  var bySection = (ids, info) => ids.reduce((groups, key) => {
    var name = info.nodes[key].section
    if (!groups.length || groups[groups.length - 1].name !== name) groups.push({name, keys: []})
    groups[groups.length - 1].keys.push(key)
    return groups
  }, [])

  // even runs of periods
  var byRuns = (ids) => {
    var groups = []
    var size = Math.ceil(ids.length / 8)
    for (var i = 0; i < ids.length; i += size) groups.push({keys: ids.slice(i, i + size), name: ''})
    return groups
  }

  var groupsOf = (ids, info) => {
    if (ids.length <= 8) return ids.map((key) => ({keys: [key], name: ''}))
    var sections = bySection(ids, info)
    return sections.length > 1 && sections.length <= 8 ? sections : byRuns(ids)
  }

  var stepOf = (group, info) => {
    var first = info.nodes[group.keys[0]]
    var last = info.nodes[group.keys[group.keys.length - 1]]
    var several = group.keys.length > 1
    var span = several ? first.name + ' – ' + last.name : first.name
    var said = several ? group.name : first.events.join(', ')
    return {label: said ? span + ' · ' + said : span, x: last.x}
  }

  // where a period stands in a run at step i
  var stage = (step, i) => {
    if (step < i) return 'done'
    return step === i ? 'now' : 'wait'
  }

  // the steps of a run over a drawn timeline, and frame(i) to show step i: below 0 or past the end is the complete
  // figure. At most eight steps: a longer timeline steps by section, or else by even runs of periods
  var motion = (svg) => {
    var info = readInfo(svg)
    if (!info) return null
    var ids = Object.keys(info.nodes)
    var groups = groupsOf(ids, info)
    var els = ids.map((key) => svg.querySelector('[id="' + svg.id + '-timeline-' + key + '-0"]'))
    var progress = svg.querySelector('.tl-progress')
    var [from, to] = info.axis
    var at = {}
    groups.forEach((group, g) => group.keys.forEach((key) => (at[key] = g)))
    var steps = groups.map((group) => stepOf(group, info))
    var frame = (i) => {
      var on = i >= 0 && i < steps.length
      svg.classList.toggle('tl-motion', on)
      ids.forEach((key, k) => {
        if (!els[k]) return
        if (on) els[k].setAttribute('data-tl', stage(at[key], i))
        else els[k].removeAttribute('data-tl')
      })
      if (progress) progress.style.strokeDashoffset = on ? String(1 - (steps[i].x - from) / (to - from || 1)) : ''
    }
    return {steps, frame}
  }

  return {parse, render, motion}
})()
