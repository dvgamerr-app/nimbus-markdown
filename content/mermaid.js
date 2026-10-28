// Mermaid code blocks drawn by Ondine (https://ondine.sh): the background compiles the source to svg, the colours and
// fonts come from --ondine-* custom properties set here, so a theme switch never compiles again
var mmd = (() => {
  var loaded = false

  var walk = (regex, string, result = [], match = regex.exec(string)) =>
    !match ? result : walk(regex, string, result.concat(match[1]))

  // diagram-design style guide tokens
  var tokens = {
    light: {
      paper: '#f5f5f5', paper2: '#ececec', node: '#ffffff',
      ink: '#2d3142', muted: '#4f5d75', soft: '#7a8399',
      rule: 'rgba(45,49,66,0.12)', ruleSolid: '#bfc0c0',
      accent: '#eb6c36', accentTint: 'rgba(235,108,54,0.08)', link: '#2e5aa8',
      accentText: '#bf4520', danger: '#c0401f', dark: false,
      // links out of the focused node, links into it, and the lift under a floating control
      flowOut: '#eb6c36', flowIn: '#2e5aa8', shadow: 'rgba(45,49,66,0.14)', caption: '#5a6580',
      series: ['#7c8f6f', '#5e7a9b', '#b8915a', '#9c6b50', '#6e6479'],
      inkRgb: '45,49,66', accentRgb: '235,108,54', mutedRgb: '79,93,117',
      syn: {vis: '#9a6e3a', fn: '#dd4a68', type: '#dd4a68', keyword: '#07a', punct: '#999', constant: '#905'}
    },
    dark: {
      paper: '#020202', paper2: '#0f0f0f', node: '#0f0f0f',
      ink: '#f5f5f5', muted: '#dedede', soft: '#a3a3a3',
      rule: 'rgba(245,245,245,0.12)', ruleSolid: '#404040',
      accent: '#79b1f9', accentTint: 'rgba(121,177,249,0.10)', link: '#dcaf61',
      accentText: '#a8cdfc', danger: '#f07f77', dark: true,
      flowOut: '#79b1f9', flowIn: '#dcaf61', shadow: 'rgba(0,0,0,0.6)', caption: '#a3a3a3',
      series: ['#69ba7c', '#79b1f9', '#dcaf61', '#f07f77', '#a3a3a3'],
      inkRgb: '245,245,245', accentRgb: '121,177,249', mutedRgb: '222,222,222',
      syn: {vis: '#f8f8f2', fn: '#e6db74', type: '#e6db74', keyword: '#66d9ef', punct: '#f8f8f2', constant: '#f92672'}
    }
  }

  var sans = "'Geist', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
  var mono = "'Geist Mono', ui-monospace, 'SFMono-Regular', Consolas, monospace"

  // the custom properties of an Ondine svg, see https://ondine.sh/docs/guides/theming
  var ondineVars = (t) => ({
    '--ondine-bg': t.paper,
    '--ondine-fg': t.ink,
    '--ondine-muted': t.muted,
    '--ondine-line': t.muted,
    '--ondine-surface': t.node,
    '--ondine-surface-alt': t.paper2,
    '--ondine-border': t.ink,
    '--ondine-accent': t.accent,
    '--ondine-critical': t.danger,
    '--ondine-stroke': '1px',
    '--ondine-radius': '6px',
    '--ondine-font': sans,
    // the design skin in content/index.css reads the rest of the tokens from here
    '--mmd-mono': mono,
    '--mmd-soft': t.soft,
    '--mmd-paper2': t.paper2,
    '--mmd-rule': t.ruleSolid,
    '--mmd-ink-rgb': t.inkRgb,
    '--mmd-accent-tint': t.accentTint,
    '--mmd-accent': t.accent,
    '--mmd-accent-rgb': t.accentRgb,
    '--mmd-accent-text': t.accentText,
    '--mmd-link': t.link,
    '--mmd-danger': t.danger,
    '--mmd-flow-out': t.flowOut,
    '--mmd-flow-in': t.flowIn,
    '--mmd-ink': t.ink,
    '--mmd-muted': t.muted,
    '--mmd-node': t.node,
    '--mmd-caption': t.caption,
    '--mmd-shadow': t.shadow,
    ...[t.accent, ...t.series, t.muted, t.soft].reduce((all, color, i) => (all[`--ondine-series-${i + 1}`] = color, all), {})
  })

  var icons = {
    fullscreen: '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>',
    exit: '<path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/>',
    zoomIn: '<path d="M8 3v10M3 8h10"/>',
    zoomOut: '<path d="M3 8h10"/>',
    reset: '<path d="M3 8a5 5 0 1 0 1.5-3.5M3 2v3h3"/>',
    play: '<path d="M5 3l8 5-8 5z"/>',
    pause: '<path d="M5 3v10M11 3v10"/>',
    prev: '<path d="M10 3L5 8l5 5"/>',
    next: '<path d="M6 3l5 5-5 5"/>'
  }
  var icon = (name) =>
    `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`

  // mouse wheels send one large delta per notch (line mode in firefox); touchpads stream small
  // or horizontal deltas. once a gesture looks like a touchpad, keep it until the stream pauses
  var lastTrackpad = -Infinity
  var trackpad = (e) => {
    if (e.deltaMode !== 0) return false
    if (e.deltaX !== 0 || Math.abs(e.deltaY) < 30 || e.timeStamp - lastTrackpad < 150) {
      lastTrackpad = e.timeStamp
      return true
    }
    return false
  }

  // fullscreen fills the browser viewport only, not the screen
  var setFullscreen = (pre, active) => {
    if (active === pre.classList.contains('mmd-fullscreen')) return
    pre.classList.toggle('mmd-fullscreen', active)
    document.documentElement.classList.toggle('_mmd-fullscreen', active)
    pre._mmdFullscreen && pre._mmdFullscreen()
  }

  // the address says which diagram is fullscreen: ?diagram=<name>, so back and forward step in and out of it, a
  // reload keeps it and the link can be shared. A diagram is named after the heading above it, the anchor stays
  var PARAM = 'diagram'
  var names = () => {
    var found = new Map()
    var heading = 'diagram'
    var used = {}
    // a generated name never takes the id of a heading, that anchor must stay what it says
    var ids = new Set(Array.from(document.querySelectorAll(':is(h1, h2, h3, h4, h5, h6)[id]'), (el) => el.id))
    var taken = new Set()
    document.querySelectorAll(':is(h1, h2, h3, h4, h5, h6)[id], pre').forEach((el) => {
      if (el.tagName.toLowerCase() !== 'pre') return void (heading = el.id)
      if (!el.querySelector(':scope > code.mermaid')) return
      var name
      do {
        used[heading] = (used[heading] || 0) + 1
        name = used[heading] > 1 ? heading + '-' + used[heading] : heading
      } while (taken.has(name) || (name !== heading && ids.has(name)))
      taken.add(name)
      found.set(el, name)
    })
    return found
  }
  var addressOf = (name) => {
    var url = new URL(location.href)
    name ? url.searchParams.set(PARAM, name) : url.searchParams.delete(PARAM)
    return url.href
  }
  // show what the address asks for
  // a page that may not write its address keeps its fullscreen by hand, the address must not close it
  var addressWorks = true
  var follow = () => {
    if (!addressWorks) return
    var wanted = new URL(location.href).searchParams.get(PARAM)
    names().forEach((name, pre) => pre._mmdFullscreen && setFullscreen(pre, name === wanted))
  }
  var write = (push, name) => {
    try {
      // a step this page pushed is marked, so leaving can take it back off the history
      push ? history.pushState({nimbusOpened: name}, '', addressOf(name)) : history.replaceState(null, '', addressOf(name))
    }
    catch (err) {
      // a page that may not write its address still goes fullscreen, only without the history
      addressWorks = false
      return false
    }
    return true
  }
  var fullscreen = (pre, active) => {
    var name = names().get(pre)
    if (active) return write(true, name) ? follow() : setFullscreen(pre, true)
    // leaving: step back when the page came here by opening it, otherwise (a shared link, a reload) drop the param
    // only the entry this diagram opened is taken back, an anchor followed since then is a different entry
    if (name && history.state && history.state.nimbusOpened === name) return history.back()
    write(false, null) ? follow() : setFullscreen(pre, false)
  }
  window.addEventListener('popstate', follow)
  document.addEventListener('keydown', (e) => {
    var pre = document.querySelector('pre.mmd-fullscreen')
    if (!pre || e.ctrlKey || e.metaKey || e.altKey) return
    if (pre._mmdKey && pre._mmdKey(e)) return e.preventDefault()
    if (e.key === 'Escape') fullscreen(pre, false)
  })

  var NS = 'http://www.w3.org/2000/svg'
  var calm = () => !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // links out of the focused node are orange, links into it are blue
  var lit = (dir) => `var(--mmd-flow-${dir === 'in' ? 'in' : 'out'})`

  // the comet: a streak that travels along a line in its drawn direction, one-shot for a playing step, looping
  // while a node stays focused. Stacked dashes share one head but differ in length, so the streak thins out behind
  // a bright core; each dash is stroked with its own gradient, clear at the tail and solid at the head
  var comet = [['glow', 1], ['tail', 1], ['body', 0.75], ['head', 0.5], ['core', 0.3]]
  var flowSeq = 0
  // a long streak, about half the line, between 80px and 260px but never longer than a short line
  var streakSpan = (length) => Math.min(length * 0.8, Math.max(80, Math.min(260, length * 0.5)))
  var lengthOf = (el) => {
    try { return el.getTotalLength() } catch (err) { return 0 }
  }
  var fadeOf = (part, defs) => {
    var fade = document.createElementNS(NS, 'linearGradient')
    fade.id = 'mmd-flow-fade-' + ++flowSeq
    fade.setAttribute('class', 'mmd-flow-' + part + '-fade')
    fade.setAttribute('gradientUnits', 'userSpaceOnUse')
    ;[[0, 0], [1, 1]].forEach(([offset, opacity]) => {
      var stop = document.createElementNS(NS, 'stop')
      stop.setAttribute('offset', offset)
      stop.setAttribute('stop-opacity', opacity)
      fade.appendChild(stop)
    })
    defs.appendChild(fade)
    return fade
  }
  // the copy of the line that carries one dash of the comet
  var dashOf = (el, part, fade, dash) => {
    var line = el.cloneNode(false)
    ;['id', 'style', 'class', 'stroke-dasharray', 'data-mmd-seq'].forEach((name) => line.removeAttribute(name))
    line.setAttribute('class', 'mmd-flow-' + part)
    line.style.setProperty('stroke', 'url(#' + fade.id + ')', 'important')
    line.style.strokeDasharray = dash
    return line
  }
  // the line sampled once into at most 256 points: asking the path on every frame stalls a large diagram
  var sampled = (el, length) => {
    var pitch = Math.max(2, length / 256)
    var count = Math.ceil(length / pitch)
    var samples = null
    return (d) => {
      samples = samples || Array.from({length: count + 1}, (_, k) => el.getPointAtLength(Math.min(k * pitch, length)))
      var i = Math.min(Math.floor(d / pitch), count - 1)
      var a = samples[i]
      var b = samples[i + 1]
      var f = (d - i * pitch) / Math.min(pitch, length - i * pitch)
      return {x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f}
    }
  }
  // a point on the line, carried straight on past either end so the gradient keeps its span there
  var carried = (point, length) => (d) => {
    var clamped = Math.max(0, Math.min(length, d))
    var p = point(clamped)
    if (clamped === d) return p
    var q = point(d < 0 ? Math.min(length, 1) : Math.max(0, length - 1))
    var dx = p.x - q.x
    var dy = p.y - q.y
    var n = Math.hypot(dx, dy) || 1
    var past = Math.abs(d - clamped)
    return {x: p.x + (dx / n) * past, y: p.y + (dy / n) * past}
  }
  var ease = (t) => (1 - Math.cos(Math.PI * t)) / 2
  var LOOP = 2400
  // reverse runs it from the end of the path back to the start, over takes the clock for a one-shot
  var flow = (line, dir, {delay = 0, loop = false, reverse = false, over = 1400, color = ''} = {}) => {
    var group = document.createElementNS(NS, 'g')
    group.setAttribute('class', 'mmd-flow')
    group.dataset.dir = dir
    color && group.style.setProperty('--c', color)
    var length = lengthOf(line)
    if (!length || calm()) return group
    var span = streakSpan(length)
    var defs = document.createElementNS(NS, 'defs')
    group.appendChild(defs)
    line.parentNode.appendChild(group)
    var layers = comet.map(([part, share]) => {
      var fade = fadeOf(part, defs)
      var len = span * share
      var dash = dashOf(line, part, fade, len + ' ' + (length + span) * 2)
      group.appendChild(dash)
      return {dash, fade, len}
    })
    var at = carried(sampled(line, length), length)
    // dashoffset and gradient both follow the head; the streak enters from before the source and drains wholly
    // into the target
    var duration = loop ? LOOP : over
    var start = performance.now() + delay * 1000
    var frame = (now) => {
      if (!group.isConnected) return
      var t = Math.max(0, now - start) / duration
      if (!loop && t >= 1) return group.remove()
      var run = ease(loop ? t % 1 : t)
      var head = reverse ? length - run * (length + span) : run * (length + span)
      var to = at(head)
      layers.forEach(({dash, fade, len}) => {
        var from = at(reverse ? head + len : head - len)
        dash.style.strokeDashoffset = -(reverse ? head : head - len)
        fade.setAttribute('x1', from.x)
        fade.setAttribute('y1', from.y)
        fade.setAttribute('x2', to.x)
        fade.setAttribute('y2', to.y)
      })
      requestAnimationFrame(frame)
    }
    frame(performance.now())
    return group
  }

  // which ends of a line carry an arrowhead: a marker drawn near its first or last point
  var heads = (line, markers) => {
    var length = lengthOf(line)
    if (!length) return {start: false, end: false}
    var first = line.getPointAtLength(0)
    var last = line.getPointAtLength(length)
    var near = (p, box) => Math.hypot(box.x + box.width / 2 - p.x, box.y + box.height / 2 - p.y) < 12
    var boxes = markers.map((m) => m.getBBox())
    return {start: boxes.some((b) => near(first, b)), end: boxes.some((b) => near(last, b))}
  }

  // the graph an Ondine (or dbml) svg draws: named nodes and the lines between them, oriented towards the arrowhead
  // the diagrams the extension draws itself name a node "<svg>-<kind>-<id>-0" and join two with a
  // path.relationshipLine that names them in data-from and data-to
  var drawnNode = /-(?:dbml|journey|timeline|req|git|c4|mindmap)-(.+)-0$/
  var graphOf = (svg) => {
    var drawn = !svg.classList.contains('ondine')
    var info = (() => {
      try {
        return JSON.parse(svg.querySelector('metadata[class$="-model"]').textContent).nodes || {}
      }
      catch (err) {
        return {}
      }
    })()
    var nodes = drawn
      ? Array.from(svg.querySelectorAll('g.node[id]')).map((el) => {
        var id = (drawnNode.exec(el.id) || [])[1]
        return {el, id, name: id && info[id] && info[id].name}
      })
      : Array.from(svg.querySelectorAll('g.ondine-node[data-id], g.ondine-cluster[data-id]'))
        .map((el) => ({el, id: el.dataset.id, cluster: el.classList.contains('ondine-cluster')}))
    nodes = nodes.filter((n) => n.id)
    var byId = new Map(nodes.map((n) => [n.id, n]))
    // the nodes at the two ends of a line, by where it starts and stops: ids like "edge3" name no nodes
    var reach = (line) => {
      var length = lengthOf(line)
      var matrix = line.getScreenCTM()
      if (!length || !matrix) return null
      var at = (distance) => {
        var point = line.getPointAtLength(distance).matrixTransform(matrix)
        var best = null
        nodes.forEach((n) => {
          var box = n.el.getBoundingClientRect()
          var gap = Math.hypot(Math.max(box.left - point.x, 0, point.x - box.right), Math.max(box.top - point.y, 0, point.y - box.bottom))
          // a cluster holds its own nodes, a point inside it belongs to the cluster only at its frame
          if (n.cluster && !gap) gap = Math.min(point.x - box.left, box.right - point.x, point.y - box.top, box.bottom - point.y)
          if (!best || gap < best.gap) best = {id: n.id, gap}
        })
        // the arrowhead stops a few units short of the border
        return best && best.gap <= 14 * Math.abs(matrix.a) ? best.id : null
      }
      var from = at(0)
      var to = at(length)
      return from && to ? {from, to} : null
    }
    var edges = drawn
      ? Array.from(svg.querySelectorAll('path.relationshipLine[data-from]')).map((el) => ({el, line: el, from: el.dataset.from, to: el.dataset.to, reverse: false, label: null}))
      : Array.from(svg.querySelectorAll('g.ondine-edge:not(.ondine-message)')).map((el) => {
        var line = el.querySelector(':scope > path:not(.ondine-marker)')
        var pair = line && reach(line)
        if (!pair) return null
        var tips = heads(line, Array.from(el.querySelectorAll(':scope > .ondine-marker')))
        // "A <|-- B" draws its head at the start of the line: the link runs towards it
        var reverse = tips.start && !tips.end
        var label = el.dataset.id ? svg.querySelector('.ondine-edge-label[data-id="' + CSS.escape(el.dataset.id) + '"]') : null
        return {el, line, from: reverse ? pair.to : pair.from, to: reverse ? pair.from : pair.to, reverse, label}
      })
    return {nodes, byId, edges: edges.filter((e) => e && byId.has(e.from) && byId.has(e.to))}
  }

  // Ondine bends a link with a cubic curve where it changes lanes: redraw every link as straight runs that turn at
  // right angles, each corner rounded. A curve keeps the direction it leaves and arrives in, so the arrowhead still fits
  var CORNER = 8
  var close = (a, b) => Math.abs(a - b) < 0.01
  var elbow = (from, c1, c2, to) => {
    // the way the curve leaves and arrives: from its control points, or from the far end when a control point sits
    // on its own end
    var leave = !close(c1[0], from[0]) || !close(c1[1], from[1]) ? c1 : !close(c2[0], from[0]) || !close(c2[1], from[1]) ? c2 : to
    var reach = !close(c2[0], to[0]) || !close(c2[1], to[1]) ? c2 : !close(c1[0], to[0]) || !close(c1[1], to[1]) ? c1 : from
    var across = (a, b) => Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])
    var out = across(from, leave)
    var into = across(reach, to)
    if (out && into) {
      var x = (from[0] + to[0]) / 2
      return [[x, from[1]], [x, to[1]], to]
    }
    if (!out && !into) {
      var y = (from[1] + to[1]) / 2
      return [[from[0], y], [to[0], y], to]
    }
    return [out ? [to[0], from[1]] : [from[0], to[1]], to]
  }
  // the points of a path written with M, L, H, V and C, or null for anything else (an arc stays as it is drawn)
  var pointsOf = (d) => {
    var points = []
    // e is the exponent of a number, not a command; a sign or a second dot also starts a number
    var parts = d.match(/[A-DF-Za-df-z][^A-DF-Za-df-z]*/g) || []
    for (var part of parts) {
      var cmd = part[0]
      var n = (part.slice(1).match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number)
      if (n.some(Number.isNaN)) return null
      var last = points[points.length - 1]
      if (cmd === 'M' || cmd === 'L') {
        for (var i = 0; i + 1 < n.length; i += 2) points.push([n[i], n[i + 1]])
      }
      else if (cmd === 'H' && last) n.forEach((x) => points.push([x, points[points.length - 1][1]]))
      else if (cmd === 'V' && last) n.forEach((y) => points.push([points[points.length - 1][0], y]))
      else if (cmd === 'C' && last) {
        for (var j = 0; j + 5 < n.length; j += 6) {
          points.push(...elbow(points[points.length - 1], [n[j], n[j + 1]], [n[j + 2], n[j + 3]], [n[j + 4], n[j + 5]]))
        }
      }
      else return null
    }
    // drop repeated points and the middle of straight runs
    return points.filter((p, k) => !k || !close(p[0], points[k - 1][0]) || !close(p[1], points[k - 1][1]))
      .filter((p, k, all) => {
        var a = all[k - 1]
        var b = all[k + 1]
        return !a || !b || !((close(a[0], p[0]) && close(p[0], b[0])) || (close(a[1], p[1]) && close(p[1], b[1])))
      })
  }
  var r1 = (v) => Math.round(v * 100) / 100
  var roundedPath = (points) => points.reduce((d, cur, i) => {
    if (!i) return 'M' + r1(cur[0]) + ',' + r1(cur[1])
    var next = points[i + 1]
    if (!next) return d + 'L' + r1(cur[0]) + ',' + r1(cur[1])
    var prev = points[i - 1]
    var l1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1])
    var l2 = Math.hypot(next[0] - cur[0], next[1] - cur[1])
    // a corner takes at most half of either run, so two corners never overlap
    var r = Math.min(CORNER, l1 / 2, l2 / 2)
    if (!r) return d + 'L' + r1(cur[0]) + ',' + r1(cur[1])
    return d +
      'L' + r1(cur[0] - (cur[0] - prev[0]) * r / l1) + ',' + r1(cur[1] - (cur[1] - prev[1]) * r / l1) +
      'Q' + r1(cur[0]) + ',' + r1(cur[1]) + ' ' + r1(cur[0] + (next[0] - cur[0]) * r / l2) + ',' + r1(cur[1] + (next[1] - cur[1]) * r / l2)
  }, '')
  var straighten = (svg) => svg.querySelectorAll('.ondine-edge > path:not(.ondine-marker)').forEach((line) => {
    var points = pointsOf(line.getAttribute('d') || '')
    points && points.length > 1 && line.setAttribute('d', roundedPath(points))
  })

  var tint = (edge, dir) => {
    var style = edge.el.style
    if (!dir) {
      style.removeProperty('--_l')
      style.removeProperty('stroke')
      delete edge.el.dataset.mmdDir
      return
    }
    edge.el.dataset.mmdDir = dir
    style.setProperty('--_l', lit(dir))
    style.setProperty('stroke', lit(dir), 'important')
  }

  // playback steps: the messages of a sequence diagram top to bottom, the transitions of a state machine as it
  // unfolds from its start. Each step lights its parts and sends a comet along its lines
  var say = (el) => (el ? Array.from(el.querySelectorAll('text')).map((t) => t.textContent.trim()).filter(Boolean).join(' ') || el.textContent.trim() : '')
  var sequenceSteps = (svg) => Array.from(svg.querySelectorAll('g.ondine-message')).map((el) => {
    var line = el.querySelector(':scope > path:not(.ondine-marker)')
    var markers = Array.from(el.querySelectorAll(':scope > .ondine-marker'))
    // a cross is a lost message, drawn as two strokes
    var lost = markers.some((m) => ((m.getAttribute('d') || '').match(/M/gi) || []).length > 1)
    var tips = line ? heads(line, markers) : {start: false, end: true}
    var label = svg.querySelector('.ondine-edge-label[data-id="' + CSS.escape(el.dataset.id || '') + '"]')
    return {
      lines: line ? [{line, ways: tips.start && tips.end ? [1, -1] : [tips.start ? -1 : 1], lost}] : [],
      parts: [el, label],
      to: [],
      label: say(label)
    }
  })

  var stateSteps = (graph) => {
    var {nodes, byId, edges} = graph
    var named = (id) => {
      var node = byId.get(id)
      var text = node && node.el.querySelector('.ondine-label, .ondine-cluster-label')
      return (node && node.name) || (text && text.textContent.trim()) || (/start/.test(id) ? 'Start' : /end/.test(id) ? 'End' : id)
    }
    var rect = (n) => n.el.getBoundingClientRect()
    var holds = (cluster, n) => {
      var a = rect(cluster)
      var b = rect(n)
      return n !== cluster && b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom
    }
    var clusters = nodes.filter((n) => n.cluster)
    var incoming = new Set(edges.map((e) => e.to))
    // a fork or join bar is a node much taller than wide, or wider than tall
    var bar = (id) => {
      var node = byId.get(id)
      var box = node && !node.cluster && rect(node)
      return !!box && (box.height > box.width * 3 || box.width > box.height * 3)
    }
    var order = []
    var entered = new Set()
    var queue = []
    // depth first: a state's transitions play before the siblings that were waiting. Reaching a composite state
    // plays what is inside it first, then the transitions that leave it
    var enter = (id) => {
      if (entered.has(id)) return
      entered.add(id)
      var node = byId.get(id)
      var out = edges.filter((e) => e.from === id)
      if (!node || !node.cluster) return void queue.unshift(...out)
      var inside = []
      nodes.filter((n) => !n.cluster && holds(node, n) && !incoming.has(n.id) && !entered.has(n.id)).forEach((n) => {
        entered.add(n.id)
        inside.push(...edges.filter((e) => e.from === n.id))
      })
      queue.unshift(...inside, ...out)
    }
    nodes.filter((n) => !incoming.has(n.id) && !clusters.some((c) => holds(c, n))).reverse().forEach((n) => enter(n.id))
    while (queue.length) {
      var next = queue.shift()
      if (order.includes(next)) continue
      order.push(next)
      enter(next.to)
    }
    edges.filter((e) => !order.includes(e)).forEach((e) => order.push(e))
    var steps = []
    order.forEach((edge) => {
      var said = (edge.label ? say(edge.label) + ' · ' : '') + named(edge.from) + ' → ' + named(edge.to)
      var lines = [{line: edge.line, ways: [edge.reverse ? -1 : 1], lost: false}]
      // the branches that leave a fork, and the ones that meet at a join, play together
      var key = bar(edge.from) ? 'from:' + edge.from : bar(edge.to) ? 'to:' + edge.to : null
      var step = key && steps.find((s) => s.key === key)
      if (step) {
        step.lines.push(...lines)
        step.parts.push(edge.el, edge.label)
        step.to.push(edge.to)
        step.label += ' | ' + said
      }
      else {
        steps.push({lines, parts: [edge.el, edge.label], to: [edge.to], label: said, key})
      }
    })
    return steps
  }

  // fullscreen motion: hover a node to light its links, click it to focus it with comets running along them,
  // play a sequence or a state machine step by step. Inline the diagram stays still
  var motion = (pre, svg, signal, active) => {
    var kind = svg.getAttribute('aria-roledescription') || ''
    var graph = null
    var model = () => graph || (graph = graphOf(svg))
    var focused = null

    var clearFocus = () => {
      svg.querySelectorAll('.mmd-on, .mmd-selected').forEach((el) => el.classList.remove('mmd-on', 'mmd-selected'))
      svg.querySelectorAll('.mmd-flow').forEach((el) => el.remove())
      graph && graph.edges.forEach((edge) => tint(edge, null))
    }
    var focus = (id) => {
      clearFocus()
      focused = id
      svg.classList.toggle('mmd-focus', !!id)
      if (!id) return
      var {nodes, byId, edges} = model()
      var shown = new Set([id])
      edges.filter((e) => e.from === id || e.to === id).forEach((edge, index) => {
        var dir = edge.from === id ? 'out' : 'in'
        shown.add(edge.from).add(edge.to)
        edge.el.classList.add('mmd-on')
        edge.label && edge.label.classList.add('mmd-on')
        tint(edge, dir)
        flow(edge.line, dir, {delay: Math.min(index, 6) * 0.2, loop: true, reverse: edge.reverse})
      })
      nodes.forEach((n) => n.el.classList.toggle('mmd-on', shown.has(n.id)))
      byId.get(id).el.classList.add('mmd-selected')
    }
    var nodeAt = (target) => {
      var el = target && target.closest && target.closest('g.ondine-node, g.ondine-cluster, g.node')
      return el ? model().nodes.find((n) => n.el === el) : null
    }

    // hover: light up the links of the node under the pointer
    var hovered = []
    var peeked = null
    var peek = (node) => {
      if (peeked === node) return
      peeked = node
      hovered.forEach((edge) => edge.el.classList.contains('mmd-on') || tint(edge, null))
      hovered = []
      if (!node || focused || playing()) return
      hovered = model().edges.filter((e) => e.from === node.id || e.to === node.id)
      hovered.forEach((edge) => tint(edge, edge.from === node.id ? 'out' : 'in'))
    }
    pre.addEventListener('mouseover', (e) => active() && peek(nodeAt(e.target)), {signal})
    pre.addEventListener('mouseleave', () => peek(null), {signal})

    var down = null
    // capture: panzoom stops pointerdown from bubbling in fullscreen, a bubbling listener would read every later
    // click as a drag
    pre.addEventListener('pointerdown', (e) => (down = {x: e.clientX, y: e.clientY}), {capture: true, signal})
    pre.addEventListener('click', (e) => {
      if (!active() || (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4)) return
      var node = nodeAt(e.target)
      if (!node && !focused) return
      var open = node && node.id !== focused && !playing()
      open && stop()
      focus(open ? node.id : null)
    }, {signal})

    // playback, for a sequence diagram or a state machine
    var TRAVEL = 1100
    var HOLD = 1500
    var steps = null
    // a timeline plays its own reveal along the baseline, a journey walks its stages like a state machine
    var tl = kind === 'timeline' && !calm() ? timeline.motion(svg) : null
    var walks = kind === 'state' || kind === 'journey'
    var stepsOf = () => steps || (steps = tl ? tl.steps.map((s) => ({lines: [], parts: [], to: [], label: s.label}))
      : kind === 'sequence' ? sequenceSteps(svg) : walks ? stateSteps(model()) : [])
    var plays = kind === 'sequence' || walks || !!tl
    var at = -1
    var run = false
    var timer = 0
    var drawn = []
    var playing = () => run

    var h = (tag, cls, text) => {
      var el = document.createElement(tag)
      el.className = cls
      if (text != null) el.textContent = text
      return el
    }
    var player = h('div', 'mmd-player')
    player.hidden = true
    ;['pointerdown', 'click', 'dblclick', 'wheel'].forEach((type) => player.addEventListener(type, (e) => e.stopPropagation()))
    var tool = (name, title, onclick) => {
      var btn = h('button', 'mmd-player-btn')
      btn.type = 'button'
      btn.title = title
      btn.setAttribute('aria-label', title)
      btn.innerHTML = icon(name)
      btn.addEventListener('click', onclick)
      return btn
    }
    var counter = h('span', 'mmd-player-count')
    var caption = h('span', 'mmd-player-caption')
    var playTool = tool('play', 'Play (P)', () => toggle())
    var closeTool = h('button', 'mmd-player-close', '×')
    closeTool.type = 'button'
    closeTool.title = 'Close (Esc)'
    closeTool.setAttribute('aria-label', 'Close')
    closeTool.addEventListener('click', () => stop())
    var unit = {state: 'transition', journey: 'stage', timeline: 'period'}[kind] || 'message'
    plays && player.append(tool('prev', 'Previous ' + unit + ' ([)', () => move(-1)), playTool, tool('next', 'Next ' + unit + ' (])', () => move(1)), counter, caption, closeTool)
    plays && pre.appendChild(player)

    var mark = (current) => {
      if (tl) return tl.frame(current)
      var list = stepsOf()
      list.forEach((step, j) => {
        var state = current < 0 ? '' : j < current ? 'done' : j === current ? 'now' : 'wait'
        step.parts.forEach((el) => el && (state ? el.setAttribute('data-mmd-seq', state) : el.removeAttribute('data-mmd-seq')))
      })
      if (!walks) return
      // the state just reached is lit, the ones reached before keep their colours, the rest wait
      var starts = new Set(model().nodes.filter((n) => !model().edges.some((e) => e.to === n.id)).map((n) => n.id))
      model().nodes.forEach((n) => {
        var reached = starts.has(n.id) || current >= list.length || list.slice(0, Math.max(current, 0)).some((s) => s.to.includes(n.id))
        var now = current >= 0 && current < list.length && list[current].to.includes(n.id)
        var state = current < 0 ? '' : now ? 'now' : reached ? 'done' : 'wait'
        state ? n.el.setAttribute('data-mmd-seq', state) : n.el.removeAttribute('data-mmd-seq')
      })
    }
    var clearDrawn = () => {
      drawn.forEach((el) => el.remove())
      drawn = []
    }
    var travel = (step) => step.lines.forEach(({line, ways, lost}) => ways.forEach((way) => {
      var color = lost ? 'var(--mmd-danger)' : 'var(--mmd-flow-out)'
      var streak = flow(line, 'out', {reverse: way < 0, over: TRAVEL, color})
      streak.isConnected && drawn.push(streak)
    }))
    var paint = () => {
      var list = stepsOf()
      playTool.innerHTML = icon(run ? 'pause' : 'play')
      playTool.title = run ? 'Pause (P)' : at >= list.length ? 'Replay (P)' : 'Play (P)'
      playTool.setAttribute('aria-label', playTool.title)
    }
    var go = (i) => {
      var list = stepsOf()
      clearTimeout(timer)
      clearDrawn()
      focused && focus(null)
      player.hidden = false
      svg.classList.add('mmd-seq')
      at = Math.max(0, Math.min(i, list.length - 1))
      mark(at)
      travel(list[at])
      counter.textContent = at + 1 + ' / ' + list.length
      caption.textContent = list[at].label
      paint()
      if (run) timer = setTimeout(() => (at + 1 < list.length ? go(at + 1) : finish()), HOLD)
    }
    // the run ends complete: every step back at full strength
    var finish = () => {
      var list = stepsOf()
      clearTimeout(timer)
      clearDrawn()
      run = false
      at = list.length
      mark(at)
      counter.textContent = list.length + ' / ' + list.length
      caption.textContent = 'Complete'
      paint()
    }
    var pause = () => {
      run = false
      clearTimeout(timer)
      paint()
    }
    var toggle = () => {
      var list = stepsOf()
      if (!list.length) return
      if (at < 0 || at >= list.length) {
        run = true
        go(0)
      }
      else if (run) pause()
      else {
        run = true
        go(at)
      }
    }
    var move = (by) => {
      var list = stepsOf()
      if (!list.length) return
      pause()
      if (by > 0 && at >= list.length - 1 && at >= 0) return finish()
      go(at < 0 ? 0 : at >= list.length ? list.length - 1 : at + by)
    }
    var stop = () => {
      run = false
      clearTimeout(timer)
      clearDrawn()
      at = -1
      steps && mark(-1)
      svg.classList.remove('mmd-seq')
      player.hidden = true
      plays && paint()
    }

    return {
      plays,
      toggle,
      // keys: P play, [ ] step, escape closes the player, then the focus
      key: (e) => {
        if (plays && (e.key === 'p' || e.key === 'P')) return toggle(), true
        if (plays && e.key === '[') return move(-1), true
        if (plays && e.key === ']') return move(1), true
        if (e.key === 'Escape' && at >= 0) return stop(), true
        if (e.key === 'Escape' && focused) return focus(null), true
        return false
      },
      // leaving fullscreen: nothing keeps running, and the layout may have moved, so the graph is read again
      reset: () => {
        stop()
        peek(null)
        focus(null)
        graph = null
        steps = null
      },
      dispose: () => {
        stop()
        player.remove()
      }
    }
  }

  // fullscreen + zoom controls; zoom/move only work in fullscreen, inline the diagram is static
  // mouse: wheel zoom, drag move | touchpad: pinch zoom, two-finger move | touch: pinch zoom, drag move
  var toolbar = (pre, panzoom) => {
    // every render builds a new set of controls: drop the previous set, its listeners and its panzoom
    pre._mmdDispose && pre._mmdDispose()
    var abort = new AbortController()
    var signal = abort.signal
    pre._mmdDispose = () => {
      abort.abort()
      panzoom.destroy()
      pre._mmdMotion && pre._mmdMotion.dispose()
      pre.querySelectorAll(':scope > .mmd-toolbar, :scope > .mmd-player').forEach((el) => el.remove())
    }

    var bar = document.createElement('div')
    bar.className = 'mmd-toolbar'
    var button = (name, title, onclick) => {
      var btn = document.createElement('button')
      btn.type = 'button'
      btn.title = title
      btn.dataset.action = name
      btn.innerHTML = icon(name)
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        onclick(btn)
      })
      bar.appendChild(btn)
      return btn
    }
    var active = () => pre.classList.contains('mmd-fullscreen')
    var level = document.createElement('span')
    level.className = 'mmd-level'
    level.title = 'Reset zoom'
    level.textContent = '100%'
    level.addEventListener('click', (e) => {
      e.stopPropagation()
      panzoom.reset()
    })

    button('zoomOut', 'Zoom out', () => panzoom.zoomOut())
    bar.appendChild(level)
    button('zoomIn', 'Zoom in', () => panzoom.zoomIn())
    button('reset', 'Reset', () => panzoom.reset())
    var play = button('play', 'Play (P)', () => moves_.toggle())
    var full = button('fullscreen', 'Fullscreen', () => fullscreen(pre, !active()))
    bar.addEventListener('pointerdown', (e) => e.stopPropagation())
    pre.appendChild(bar)

    var code = pre.querySelector(':scope > code.mermaid')
    var svg = code.querySelector('svg')
    var moves_ = motion(pre, svg, signal, active)
    pre._mmdMotion = moves_
    play.hidden = !moves_.plays
    var svgEvent = (name, fn) => svg.addEventListener(name, (e) => active() && fn(e), {signal})
    svgEvent('panzoomchange', (e) => {
      level.textContent = Math.round(e.detail.scale * 100) + '%'
    })
    code.addEventListener('pointerdown', (e) => active() && panzoom.handleDown(e), {signal})
    document.addEventListener('pointermove', (e) => active() && panzoom.handleMove(e), {signal})
    document.addEventListener('pointerup', (e) => active() && panzoom.handleUp(e), {signal})

    // keys while fullscreen: + - 0 zoom, arrows move, escape leaves
    var step = 40
    var moves = {ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step]}
    pre._mmdKey = (e) => {
      if (moves_.key(e)) return true
      if (e.key === '+' || e.key === '=') panzoom.zoomIn()
      else if (e.key === '-') panzoom.zoomOut()
      else if (e.key === '0') panzoom.reset()
      else if (moves[e.key]) panzoom.pan(...moves[e.key], {relative: true})
      else return false
      return true
    }

    var sync = () => {
      var on = active()
      full.innerHTML = icon(on ? 'exit' : 'fullscreen')
      full.title = on ? 'Exit fullscreen' : 'Fullscreen'
      panzoom.setOptions({touchAction: on ? 'none' : 'auto'})
      code.style.userSelect = svg.style.userSelect = on ? 'none' : ''
      panzoom.reset({animate: false})
      level.textContent = '100%'
      on || moves_.reset()
    }
    pre._mmdFullscreen = sync
    sync()

    pre.onwheel = (e) => {
      if (!active()) return
      e.preventDefault()
      if (e.ctrlKey) {
        // touchpad pinch (reported as ctrl+wheel with small deltas)
        var scale = panzoom.getScale() * Math.exp(-e.deltaY * 0.01)
        panzoom.zoomToPoint(scale, e)
      }
      else if (trackpad(e)) {
        // touchpad two-finger scroll -> move
        var current = panzoom.getScale()
        panzoom.pan(-e.deltaX / current, -e.deltaY / current, {relative: true})
      }
      else {
        // mouse wheel -> zoom
        panzoom.zoomWithWheel(e)
      }
    }
    pre.ondblclick = () => active() && panzoom.reset()
  }

  // the page asks for a render more than once while it loads (before and after the theme css arrives):
  // run one at a time, rerun once after
  var running = false
  var queued = false
  var sequence = 0

  var ask = (source, options) => new Promise((resolve) =>
    chrome.runtime.sendMessage({message: 'ondine', source, options}, (res) =>
      resolve(res || {error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'no answer'})
    )
  )

  var render = () => {
    if (running) {
      queued = true
      return
    }
    running = true
    if (loaded) {
      var definitions = walk(/<pre><code class="mermaid(?: dbml)?">([\s\S]+?)<\/code><\/pre>/gi, state.html)

      Array.from(document.querySelectorAll('pre code.mermaid')).forEach((diagram, index) => {
        diagram.removeAttribute('data-processed')
        diagram.innerHTML = definitions[index]
      })
    }
    var dark =
      state._themes[state.theme] === 'dark' ||
      (state._themes[state.theme] === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    var t = dark ? tokens.dark : tokens.light
    document.documentElement.classList.toggle('_mermaid-dark', dark)
    var vars = ondineVars(t)
    // the toolbar and the player sit beside the diagram, not in it: they read the same tokens from the page
    Object.keys(vars).forEach((name) => name.startsWith('--mmd-') && document.documentElement.style.setProperty(name, vars[name]))

    // render from textContent: innerHTML would decode entities in the source
    var jobs = Array.from(document.querySelectorAll('code.mermaid')).map((node) => {
      var text = node.textContent
      var id = 'mmd-' + ++sequence
      node.removeAttribute('data-processed')
      Object.keys(vars).forEach((name) => node.style.setProperty(name, vars[name]))
      // the room the diagram has on the page: the content box of its <pre>
      var box = node.parentNode
      var pad = box ? getComputedStyle(box) : null
      var fit = box ? box.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight) : 0
      // dbml, user journeys, timelines, gantt, pie, quadrant, requirement, git, c4 and mindmap draw themselves in the
      // diagram-design skin, Ondine gets the rest and whatever they hand back
      var custom = node.classList.contains('dbml')
        ? () => dbml.render(text, t, {sans, mono}, id)
        : () => [journey, timeline, gantt, pie, quadrant, requirement, gitgraph, c4, mindmap].reduce((svg, d) => svg || d.render(text, t, {sans, mono}, id, fit), '')
      var drawn = Promise.resolve().then(custom).then((svg) =>
        svg ? {svg} : ask(text, {idPrefix: id, fontSize: 13, maxWidth: fit > 0 ? fit : undefined})
      )
      return drawn.then(({svg, error}) => {
        if (error) throw new Error(error)
        node.innerHTML = svg
        var compiled = node.querySelector('svg.ondine')
        compiled && straighten(compiled)
        node.setAttribute('data-processed', 'true')
      }).catch((err) => {
        node.textContent = text + '\n\n' + (err && err.message || err)
        node.setAttribute('data-processed', 'true')
      })
    })
    loaded = true

    Promise.all(jobs).then(() => {
      document.querySelectorAll('code.mermaid svg[aria-roledescription=gantt]').forEach(gantt.bind)
      document.querySelectorAll('pre > code.mermaid > svg').forEach((diagram) => {
        var panzoom = Panzoom(diagram, {canvas: true, maxScale: 20, minScale: 0.2, touchAction: 'auto', pinchAndPan: true, noBind: true, cursor: ''})
        var pre = diagram.closest('pre')
        pre && pre.querySelector(':scope > code.mermaid') && toolbar(pre, panzoom)
      })
      // a shared link or a reload asks for a diagram by its name
      follow()
    }).finally(() => {
      running = false
      if (queued) {
        queued = false
        render()
      }
    })
  }

  return {render}
})()
