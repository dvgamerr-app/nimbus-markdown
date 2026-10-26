// Mermaid C4 diagrams drawn to the diagram-design architecture type: hairline boxes with a type tag, dashed boundary
// zones, orthogonal connectors routed around the boxes with masked labels beside them, the system in scope takes the
// accent. Syntax that is not understood falls back to mermaid itself, see render()
var c4 = (() => {
  var KINDS = ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment']

  // macro -> what it draws; the arguments after the alias, in mermaid's order
  var SHAPES = {}
  ;[['Person', 'person', ['label', 'descr']],
    ['System', 'system', ['label', 'descr']], ['SystemDb', 'system', ['label', 'descr'], 'db'], ['SystemQueue', 'system', ['label', 'descr'], 'queue'],
    ['Container', 'container', ['label', 'techn', 'descr']], ['ContainerDb', 'container', ['label', 'techn', 'descr'], 'db'],
    ['ContainerQueue', 'container', ['label', 'techn', 'descr'], 'queue'],
    ['Component', 'component', ['label', 'techn', 'descr']], ['ComponentDb', 'component', ['label', 'techn', 'descr'], 'db'],
    ['ComponentQueue', 'component', ['label', 'techn', 'descr'], 'queue']
  ].forEach(([name, kind, args, store]) => {
    SHAPES[name] = {kind, args, store: store || '', ext: false}
    SHAPES[name + '_Ext'] = {kind, args, store: store || '', ext: true}
  })
  var BOUNDARIES = {
    Boundary: {type: '', args: ['label', 'type']},
    Enterprise_Boundary: {type: 'enterprise', args: ['label']},
    System_Boundary: {type: 'system', args: ['label']},
    Container_Boundary: {type: 'container', args: ['label']},
    Deployment_Node: {type: '', args: ['label', 'type', 'descr'], node: true},
    Node: {type: '', args: ['label', 'type', 'descr'], node: true},
    Node_L: {type: '', args: ['label', 'type', 'descr'], node: true},
    Node_R: {type: '', args: ['label', 'type', 'descr'], node: true}
  }
  var RELS = {
    Rel: '', BiRel: 'bi', Rel_Back: 'back', Rel_Neighbor: '',
    Rel_U: 'up', Rel_Up: 'up', Rel_D: 'down', Rel_Down: 'down', Rel_L: 'left', Rel_Left: 'left', Rel_R: 'right', Rel_Right: 'right'
  }

  // `a, "b, c", $x="y"` -> {list: ['a', 'b, c'], named: {x: 'y'}}
  var args = (s) => {
    var list = []
    var named = {}
    var cur = ''
    var quoted = false
    var push = () => {
      var v = cur.trim()
      cur = ''
      var found = /^\$(\w+)\s*=\s*([\s\S]*)$/.exec(v)
      if (found) named[found[1]] = unquote(found[2].trim())
      else list.push(unquote(v))
    }
    for (var i = 0; i < s.length; i++) {
      var c = s[i]
      if (c === '"') quoted = !quoted
      if (c === ',' && !quoted) push()
      else cur += c
    }
    if (cur.trim() || list.length) push()
    return {list, named}
  }
  var unquote = (v) => (/^"[\s\S]*"$/.test(v) ? v.slice(1, -1) : v).trim()

  // the macros of a declaration line `Name(args)`, each gets {st, name, a, parent, found}: the parse state, the macro
  // name, its arguments, the open boundary and the regexp match (groups 3 and 4 are a trailing `{` and `}`)
  var addShape = ({st, name, a, parent}) => {
    var spec = SHAPES[name]
    var el = {alias: a.list[0], kind: spec.kind, store: spec.store, ext: spec.ext, label: '', techn: '', descr: '', type: 'element'}
    spec.args.forEach((key, j) => (el[key] = a.list[j + 1] || a.named[key] || ''))
    if (!el.alias) return
    st.model.elements.push(el)
    parent.children.push(el)
  }
  var addBoundary = ({st, name, a, parent, found}) => {
    var b = BOUNDARIES[name]
    var box = {alias: a.list[0], label: '', type: 'boundary', kind: b.type, node: !!b.node, descr: '', children: []}
    b.args.forEach((key, j) => {
      var v = a.list[j + 1] || a.named[key] || ''
      if (key === 'type') box.kind = v || box.kind
      else box[key] = v
    })
    parent.children.push(box)
    // `Name(...) {` opens it at once, a bare `Name(...)` waits for a `{` line, `Name(...) {}` is empty
    if (found[3] && !found[4]) st.stack.push(box)
    else if (!found[3]) st.pending = box
  }
  var addRelIndex = ({st, a}) => {
    st.model.rels.push({index: a.list[0], from: a.list[1], to: a.list[2], label: a.list[3] || '', techn: a.list[4] || a.named.techn || '', dir: ''})
  }
  var addRel = ({st, name, a}) => {
    var dir = RELS[name]
    var rel = {from: a.list[0], to: a.list[1], label: a.list[2] || '', techn: a.list[3] || a.named.techn || '', dir: dir === 'back' || dir === 'bi' ? '' : dir, bi: dir === 'bi'}
    if (dir === 'back') rel = Object.assign(rel, {from: rel.to, to: rel.from})
    st.model.rels.push(rel)
  }
  var joins = (r, from, to) => r.from === from && r.to === to || r.bi && r.from === to && r.to === from
  var restyleRel = ({st, a}) => {
    st.model.rels.filter((r) => joins(r, a.list[0], a.list[1])).forEach((r) => {
      if (a.named.lineColor) r.lineColor = a.named.lineColor
      if (a.named.textColor) r.textColor = a.named.textColor
    })
  }
  var layoutConfig = ({st, a}) => {
    var rows = parseInt(a.named.c4ShapeInRow, 10)
    var boxes = parseInt(a.named.c4BoundaryInRow, 10)
    if (rows > 0) st.model.shapeInRow = rows
    if (boxes > 0) st.model.boundaryInRow = boxes
  }
  var COMMANDS = {RelIndex: addRelIndex, UpdateRelStyle: restyleRel, UpdateLayoutConfig: layoutConfig}
  var macroFor = (name) => (SHAPES[name] ? addShape : BOUNDARIES[name] ? addBoundary : name in RELS ? addRel : COMMANDS[name])

  var declare = (st, line) => {
    var found = /^(\w+)\s*\(([\s\S]*)\)\s*(\{)?\s*(\})?$/.exec(line)
    if (!found) return
    st.pending = null
    var macro = macroFor(found[1])
    if (macro) macro({st, name: found[1], a: args(found[2]), parent: st.stack[st.stack.length - 1], found})
  }
  var openBlock = (st) => {
    if (st.pending) st.stack.push(st.pending)
    st.pending = null
  }
  // a line may close one boundary or more
  var closeBlocks = (st, line) => {
    for (var k = 0; k < line.length && st.stack.length > 1; k++) st.stack.pop()
    st.pending = null
  }
  // one line after the diagram kind: the accessibility blocks are skipped, the structure lines and the macros read
  var feed = (st, line) => {
    var title = /^title\s+(.*)$/i.exec(line)
    if (st.skip) st.skip = !line.includes('}')
    else if (/^acc(Title|Descr)\b/.test(line)) st.skip = /\{\s*$/.test(line)
    else if (title) st.model.title = title[1].trim()
    else if (line === '{') openBlock(st)
    else if (/^\}+$/.test(line)) closeBlocks(st, line)
    else declare(st, line)
  }

  var parse = (src) => {
    var lines = draw.lines(src)
    if (!lines) return null
    var model = {kind: '', title: '', root: {children: []}, elements: [], rels: [], shapeInRow: 4, boundaryInRow: 2}
    var st = {model, stack: [model.root], pending: null, skip: false}
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/%%.*$/, '').trim()
      if (!line) continue
      if (model.kind) feed(st, line)
      else if (KINDS.includes(line)) model.kind = line
      else return null
    }
    return model.kind && model.elements.length ? model : null
  }

  var {esc, num, grid, measure, wrap} = draw

  // a polyline with rounded corners
  var round = (points, radius) => {
    var pts = points.filter((pt, i) => !i || pt[0] !== points[i - 1][0] || pt[1] !== points[i - 1][1])
    var d = `M${num(pts[0][0])},${num(pts[0][1])}`
    for (var i = 1; i < pts.length - 1; i++) {
      var prev = pts[i - 1]
      var cur = pts[i]
      var next = pts[i + 1]
      var l1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1])
      var l2 = Math.hypot(next[0] - cur[0], next[1] - cur[1])
      var r = Math.min(radius, l1 / 2, l2 / 2)
      d += `L${num(cur[0] + (prev[0] - cur[0]) * r / l1)},${num(cur[1] + (prev[1] - cur[1]) * r / l1)}` +
        `Q${num(cur[0])},${num(cur[1])} ${num(cur[0] + (next[0] - cur[0]) * r / l2)},${num(cur[1] + (next[1] - cur[1]) * r / l2)}`
    }
    return d + `L${num(pts[pts.length - 1][0])},${num(pts[pts.length - 1][1])}`
  }

  // the box metrics, in svg units, all on the 4px grid
  var MARGIN = 32
  var W = 200
  var GX = 128
  var GY = 104
  var PAD = 24
  var HEAD = 56
  var CLEAR = 12
  var STUB = 20

  var intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

  // orthogonal routing on the sparse grid of interesting coordinates: box edges pushed out by the clearance, the
  // middle of every gap and a lane either side of it. Dijkstra over (point, heading) with a price on every bend,
  // on running along a line already drawn and on crossing one
  var clearOf = (b) => (b.clear === undefined ? CLEAR : b.clear)

  var blocked = (boxes, x1, y1, x2, y2) => boxes.some((b) => {
    var c = clearOf(b)
    var r = {x: b.x - c, y: b.y - c, w: b.w + 2 * c, h: b.h + 2 * c}
    if (y1 === y2) return y1 > r.y && y1 < r.y + r.h && Math.max(x1, x2) > r.x && Math.min(x1, x2) < r.x + r.w
    return x1 > r.x && x1 < r.x + r.w && Math.max(y1, y2) > r.y && Math.min(y1, y2) < r.y + r.h
  })

  var axis = (edges, extra) => {
    var vals = new Set(extra)
    var sorted = [...new Set(edges)].sort((a, b) => a - b)
    sorted.forEach((v) => vals.add(v))
    for (var i = 1; i < sorted.length; i++) {
      var gap = sorted[i] - sorted[i - 1]
      if (gap < 8) continue
      var mid = (sorted[i] + sorted[i - 1]) / 2
      vals.add(mid)
      if (gap >= 40) [-16, 16].forEach((d) => vals.add(mid + d))
    }
    return [...vals].sort((a, b) => a - b)
  }

  // how far the runs a1..a2 and b1..b2 lie along one another
  var overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)))
  var between = (v, a, b) => v > Math.min(a, b) && v < Math.max(a, b)
  // what a step costs beyond its length: overlapping or crossing the segment s of a line routed before
  var stepPenalty = (x1, y1, x2, y2, s) => {
    if (y1 === y2 && s[1] === s[3]) return Math.abs(s[1] - y1) < 6 ? overlap(x1, x2, s[0], s[2]) * 6 : 0
    if (x1 === x2 && s[0] === s[2]) return Math.abs(s[0] - x1) < 6 ? overlap(y1, y2, s[1], s[3]) * 6 : 0
    if (y1 === y2) return between(s[0], x1, x2) && between(y1, s[1], s[3]) ? 24 : 0
    return between(s[1], y1, y2) && between(x1, s[0], s[2]) ? 24 : 0
  }
  var penalty = (used, x1, y1, x2, y2) => used.reduce((p, s) => p + stepPenalty(x1, y1, x2, y2, s), 0)

  var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]
  // the cost of arriving at the target heading d when the port wants dir: straight in, a bend, or straight through it
  var finishCost = (d, dir) => (d === dir ? 0 : (d + 2) % 4 === dir ? 1e6 : 40)

  // a binary min-heap of [cost, key]
  var createHeap = () => {
    var heap = []
    var swap = (a, b) => {
      var tmp = heap[a]
      heap[a] = heap[b]
      heap[b] = tmp
    }
    var smallest = (n) => {
      var l = 2 * n + 1
      var r = l + 1
      var m = n
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r
      return m
    }
    var push = (c, k) => {
      heap.push([c, k])
      for (var n = heap.length - 1; n > 0;) {
        var p = (n - 1) >> 1
        if (heap[p][0] <= heap[n][0]) break
        swap(p, n)
        n = p
      }
    }
    var pop = () => {
      var top = heap[0]
      var last = heap.pop()
      if (heap.length) {
        heap[0] = last
        for (var n = 0; ;) {
          var m = smallest(n)
          if (m === n) break
          swap(m, n)
          n = m
        }
      }
      return top
    }
    return {push, pop, size: () => heap.length}
  }

  // a state key packs the cell of the grid and the heading into one number
  var keyOf = (s, i, j, d) => (j * s.xs.length + i) * 4 + d
  var decode = (s, k) => {
    var d = k % 4
    var cell = (k - d) / 4
    var i = cell % s.xs.length
    return {d, i, j: (cell - i) / s.xs.length}
  }
  var inGrid = (s, i, j) => i >= 0 && j >= 0 && i < s.xs.length && j < s.ys.length

  // one step from state k (cost c) heading nd, never straight back, never through a box
  var relax = (s, c, k, nd) => {
    var {d, i, j} = decode(s, k)
    var ni = i + DIRS[nd][0]
    var nj = j + DIRS[nd][1]
    if ((nd + 2) % 4 === d || !inGrid(s, ni, nj)) return
    var x1 = s.xs[i]
    var y1 = s.ys[j]
    var x2 = s.xs[ni]
    var y2 = s.ys[nj]
    if (blocked(s.boxes, x1, y1, x2, y2)) return
    var nc = c + Math.abs(x2 - x1) + Math.abs(y2 - y1) + (nd === d ? 0 : 40) + penalty(s.used, x1, y1, x2, y2)
    var nk = keyOf(s, ni, nj, nd)
    if (!s.dist.has(nk) || nc < s.dist.get(nk)) {
      s.dist.set(nk, nc)
      s.prev.set(nk, k)
      s.heap.push(nc, nk)
    }
  }

  // Dijkstra until the target cell is reached with the cheapest finish, {c, k} or null
  var search = (s, target, dir) => {
    var best = null
    while (s.heap.size()) {
      var [c, k] = s.heap.pop()
      if (c > s.dist.get(k)) continue
      var at = decode(s, k)
      if (at.i === target.i && at.j === target.j) {
        var finish = c + finishCost(at.d, dir)
        if (!best || finish < best.c) best = {c: finish, k}
        continue
      }
      if (best && c > best.c) break
      DIRS.forEach((_, nd) => relax(s, c, k, nd))
    }
    return best
  }

  var tracePath = (s, last) => {
    var pts = []
    for (var at = last; at !== undefined; at = s.prev.get(at)) {
      var cl = (at - at % 4) / 4
      var ci = cl % s.xs.length
      pts.unshift([s.xs[ci], s.ys[(cl - ci) / s.xs.length]])
    }
    return pts
  }

  // from and to: {x, y, dir} where dir is the heading leaving the source stub / arriving at the target port
  var routePath = (boxes, used, bounds, from, to) => {
    var edges = (lo, size) => boxes.flatMap((b) => [b[lo] - clearOf(b), b[lo] + b[size] + clearOf(b)])
    var xs = axis(edges('x', 'w'), [from.x, to.x, bounds.x, bounds.x + bounds.w])
    var ys = axis(edges('y', 'h'), [from.y, to.y, bounds.y, bounds.y + bounds.h])
    var s = {boxes, used, xs, ys, dist: new Map(), prev: new Map(), heap: createHeap()}
    var start = keyOf(s, xs.indexOf(from.x), ys.indexOf(from.y), from.dir)
    s.dist.set(start, 0)
    s.heap.push(0, start)
    var best = search(s, {i: xs.indexOf(to.x), j: ys.indexOf(to.y)}, to.dir)
    return best ? tracePath(s, best.k) : null
  }

  var router = (boxes, bounds) => {
    var used = []
    var route = (from, to) => routePath(boxes, used, bounds, from, to)
    var claim = (pts) => {
      for (var i = 1; i < pts.length; i++) used.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]])
    }
    return {route, claim, used}
  }

  // the model, the style tokens and everything the stages of render() hand on to each other
  var contextOf = (model, t, fonts, id) => {
    var byAlias = new Map(model.elements.map((e) => [e.alias, e]))
    var rels = model.rels.filter((r) => byAlias.has(r.from) && byAlias.has(r.to) && r.from !== r.to)
    return {model, t, id, sans: fonts.sans, mono: fonts.mono, byAlias, rels, focal: focalOf(model, rels, byAlias)}
  }

  // the focal: the system in scope of a context diagram, else the busiest element when it alone is the busiest
  var focalOf = (model, rels, byAlias) => {
    var degree = new Map(model.elements.map((e) => [e, 0]))
    rels.forEach((r) => {
      degree.set(byAlias.get(r.from), degree.get(byAlias.get(r.from)) + 1)
      degree.set(byAlias.get(r.to), degree.get(byAlias.get(r.to)) + 1)
    })
    var inner = model.elements.filter((e) => !e.ext && !e.store && e.kind !== 'person')
    var focal = model.kind === 'C4Context' ? inner.find((e) => e.kind === 'system') : null
    if (focal || !inner.length) return focal
    var top = Math.max(...inner.map((e) => degree.get(e)))
    var busiest = inner.filter((e) => degree.get(e) === top)
    return top > 0 && busiest.length === 1 ? busiest[0] : focal
  }

  var STORE_WORDS = {db: 'DATABASE', queue: 'QUEUE'}
  var textHeight = (e) => e.names.length * 15 + (e.techs.length ? 14 : 0) + (e.descrs.length ? 4 + e.descrs.length * 14 : 0)

  // what each box says: a type tag, the name, the technology, the description. Returns the common box height
  var describe = (cx) => {
    var {sans, mono, model} = cx
    model.elements.forEach((e) => {
      e.tag = (e.ext ? 'EXTERNAL ' : '') + (STORE_WORDS[e.store] || e.kind.toUpperCase())
      e.names = wrap(e.label || e.alias, W - 32, 12, sans, 600, 2)
      e.techs = e.techn ? wrap(e.techn, W - 32, 9, mono, 400, 1) : []
      e.descrs = e.descr ? wrap(e.descr, W - 32, 11, sans, 400, 3) : []
      e.top = e.store === 'db' ? 12 : 0
      e.need = e.top + 34 + textHeight(e) + 12
    })
    cx.H = Math.max(80, grid(Math.max(...model.elements.map((e) => e.need))))
  }

  // layout: elements in rows of shapeInRow, child boundaries below them in rows of boundaryInRow
  var captionWidth = (caption, tagText, mono) => measure(caption, 8, mono, 500, 1.12) + (tagText ? 8 + measure(tagText, 8, mono, 400, 0.64) : 0)

  var placeShapes = (cx, shapes) => {
    var {model, H} = cx
    var cols = Math.min(shapes.length, model.shapeInRow)
    shapes.forEach((s, i) => {
      s.dx = (i % model.shapeInRow) * (W + GX)
      s.dy = Math.floor(i / model.shapeInRow) * (H + GY)
    })
    return {w: cols ? cols * W + (cols - 1) * GX : 0, y: shapes.length ? Math.ceil(shapes.length / model.shapeInRow) * (H + GY) - GY : 0}
  }

  var placeSubs = (cx, subs, size) => {
    var {w, y} = size
    for (var i = 0; i < subs.length; i += cx.model.boundaryInRow) {
      var row = subs.slice(i, i + cx.model.boundaryInRow)
      if (y) y += GY
      var x = 0
      row.forEach((b) => {
        b.dx = x
        b.dy = y
        x += b.w + GX
      })
      w = Math.max(w, x - GX)
      y += Math.max(...row.map((b) => b.h))
    }
    return {w, y}
  }

  var placeBox = (cx, box) => {
    var shapes = box.children.filter((c) => c.type === 'element')
    var subs = box.children.filter((c) => c.type === 'boundary')
    subs.forEach((b) => placeBox(cx, b))
    var {w, y} = placeSubs(cx, subs, placeShapes(cx, shapes))
    box.cw = w
    box.ch = y
    if (box === cx.model.root) return
    box.caption = (box.label || box.alias).toUpperCase()
    box.tagText = box.kind ? `[${box.kind.toUpperCase()}]` : ''
    box.w = grid(Math.max(w, captionWidth(box.caption, box.tagText, cx.mono)) + 2 * PAD)
    box.h = grid(y + HEAD + PAD)
  }

  var absolute = (cx, box, x, y) => {
    box.children.forEach((c) => {
      var inset = box === cx.model.root ? [0, 0] : [PAD, HEAD]
      c.x = x + inset[0] + c.dx
      c.y = y + inset[1] + c.dy
      if (c.type === 'element') {
        c.w = W
        c.h = cx.H
      }
      else absolute(cx, c, c.x, c.y)
    })
  }

  var collect = (list, box, depth) => box.children.forEach((c) => {
    if (c.type !== 'boundary') return
    c.depth = depth
    list.push(c)
    collect(list, c, depth + 1)
  })

  var layout = (cx) => {
    var root = cx.model.root
    placeBox(cx, root)
    cx.y0 = MARGIN + (cx.model.title ? 40 : 0)
    absolute(cx, root, MARGIN, cx.y0)
    cx.boundaries = []
    collect(cx.boundaries, root, 0)
    cx.right = MARGIN + root.cw
    cx.bottom = cx.y0 + root.ch
  }

  // ports: the side each line leaves and enters by, from the direction hint or where the other box sits
  var cxOf = (e) => e.x + e.w / 2
  var cyOf = (e) => e.y + e.h / 2
  var DOWN = ['bottom', 'top']
  var UP = ['top', 'bottom']
  var RIGHT = ['right', 'left']
  var LEFT = ['left', 'right']
  // a direction hint is kept only when the grid put the boxes that way round, a hint against it loops around
  var hintSides = (r, dx, dy) => (r.dir === 'down' && dy > 0 ? DOWN
    : r.dir === 'up' && dy < 0 ? UP
      : r.dir === 'right' && dx > 0 ? RIGHT
        : r.dir === 'left' && dx < 0 ? LEFT : null)
  var portSides = (r, dx, dy, H) => {
    var hint = hintSides(r, dx, dy)
    if (hint) return hint
    if (Math.abs(dx) < W) return dy > 0 ? DOWN : UP
    if (Math.abs(dy) < H) return dx > 0 ? RIGHT : LEFT
    // off-axis: leave by the side facing the other column, arrive from above or below
    return [dx > 0 ? 'right' : 'left', dy > 0 ? 'top' : 'bottom']
  }

  var buildLines = (cx) => {
    var sides = new Map()
    var lines = cx.rels.map((r, i) => {
      var a = cx.byAlias.get(r.from)
      var b = cx.byAlias.get(r.to)
      var [s, e] = portSides(r, cxOf(b) - cxOf(a), cyOf(b) - cyOf(a), cx.H)
      var line = {r, i, a, b, s, e}
      ;[[a, s, b], [b, e, a]].forEach(([n, side, other]) => {
        var k = n.alias + '|' + side
        if (!sides.has(k)) sides.set(k, [])
        sides.get(k).push({line, other, end: n === a ? 'from' : 'to'})
      })
      return line
    })
    cx.lines = lines
    return sides
  }

  var portPoint = (n, side, flat, at) => (flat
    ? [n.x + at, side === 'top' ? n.y : n.y + n.h]
    : [side === 'left' ? n.x : n.x + n.w, n.y + at])

  // fan the ports of one side out at L * k / (N + 1), ordered by where the other end lies
  var fanPorts = (cx, sides) => sides.forEach((list, k) => {
    var [alias, side] = k.split('|')
    var n = cx.byAlias.get(alias)
    var flat = side === 'top' || side === 'bottom'
    list.sort((p, q) => (flat ? cxOf(p.other) - cxOf(q.other) : cyOf(p.other) - cyOf(q.other)))
    list.forEach((p, j) => {
      var len = flat ? n.w : n.h
      p.line[p.end] = portPoint(n, side, flat, Math.round(len * (j + 1) / (list.length + 1)))
    })
  })

  var OUT = {right: [1, 0, 0], bottom: [0, 1, 1], left: [-1, 0, 2], top: [0, -1, 3]}
  var onRun = (a, p, b) => a[0] === p[0] && p[0] === b[0] || a[1] === p[1] && p[1] === b[1]
  var reach = (l) => Math.hypot(l.from[0] - l.to[0], l.from[1] - l.to[1])

  var routeLine = (net, l) => {
    var so = OUT[l.s]
    var eo = OUT[l.e]
    var s0 = [l.from[0] + so[0] * STUB, l.from[1] + so[1] * STUB]
    var e0 = [l.to[0] + eo[0] * STUB, l.to[1] + eo[1] * STUB]
    var mid = net.route({x: s0[0], y: s0[1], dir: so[2]}, {x: e0[0], y: e0[1], dir: (eo[2] + 2) % 4})
    // drop the points that sit on a straight run
    l.pts = [l.from].concat(mid || [s0, [s0[0], e0[1]], e0], [l.to])
      .filter((p, i, all) => !i || i === all.length - 1 || !onRun(all[i - 1], p, all[i + 1]))
    net.claim(l.pts)
  }

  var routeLines = (cx) => {
    fanPorts(cx, buildLines(cx))
    var bounds = {x: MARGIN - 24, y: cx.y0 - 24, w: cx.right - MARGIN + 48, h: cx.bottom - cx.y0 + 48}
    // a boundary caption is kept clear of lines like a box
    var captions = cx.boundaries.map((b) => ({clear: 6, x: b.x + 4, y: b.y + 8, w: captionWidth(b.caption, b.tagText, cx.mono) + 16, h: 12}))
    var net = router(cx.model.elements.concat(captions), bounds)
    // running along a boundary edge reads as part of the frame: it costs like running along another line
    cx.boundaries.forEach((b) => net.claim([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]]))
    // shortest first, so the long lines bend around the short ones
    cx.lines.slice().sort((p, q) => reach(p) - reach(q)).forEach((l) => routeLine(net, l))
    return net
  }

  // labels: a masked block beside the longest free stretch of its line, never on a box, a caption or another label
  var labelSize = (r, mono) => {
    var chip = r.index ? 20 : 0
    var w1 = r.label ? measure(r.label, 9, mono, 400, 0.54) : 0
    var w2 = r.techn ? measure(`[${r.techn}]`, 8, mono, 400) : 0
    return {w: Math.ceil(chip + Math.max(w1, w2)) + 8, h: r.label && r.techn ? 28 : 16}
  }
  var makeFree = (boxes, taken, net) => (r) => !boxes.some((b) => intersects(r, {x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8})) &&
    !taken.some((o) => intersects(r, o)) &&
    !net.used.some((s) => intersects(r, {x: Math.min(s[0], s[2]) - 2, y: Math.min(s[1], s[3]) - 2, w: Math.abs(s[2] - s[0]) + 4, h: Math.abs(s[3] - s[1]) + 4}))
  var segLength = ([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1])
  var segmentsOf = (pts) => {
    var segs = []
    for (var i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]])
    return segs.sort((p, q) => segLength(q) - segLength(p))
  }
  // where a block may sit beside a segment: above or below a flat one, either side of an upright one
  var sideSpots = (p, q, flat, size) => (flat
    ? [[(p[0] + q[0]) / 2 - size.w / 2, p[1] - 8 - size.h], [(p[0] + q[0]) / 2 - size.w / 2, p[1] + 8]]
    : [[p[0] + 8, (p[1] + q[1]) / 2 - size.h / 2], [p[0] - 8 - size.w, (p[1] + q[1]) / 2 - size.h / 2]])
  var withinSeg = (rect, p, q, flat) => (flat
    ? rect.x >= Math.min(p[0], q[0]) && rect.x + rect.w <= Math.max(p[0], q[0])
    : rect.y >= Math.min(p[1], q[1]) && rect.y + rect.h <= Math.max(p[1], q[1]))
  // slide along the segment when the middle is busy
  var SLIDES = [0, -0.25, 0.25, -0.4, 0.4]
  var spotOnSeg = ([p, q], size, free) => {
    var flat = p[1] === q[1]
    var len = Math.abs(flat ? q[0] - p[0] : q[1] - p[1])
    if (len < (flat ? size.w : size.h) + 16) return null
    var tries = sideSpots(p, q, flat, size)
    var rects = SLIDES.flatMap((f) => tries.map(([x, y]) => (flat ? {x: x + f * len, y, w: size.w, h: size.h} : {x, y: y + f * len, w: size.w, h: size.h})))
    return rects.find((rect) => withinSeg(rect, p, q, flat) && free(rect)) || null
  }
  var labelSpot = (pts, size, free) => {
    var segs = segmentsOf(pts)
    for (var i = 0; i < segs.length; i++) {
      var spot = spotOnSeg(segs[i], size, free)
      if (spot) return spot
    }
    var [p, q] = segs[0]
    return {x: (p[0] + q[0]) / 2 + 8, y: (p[1] + q[1]) / 2 - size.h - 8, w: size.w, h: size.h}
  }

  var placeLabels = (cx, net) => {
    var taken = cx.boundaries.map((b) => ({x: b.x, y: b.y, w: b.w, h: HEAD - 8}))
    var free = makeFree(cx.model.elements, taken, net)
    cx.lines.filter((l) => l.r.label || l.r.techn || l.r.index).forEach((l) => {
      var spot = labelSpot(l.pts, labelSize(l.r, cx.mono), free)
      taken.push(spot)
      l.label = spot
    })
  }

  // a box is drawn whole: paper mask, the shape, the tag, the words
  var tone = ({t, focal}, e) => (e === focal ? {fill: t.accentTint, stroke: t.accent, width: 1.2, tag: t.accentText}
    : e.ext ? {fill: `rgba(${t.inkRgb},0.03)`, stroke: `rgba(${t.inkRgb},0.30)`, width: 1, tag: t.soft}
      : e.store ? {fill: `rgba(${t.inkRgb},0.05)`, stroke: t.muted, width: 1, tag: t.muted}
        : {fill: t.node, stroke: t.ink, width: 1, tag: t.muted})
  var dbOutline = (e) => `M0,6A${e.w / 2},6 0 0 1 ${e.w},6V${e.h - 6}A${e.w / 2},6 0 0 1 0,${e.h - 6}Z`
  var queueOutline = (e) => `M8,0H${e.w - 8}A8,${e.h / 2} 0 0 1 ${e.w - 8},${e.h}H8A8,${e.h / 2} 0 0 1 8,0Z`
  var paint = (k) => `stroke="${k.stroke}" stroke-width="${k.width}"`
  var SHAPE_DRAW = {
    db: (e, k) => `<path d="${dbOutline(e)}" fill="${k.fill}" ${paint(k)}/>` +
      `<path d="M0,6A${e.w / 2},6 0 0 0 ${e.w},6" fill="none" ${paint(k)}/>`,
    queue: (e, k) => `<path d="${queueOutline(e)}" fill="${k.fill}" ${paint(k)}/>` +
      `<path d="M${e.w - 8},0A8,${e.h / 2} 0 0 0 ${e.w - 8},${e.h}" fill="none" ${paint(k)}/>`
  }
  var shape = (e, k) => (SHAPE_DRAW[e.store] || ((b, c) => `<rect width="${b.w}" height="${b.h}" rx="6" fill="${c.fill}" ${paint(c)}/>`))(e, k)
  var MASK_DRAW = {
    db: (e, t) => `<path d="${dbOutline(e)}" fill="${t.paper}"/>`,
    queue: (e, t) => `<path d="${queueOutline(e)}" fill="${t.paper}"/>`
  }
  var mask = (e, t) => (MASK_DRAW[e.store] || ((b, c) => `<rect width="${b.w}" height="${b.h}" rx="6" fill="${c.paper}"/>`))(e, t)

  // a small person glyph in the top right corner
  var personGlyph = (e, k) => {
    var px = e.w - 22
    var py = 10
    return [`<circle cx="${px + 6}" cy="${py + 4}" r="3.5" fill="none" stroke="${k.tag}" stroke-width="1"/>`,
      `<path d="M${px},${py + 15}a6,6 0 0 1 12,0" fill="none" stroke="${k.tag}" stroke-width="1"/>`]
  }

  // centred lines of one style, the y of the next one comes back; gap is the space before the first
  var words = (g, y, lines, style) => {
    if (lines.length) y += style.gap
    lines.forEach((line) => {
      y += style.step
      g.push(`<text x="${style.x}" y="${num(y - 3)}" text-anchor="middle" font-family="${style.family}" font-size="${style.size}"${style.weight} fill="${style.fill}">${esc(line)}</text>`)
    })
    return y
  }

  // the words sit as one block in the space under the tag
  var wordBlock = (cx, e, g, tagY) => {
    var {t, sans, mono, focal} = cx
    var x = e.w / 2
    var y = tagY + 14 + Math.max(8, (e.h - (tagY + 14) - 8 - textHeight(e)) / 2)
    y = words(g, y, e.names, {x, gap: 0, step: 15, family: sans, size: 12, weight: ' font-weight="600"', fill: e === focal ? t.accentText : t.ink})
    y = words(g, y, e.techs, {x, gap: 0, step: 14, family: mono, size: 9, weight: '', fill: t.muted})
    words(g, y, e.descrs, {x, gap: 4, step: 14, family: sans, size: 11, weight: '', fill: t.muted})
  }

  var nodeSvg = (cx, e) => {
    var {t, mono, id} = cx
    var k = tone(cx, e)
    var tagW = Math.ceil(measure(e.tag, 8, mono, 500, 0.64)) + 12
    var tagX = e.store === 'queue' ? 16 : 10
    var tagY = 10 + e.top
    var g = [`<g class="node c4-node" id="${id}-c4-${esc(e.alias)}-0" transform="translate(${num(e.x)},${num(e.y)})">`,
      mask(e, t), shape(e, k),
      `<rect x="${tagX}" y="${tagY}" width="${tagW}" height="14" rx="2" fill="none" stroke="${k.tag}" stroke-opacity="0.5" stroke-width="0.8"/>`,
      `<text x="${tagX + tagW / 2}" y="${tagY + 7}" text-anchor="middle" dominant-baseline="central" font-family="${mono}" font-size="8" font-weight="500" letter-spacing="0.64" fill="${k.tag}">${esc(e.tag)}</text>`]
    if (e.kind === 'person') g.push(...personGlyph(e, k))
    wordBlock(cx, e, g, tagY)
    g.push('</g>')
    return g.join('')
  }

  // markers, one per line colour
  var markerOf = (cx, c) => `${cx.id}-c4-arrow-${cx.colors.indexOf(c)}`
  var markerDef = (cx, c) =>
    `<marker id="${markerOf(cx, c)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${esc(c)}"/></marker>`

  var boundarySvg = ({t, mono}, b) => {
    var tagX = b.x + 12 + measure(b.caption, 8, mono, 500, 1.12) + 8
    return `<g class="c4-boundary" data-alias="${esc(b.alias)}"><rect x="${num(b.x)}" y="${num(b.y)}" width="${b.w}" height="${b.h}" rx="8" fill="rgba(${t.inkRgb},0.02)" stroke="${t.ruleSolid}"${b.node ? '' : ' stroke-dasharray="4 4"'}/>` +
      `<text x="${num(b.x + 12)}" y="${num(b.y + 18)}" font-family="${mono}" font-size="8" font-weight="500" letter-spacing="1.12" fill="${t.soft}">${esc(b.caption)}</text>` +
      (b.tagText ? `<text x="${num(tagX)}" y="${num(b.y + 18)}" font-family="${mono}" font-size="8" letter-spacing="0.64" fill="${t.soft}" fill-opacity="0.8">${esc(b.tagText)}</text>` : '') + '</g>'
  }

  var relSvg = (cx, l) => {
    var color = l.r.lineColor || cx.t.muted
    var m = `url(#${markerOf(cx, color)})`
    return `<path class="c4-rel relationshipLine" id="${cx.id}-c4-rel-${l.i}" data-from="${esc(l.r.from)}" data-to="${esc(l.r.to)}" d="${round(l.pts, 8)}" fill="none" ` +
      `stroke="${esc(color)}" stroke-width="1" marker-end="${m}"${l.r.bi ? ` marker-start="${m}"` : ''}/>`
  }

  var labelSvg = ({t, mono, id}, l) => {
    var s = l.label
    var r = l.r
    var tx = s.x + 4 + (r.index ? 20 : 0)
    var g = [`<g class="edgeLabel c4-label" data-id="${id}-c4-rel-${l.i}"><rect x="${num(s.x)}" y="${num(s.y)}" width="${s.w}" height="${s.h}" rx="2" fill="${t.paper}"/>`]
    if (r.index) {
      g.push(`<circle cx="${num(s.x + 11)}" cy="${num(s.y + 8)}" r="7" fill="${t.paper}" stroke="${t.muted}"/>`,
        `<text x="${num(s.x + 11)}" y="${num(s.y + 8)}" text-anchor="middle" dominant-baseline="central" font-family="${mono}" font-size="8" fill="${t.ink}">${esc(r.index)}</text>`)
    }
    var y = s.y + 8
    if (r.label) {
      g.push(`<text x="${num(tx)}" y="${num(y)}" dominant-baseline="central" font-family="${mono}" font-size="9" letter-spacing="0.54" fill="${esc(r.textColor || t.muted)}">${esc(r.label)}</text>`)
      y += 12
    }
    if (r.techn) g.push(`<text x="${num(tx)}" y="${num(y)}" dominant-baseline="central" font-family="${mono}" font-size="8" fill="${t.soft}">[${esc(r.techn)}]</text>`)
    g.push('</g>')
    return g.join('')
  }

  // the far edge of the drawing along one axis: the boxes, the line points and the label blocks
  var extent = (cx, bound, axisAt, edge) => grid(Math.max(bound, ...cx.lines.flatMap((l) => l.pts.map((p) => p[axisAt])), ...cx.lines.filter((l) => l.label).map((l) => edge(l.label))) + MARGIN)

  // what the page script reads back from the svg
  var infoOf = (cx) => {
    var info = {nodes: {}, links: {}}
    cx.model.elements.forEach((e) => {
      info.nodes[e.alias] = {name: e.label || e.alias, kind: e.tag, techn: e.techn, descr: e.descr, focal: e === cx.focal}
    })
    cx.lines.forEach((l) => {
      info.links[`rel-${l.i}`] = {from: l.r.from, to: l.r.to, label: l.r.label, techn: l.r.techn, index: l.r.index || ''}
    })
    return info
  }

  var svgDocument = (cx) => {
    var {model, t, sans, id, focal, lines} = cx
    cx.colors = [...new Set([t.muted, ...lines.map((l) => l.r.lineColor).filter(Boolean)])]
    var body = []
    if (model.title) body.push(`<text x="${MARGIN}" y="${MARGIN + 14}" font-family="${sans}" font-size="16" font-weight="600" fill="${t.ink}">${esc(model.title)}</text>`)
    cx.boundaries.forEach((b) => body.push(boundarySvg(cx, b)))
    lines.forEach((l) => body.push(relSvg(cx, l)))
    lines.filter((l) => l.label).forEach((l) => body.push(labelSvg(cx, l)))

    var width = extent(cx, cx.right, 0, (s) => s.x + s.w)
    var height = extent(cx, cx.bottom, 1, (s) => s.y + s.h)
    var summary = `${model.title || model.kind}: ${model.elements.length} elements, ${lines.length} relationships` +
      (focal ? `, centred on ${focal.label || focal.alias}` : '')
    return [`<svg xmlns="http://www.w3.org/2000/svg" id="${id}" width="100%" style="max-width: ${width}px;" viewBox="0 0 ${width} ${height}" ` +
      `role="graphics-document document" aria-roledescription="c4" font-family="${esc(sans)}">`,
      `<title>${esc(model.title || model.kind)}</title><desc>${esc(summary)}</desc>`,
      `<defs>${cx.colors.map((c) => markerDef(cx, c)).join('')}</defs>`, body.join(''), model.elements.map((e) => nodeSvg(cx, e)).join(''),
      `<metadata class="c4-model">${esc(JSON.stringify(infoOf(cx)))}</metadata>`, '</svg>'].join('')
  }

  // c4 source -> svg markup, or '' when mermaid should draw it. t: the style tokens of mermaid.js
  var render = (src, t, fonts, id) => {
    var model = parse(src)
    if (!model) return ''
    var cx = contextOf(model, t, fonts, id)
    describe(cx)
    layout(cx)
    placeLabels(cx, routeLines(cx))
    return svgDocument(cx)
  }

  return {parse, render}
})()
