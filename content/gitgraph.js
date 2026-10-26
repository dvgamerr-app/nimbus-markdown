// Mermaid git graphs drawn to the diagram-design swimlane: one lane per branch with its name on a mono tab, commits as
// dots on the lane, branch-offs and merges as rounded right-angle elbows, ids in mono under each commit and tags as
// accent chips that stack instead of colliding. The main branch is ink, the others take the series palette, the
// accent is kept for highlighted commits and tags. Syntax that is not understood falls back to mermaid, see render()
var gitgraph = (() => {
  var TYPES = ['NORMAL', 'REVERSE', 'HIGHLIGHT']

  // `key: "value"` or `key: value` pairs after a command
  var attrs = (text) => {
    var out = {}
    var re = /(\w+)\s*:\s*(?:"([^"]*)"|([^\s"]+))/g
    var found
    while ((found = re.exec(text))) out[found[1].toLowerCase()] = found[2] !== undefined ? found[2] : found[3]
    return out
  }

  var unquote = (s) => s.replace(/^"(.*)"$/, '$1')

  // a short stable id in the shape mermaid gives a commit, `<seq>-<7 hex>`, so ids do not change between renders
  var hash = (s) => {
    var h = 0x811c9dc5
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
    return ('0000000' + h.toString(16)).slice(-7)
  }

  // front matter: a title is fine, any configuration is left to mermaid. Returns the title and the rest of the text
  var frontMatter = (text) => {
    var front = /^\s*---\n([\s\S]*?)\n---\s*\n/.exec(text)
    if (!front) return {title: '', text}
    if (/^\s*config\s*:/m.test(front[1])) return null
    var named = /^\s*title\s*:\s*(.*)$/m.exec(front[1])
    return {title: named ? unquote(named[1].trim()) : '', text: text.slice(front[0].length)}
  }

  var addBranch = (s, name, order, from) => {
    s.branches[name] = {name, order, index: s.model.branches.length, head: from}
    s.model.branches.push(s.branches[name])
  }

  var addCommit = (s, commit) => {
    var seq = s.model.commits.length
    commit.seq = seq
    commit.branch = s.current
    commit.id = commit.id || `${seq}-${hash(`${seq}|${s.current}|${commit.parents.join(',')}`)}`
    if (s.byId[commit.id]) return false
    if (commit.type && !TYPES.includes(commit.type)) return false
    commit.type = commit.type || 'NORMAL'
    s.byId[commit.id] = commit
    s.model.commits.push(commit)
    s.branches[s.current].head = commit.id
    return true
  }

  var upper = (type) => type && type.toUpperCase()

  var doCommit = (s, found) => {
    var a = attrs(found[1])
    var parent = s.branches[s.current].head
    return addCommit(s, {id: a.id, tag: a.tag || '', type: upper(a.type), msg: a.msg || '', parents: parent ? [parent] : []})
  }

  var doBranch = (s, found) => {
    var name = unquote(found[1])
    if (s.branches[name]) return false
    var order = attrs(found[2]).order
    addBranch(s, name, order !== undefined ? parseFloat(order) : undefined, s.branches[s.current].head)
    s.current = name
    return true
  }

  var doCheckout = (s, found) => {
    var to = unquote(found[1])
    if (!s.branches[to]) return false
    s.current = to
    return true
  }

  var doMerge = (s, found) => {
    var from = unquote(found[1])
    var ma = attrs(found[2])
    if (!s.branches[from] || from === s.current) return false
    var ours = s.branches[s.current].head
    var theirs = s.branches[from].head
    if (!ours || !theirs || ours === theirs) return false
    return addCommit(s, {id: ma.id, tag: ma.tag || '', type: upper(ma.type), merge: from, parents: [ours, theirs]})
  }

  var doCherryPick = (s, found) => {
    var ca = attrs(found[1])
    var picked = s.byId[ca.id]
    var base = s.branches[s.current].head
    if (!picked || picked.branch === s.current || !base) return false
    return addCommit(s, {tag: ca.tag || '', cherry: picked.id, parents: [base]})
  }

  var COMMANDS = [
    [/^commit\b(.*)$/i, doCommit],
    [/^branch\s+("[^"]+"|[^\s"]+)(.*)$/i, doBranch],
    [/^(?:checkout|switch)\s+("[^"]+"|[^\s"]+)\s*$/i, doCheckout],
    [/^merge\s+("[^"]+"|[^\s"]+)(.*)$/i, doMerge],
    [/^cherry-pick\b(.*)$/i, doCherryPick],
  ]

  var runCommand = (s, line) => {
    for (var [re, run] of COMMANDS) {
      var found = re.exec(line)
      if (found) return run(s, found)
    }
    return false
  }

  // the `gitGraph` line, with its optional direction. BT is left to mermaid
  var doHeader = (s, line) => {
    var start = /^gitGraph(?:\s+(LR|TB|BT))?\s*:?\s*$/i.exec(line)
    if (!start) return false
    s.model.dir = (start[1] || 'LR').toUpperCase()
    s.head = s.model.dir !== 'BT'
    return s.head
  }

  // one source line into the parser state, false when mermaid has to draw it
  var parseLine = (s, line) => {
    if (!s.head) return doHeader(s, line)
    if (s.skip) {
      s.skip = !line.includes('}')
      return true
    }
    if (/^acc(Title|Descr)\b/.test(line)) {
      s.skip = /\{\s*$/.test(line)
      return true
    }
    return runCommand(s, line)
  }

  var parse = (src) => {
    var front = frontMatter(src.replace(/\r/g, ''))
    if (!front) return null
    var lines = draw.lines(front.text)
    if (!lines) return null
    var s = {model: {title: front.title, dir: 'LR', branches: [], commits: []}, branches: {}, byId: {}, current: 'main', head: false, skip: false}
    addBranch(s, 'main', undefined, null)
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/%%.*$/, '').trim()
      if (line && !parseLine(s, line)) return null
    }
    return s.head && s.model.commits.length ? s.model : null
  }

  var {esc, num, grid, measure, fit} = draw

  // an orthogonal polyline with every corner rounded at r=8, less where a leg is too short for it
  var rounded = (points) => {
    var d = `M${num(points[0].x)},${num(points[0].y)}`
    for (var i = 1; i < points.length - 1; i++) {
      var a = points[i - 1]
      var p = points[i]
      var b = points[i + 1]
      var r = Math.min(8, Math.hypot(p.x - a.x, p.y - a.y) / 2, Math.hypot(b.x - p.x, b.y - p.y) / 2)
      var inX = Math.sign(p.x - a.x)
      var inY = Math.sign(p.y - a.y)
      var outX = Math.sign(b.x - p.x)
      var outY = Math.sign(b.y - p.y)
      d += `L${num(p.x - inX * r)},${num(p.y - inY * r)}Q${num(p.x)},${num(p.y)} ${num(p.x + outX * r)},${num(p.y + outY * r)}`
    }
    var last = points[points.length - 1]
    return d + `L${num(last.x)},${num(last.y)}`
  }


  var MARGIN = 32
  var TAB = 20
  var STEP = 40
  var ROW = 32
  var CHIP = 16
  var LABEL = 112
  var BELOW = 24

  // a branch never wears the accent, in the dark skin one of the series colours is the accent itself
  var branchPalette = (t) => {
    var series = t.series || [t.muted]
    var accent = String(t.accent).toLowerCase()
    var colors = [series[1], series[0], series[2], series[3], series[4]].filter((c) => c && c.toLowerCase() !== accent)
    return colors.length ? colors : [t.muted]
  }

  var orderOf = (b) => b.order !== undefined ? b.order : b.index

  // lanes: explicit order first, then the order branches were made in, main keeps the top
  var makeLanes = (model, t) => {
    var palette = branchPalette(t)
    var lanes = model.branches.slice().sort((a, b) => orderOf(a) - orderOf(b) || a.index - b.index)
    var lane = {}
    lanes.forEach((b, i) => {
      lane[b.name] = i
      b.color = b.name === 'main' ? t.ink : palette[(b.index - 1 + palette.length) % palette.length]
    })
    return {lanes, lane}
  }

  // the key the dom and the metadata use: an id may hold any character, two that clean to one key get a suffix
  var uniqueKey = (keys, id) => {
    var base = id.replace(/[^\w-]/g, '_')
    var key = base
    for (var n = 2; keys[key]; n++) key = `${base}_${n}`
    keys[key] = true
    return key
  }

  var prepareCommits = (model, lanes, lane) => {
    var byId = {}
    var keys = {}
    model.commits.forEach((c) => {
      byId[c.id] = c
      c.key = uniqueKey(keys, c.id)
      c.lane = lane[c.branch]
      c.color = lanes[c.lane].color
      // cross-lane segments leaving each side of the dot, -1 toward the lane before, +1 toward the next. Several on
      // one side fan out 12px apart so no two share a stroke
      c.cross = {'-1': 0, 1: 0}
      c.label = c.cherry ? `pick ${c.cherry}` : c.id
    })
    return byId
  }

  // the first parent on another lane is a branch-off, a second parent a merge, a pick a dashed link
  var parentLinks = (c, byId, t) => {
    var out = []
    var first = c.parents[0] && byId[c.parents[0]]
    if (first) {
      var off = first.lane !== c.lane
      var side = Math.sign(c.lane - first.lane)
      out.push({kind: off ? 'branch' : 'line', from: first, to: c, color: c.color, fan: off ? first.cross[side] * 12 : 0})
      if (off) first.cross[side]++
    }
    var other = c.parents[1] && byId[c.parents[1]]
    if (other) {
      out.push({kind: 'merge', from: other, to: c, color: other.color})
      c.cross[Math.sign(other.lane - c.lane)]++
    }
    if (c.cherry) {
      var pick = byId[c.cherry]
      out.push({kind: 'cherry', from: pick, to: c, color: t.muted})
      c.cross[Math.sign(pick.lane - c.lane)]++
    }
    return out
  }

  var buildLinks = (model, byId, t) => {
    var links = []
    model.commits.forEach((c) => links.push(...parentLinks(c, byId, t)))
    return links
  }

  var measureCommits = (model, mono) => {
    model.commits.forEach((c) => {
      c.text = fit(c.label, LABEL, 8, mono, 400, 0.48)
      c.w = measure(c.text, 8, mono, 400, 0.48)
      c.chip = c.tag ? fit(c.tag, LABEL, 8, mono, 500, 0.48) : ''
      c.chipW = c.tag ? grid(measure(c.chip, 8, mono, 500, 0.48) + 12) : 0
    })
  }

  // the links that cross lanes into a commit
  var crossing = (links, c) => links.filter((l) => l.to === c && l.kind !== 'line')

  var laneRange = (l, c) => ({lo: Math.min(l.from.lane, c.lane), hi: Math.max(l.from.lane, c.lane)})

  // the left edge of an id relative to its dot: beside the line when a branch leaves downward, else centred
  var idLeft = (c) => c.cross[1] ? 8 + (c.cross[1] - 1) * 12 : -c.w / 2

  // the furthest right any lane a link crosses has been taken
  var crossedNeed = (l, c, lastRight) => {
    var range = laneRange(l, c)
    var need = -Infinity
    for (var k = range.lo; k <= range.hi; k++) if (k !== c.lane) need = Math.max(need, lastRight[k] + 8)
    return need
  }

  // a branch-off down from a parent and a merge up into a commit stand in the lanes they cross
  var markCrossed = (l, c, st) => {
    var at = l.kind === 'branch' ? st.pos[l.from.id].x + l.fan : st.x
    var range = laneRange(l, c)
    for (var k = range.lo + 1; k < range.hi; k++) st.lastRight[k] = Math.max(st.lastRight[k], at)
    if (l.kind === 'branch') st.lastRight[c.lane] = Math.max(st.lastRight[c.lane], at)
  }

  // each commit moves right until its id clears the last label on its lane and on any lane a merge or pick would
  // cross at its x
  var placeCommit = (c, s, st, links) => {
    var shifted = c.cross[1]
    var left = idLeft(c)
    var spans = crossing(links, c)
    var need = Math.max(s ? st.x + STEP : st.start, st.lastRight[c.lane] + 8 - left)
    spans.forEach((l) => {
      need = Math.max(need, crossedNeed(l, c, st.lastRight))
    })
    st.x = grid(need)
    st.pos[c.id] = {x: st.x}
    c.left = st.x + left
    c.right = st.x + (shifted ? left + c.w : c.w / 2)
    st.lastRight[c.lane] = Math.max(st.lastRight[c.lane], c.right)
    spans.forEach((l) => markCrossed(l, c, st))
  }

  var placeColumns = (model, lanes, links, tabW) => {
    var start = MARGIN + Math.max(...tabW) + 24
    var st = {start, x: 0, pos: {}, lastRight: lanes.map(() => start - 16)}
    model.commits.forEach((c, s) => placeCommit(c, s, st, links))
    return st.pos
  }

  // where a tag chip starts, left of the dot unless a branch arrives from above on that side
  var chipLeft = (c, cx) => c.cross[-1] ? cx + 8 + (c.cross[-1] - 1) * 12 : cx - c.chipW / 2

  var chipClash = (p, k, x1, w) => p.k === k && x1 < p.x2 + 6 && x1 + w > p.x1 - 6

  // tags sit above their commit and stack a level up when the chip before them on the lane is in the way
  var stackTags = (model, lanes, pos) => {
    var levels = lanes.map(() => [])
    model.commits.filter((c) => c.tag).forEach((c) => {
      var x1 = chipLeft(c, pos[c.id].x)
      var placed = levels[c.lane]
      var k = 0
      while (placed.some((p) => chipClash(p, k, x1, c.chipW))) k++
      placed.push({k, x1, x2: x1 + c.chipW})
      c.chipX = x1
      c.level = k
    })
    return levels
  }

  var laneRows = (lanes, levels, top) => {
    var above = lanes.map((b, i) => Math.max(12, ...levels[i].map((p) => 30 + p.k * 20)))
    var laneAt = []
    var y = top
    lanes.forEach((b, i) => {
      y = i ? Math.max(y + BELOW + above[i] + 16, laneAt[i - 1] + 56) : top + Math.max(above[0], TAB / 2)
      laneAt[i] = grid(y)
      y = laneAt[i]
    })
    return laneAt
  }

  // left to right
  var layoutLR = (model, lanes, links, tabW, top) => {
    var pos = placeColumns(model, lanes, links, tabW)
    var laneAt = laneRows(lanes, stackTags(model, lanes, pos), top)
    model.commits.forEach((c) => {
      pos[c.id].y = laneAt[c.lane]
    })
    var right = Math.max(...model.commits.map((c) => Math.max(c.right, c.chipX !== undefined ? c.chipX + c.chipW : 0, pos[c.id].x + 8)))
    return {pos, laneAt, right, bottom: laneAt[lanes.length - 1] + BELOW}
  }

  // lanes as columns as wide as the ids on their right and the tags on their left
  var laneColumns = (model, lanes, tabW) => {
    var rightW = lanes.map(() => 12)
    var leftW = lanes.map(() => 12)
    model.commits.forEach((c) => {
      rightW[c.lane] = Math.max(rightW[c.lane], 10 + c.w)
      if (c.tag) leftW[c.lane] = Math.max(leftW[c.lane], 10 + c.chipW)
    })
    var laneAt = []
    lanes.forEach((b, i) => {
      var x = i
        ? laneAt[i - 1] + Math.max(rightW[i - 1] + leftW[i] + 24, tabW[i - 1] / 2 + tabW[i] / 2 + 16, 56)
        : MARGIN + Math.max(leftW[0], tabW[0] / 2)
      laneAt[i] = grid(x)
    })
    return {laneAt, rightW}
  }

  // top to bottom: a row per commit
  var layoutTB = (model, lanes, tabW, top) => {
    var y0 = top + TAB + 28
    var cols = laneColumns(model, lanes, tabW)
    var pos = {}
    model.commits.forEach((c, s) => {
      pos[c.id] = {x: cols.laneAt[c.lane], y: y0 + s * ROW}
    })
    var last = lanes.length - 1
    return {
      pos,
      laneAt: cols.laneAt,
      right: cols.laneAt[last] + Math.max(cols.rightW[last], tabW[last] / 2),
      bottom: y0 + (model.commits.length - 1) * ROW + 24
    }
  }

  // a tab with the branch colour on its edge, then a dotted hairline the length of the graph
  var laneMarkup = (b, i, g) => {
    var {t, lr, laneAt, width, height} = g
    var w = g.tabW[i]
    var tx = lr ? MARGIN : laneAt[i] - w / 2
    var ty = lr ? laneAt[i] - TAB / 2 : g.top
    var hairline = lr
      ? `M${tx + w + 8},${laneAt[i]}H${num(width - MARGIN)}`
      : `M${laneAt[i]},${ty + TAB + 8}V${num(height - MARGIN)}`
    return [`<g class="git-branch" data-branch="${esc(b.name)}">`,
      `<path d="${hairline}" stroke="${t.ruleSolid}" stroke-dasharray="2 4"/>`,
      `<rect x="${num(tx)}" y="${ty}" width="${w}" height="${TAB}" rx="2" fill="${t.paper2 || t.paper}" stroke="${t.ruleSolid}"/>`,
      `<rect x="${num(tx + 1)}" y="${ty + 1}" width="2" height="${TAB - 2}" fill="${b.color}"/>`,
      `<text x="${num(tx + 12)}" y="${ty + TAB / 2}" dominant-baseline="central" font-family="${g.fonts.mono}" font-size="9" font-weight="600" fill="${t.ink}">${esc(b.name)}</text>`,
      '</g>']
  }

  // the corners of a branch-off, fanned out at the parent when several leave the same side
  var branchPoints = (a, b, o, lr) => {
    if (lr) return o ? [a, {x: a.x + o, y: a.y}, {x: a.x + o, y: b.y}, b] : [a, {x: a.x, y: b.y}, b]
    return o ? [a, {x: a.x, y: a.y + o}, {x: b.x, y: a.y + o}, b] : [a, {x: b.x, y: a.y}, b]
  }

  // a branch-off crosses lanes at the parent then runs along its own lane, a merge or a pick runs along the lane it
  // comes from and crosses at the commit it lands on
  var linkPath = (l, a, b, lr) => {
    if (l.kind === 'line') return `M${num(a.x)},${num(a.y)}L${num(b.x)},${num(b.y)}`
    if (l.kind === 'branch') return rounded(branchPoints(a, b, l.fan, lr))
    return rounded(lr ? [a, {x: b.x, y: a.y}, b] : [a, {x: a.x, y: b.y}, b])
  }

  var linkMarkup = (l, k, g) => {
    var d = linkPath(l, g.pos[l.from.id], g.pos[l.to.id], g.lr)
    var cherry = l.kind === 'cherry'
    return {cherry, svg: `<path class="git-line relationshipLine" id="${g.id}-L-${k}" data-from="${l.from.key}" data-to="${l.to.key}" data-kind="${l.kind}" ` +
      `d="${d}" fill="none" stroke="${l.color}" stroke-width="${cherry ? 1 : 2}"${cherry ? ' stroke-dasharray="4 3"' : ''} stroke-linecap="round"/>`}
  }

  // picks under everything, then the branch lines, the dashed links stay readable where a lane line covers them
  var linkLines = (links, g) => {
    var lines = links.map((l, k) => linkMarkup(l, k, g))
    return [...lines.filter((l) => l.cherry), ...lines.filter((l) => !l.cherry)].map((l) => l.svg)
  }

  // the dot of a commit: a square for a highlight, a ring for a merge, a disc otherwise
  var commitDot = (c, p, t) => {
    if (c.type === 'HIGHLIGHT') {
      return [`<rect x="${p.x - 6}" y="${p.y - 6}" width="12" height="12" rx="2" fill="${t.paper}"/>`,
        `<rect x="${p.x - 6}" y="${p.y - 6}" width="12" height="12" rx="2" fill="${t.accentTint}" stroke="${t.accent}" stroke-width="1.5"/>`]
    }
    if (c.merge) return [`<circle cx="${p.x}" cy="${p.y}" r="5" fill="${t.paper}" stroke="${c.color}" stroke-width="2"/>`]
    var dot = [`<circle cx="${p.x}" cy="${p.y}" r="6" fill="${c.color}" stroke="${t.paper}" stroke-width="2"/>`]
    if (c.type === 'REVERSE') {
      dot.push(`<path d="M${p.x - 2.5},${p.y - 2.5}l5,5M${p.x + 2.5},${p.y - 2.5}l-5,5" stroke="${t.paper}" stroke-width="1.5" stroke-linecap="round"/>`)
    }
    return dot
  }

  // the id: under the dot (beside the line when a branch leaves downward), right of it top to bottom
  var commitId = (c, p, g) => {
    var t = g.t
    var lx = g.lr ? p.x + idLeft(c) : p.x + 10
    var ly = g.lr ? p.y + 18 : (c.cross[1] ? p.y + 17 + (c.cross[1] - 1) * 12 : p.y + 3)
    return [`<rect x="${num(lx - 2)}" y="${num(ly - 8)}" width="${num(c.w + 4)}" height="11" fill="${t.paper}"/>`,
      `<text x="${num(lx)}" y="${num(ly)}" text-anchor="start" font-family="${g.fonts.mono}" font-size="8" letter-spacing="0.48" fill="${t.muted}">${esc(c.text)}</text>`]
  }

  // the tag chip: above the dot left to right, left of it top to bottom
  var commitChip = (c, p, g) => {
    var t = g.t
    var cx = g.lr ? c.chipX : p.x - 10 - c.chipW
    var cy = g.lr ? p.y - 28 - c.level * 20 : (c.cross[-1] ? p.y + 6 + (c.cross[-1] - 1) * 12 : p.y - CHIP / 2)
    return [`<rect x="${num(cx)}" y="${num(cy)}" width="${c.chipW}" height="${CHIP}" rx="2" fill="${t.paper}"/>`,
      `<rect class="git-tag" x="${num(cx)}" y="${num(cy)}" width="${c.chipW}" height="${CHIP}" rx="2" fill="${t.accentTint}" stroke="${t.accent}" stroke-opacity="0.6"/>`,
      `<text x="${num(cx + c.chipW / 2)}" y="${num(cy + CHIP / 2)}" text-anchor="middle" dominant-baseline="central" font-family="${g.fonts.mono}" font-size="8" font-weight="500" letter-spacing="0.48" fill="${t.accentText}">${esc(c.chip)}</text>`]
  }

  var commitMarkup = (c, g) => {
    var p = g.pos[c.id]
    var parts = [`<g class="node git-commit" id="${g.id}-git-${c.key}-0">`, ...commitDot(c, p, g.t), ...commitId(c, p, g)]
    if (c.tag) parts.push(...commitChip(c, p, g))
    parts.push('</g>')
    return parts.join('')
  }

  var summarize = (model, lanes) => {
    var merges = model.commits.filter((c) => c.merge).length
    var tags = model.commits.filter((c) => c.tag).map((c) => c.tag)
    return `${model.title || 'Git graph'}: ${model.commits.length} commits on ${lanes.length} branches` +
      (merges ? `, ${merges} merge${merges > 1 ? 's' : ''}` : '') + (tags.length ? `, tagged ${tags.join(', ')}` : '')
  }

  var metadata = (model, lanes) => {
    var info = {
      dir: model.dir,
      branches: lanes.map((b) => b.name),
      nodes: {}
    }
    model.commits.forEach((c, i) => {
      info.nodes[c.key] = {
        name: c.id, branch: c.branch, n: i + 1, type: c.type, tag: c.tag, parents: c.parents,
        merge: c.merge || '', cherry: c.cherry || ''
      }
    })
    return info
  }

  // git graph source -> svg markup, or '' when mermaid should draw it. t: the style tokens of mermaid.js
  var render = (src, t, fonts, id) => {
    var model = parse(src)
    if (!model) return ''
    var {lanes, lane} = makeLanes(model, t)
    var byId = prepareCommits(model, lanes, lane)
    var links = buildLinks(model, byId, t)
    var tabW = lanes.map((b) => grid(measure(b.name, 9, fonts.mono, 600) + 20))
    measureCommits(model, fonts.mono)

    var body = []
    var top = MARGIN
    if (model.title) {
      body.push(`<text x="${MARGIN}" y="${top + 14}" font-family="${fonts.sans}" font-size="16" font-weight="600" fill="${t.ink}">${esc(model.title)}</text>`)
      top += 40
    }
    var lr = model.dir === 'LR'
    var layout = lr ? layoutLR(model, lanes, links, tabW, top) : layoutTB(model, lanes, tabW, top)
    var width = grid(Math.max(layout.right + MARGIN, 320))
    var height = grid(layout.bottom + MARGIN)
    var g = {t, fonts, id, lr, tabW, top, width, height, pos: layout.pos, laneAt: layout.laneAt}

    lanes.forEach((b, i) => body.push(...laneMarkup(b, i, g)))
    body.push(...linkLines(links, g))
    var marks = model.commits.map((c) => commitMarkup(c, g))

    return [`<svg xmlns="http://www.w3.org/2000/svg" id="${id}" width="100%" style="max-width: ${width}px;" viewBox="0 0 ${width} ${height}" ` +
      `role="graphics-document document" aria-roledescription="gitGraph" font-family="${esc(fonts.sans)}">`,
      `<title>${esc(model.title || 'Git graph')}</title><desc>${esc(summarize(model, lanes))}</desc>`,
      body.join(''), marks.join(''),
      `<metadata class="gitgraph-model">${esc(JSON.stringify(metadata(model, lanes)))}</metadata>`, '</svg>'].join('')
  }

  return {parse, render}
})()
