// DBML (https://dbml.dbdiagram.io) drawn straight to svg, no mermaid involved. The diagram is skinned on the
// same tokens as the mermaid diagrams: table cards with constraint chips, schema groups, routed foreign keys.
var dbml = (() => {
  var OPS = ['<>', '<', '>', '-']
  var WORD = /[\w$\u0080-\uffff]/

  var tokenize = (src) => {
    var out = []
    var line = 1
    var i = 0
    var n = src.length
    var lines = (s) => (s.match(/\n/g) || []).length
    while (i < n) {
      var c = src[i]
      var end
      if (c === '\n') {
        line++
        i++
      }
      else if (/\s/.test(c)) i++
      else if (src.startsWith('//', i)) {
        while (i < n && src[i] !== '\n') i++
      }
      else if (src.startsWith('/*', i)) {
        end = src.indexOf('*/', i + 2)
        end = end < 0 ? n : end + 2
        line += lines(src.slice(i, end))
        i = end
      }
      else if (src.startsWith("'''", i)) {
        end = src.indexOf("'''", i + 3)
        end = end < 0 ? n : end
        out.push({t: 'str', v: src.slice(i + 3, end), line})
        line += lines(src.slice(i, end))
        i = Math.min(n, end + 3)
      }
      else if (c === "'" || c === '"' || c === '`') {
        var j = i + 1
        while (j < n && src[j] !== c) j += src[j] === '\\' ? 2 : 1
        out.push({t: c === '"' ? 'id' : c === '`' ? 'expr' : 'str', v: src.slice(i + 1, j), line})
        line += lines(src.slice(i, j))
        i = j + 1
      }
      else if (WORD.test(c)) {
        var k = i
        while (k < n && WORD.test(src[k])) k++
        out.push({t: 'id', v: src.slice(i, k), line})
        i = k
      }
      else if (src.startsWith('<>', i)) {
        out.push({t: 'sym', v: '<>', line})
        i += 2
      }
      else {
        out.push({t: 'sym', v: c, line})
        i++
      }
    }
    return out
  }

  var isSym = (tok, v) => !!tok && tok.t === 'sym' && tok.v === v
  // "primary key" is two tokens, "numeric(12,2)" many: join the words with a space, the rest tight
  var text = (toks) => toks.reduce((s, t, i) =>
    s + (i && toks[i - 1].t === 'id' && t.t === 'id' ? ' ' : '') + (t.t === 'expr' ? '`' + t.v + '`' : t.v), '')

  // [a, b: c] -> [{key: 'a', tokens: []}, {key: 'b', tokens: [c]}]
  var settings = (toks) => {
    var list = []
    var seg = []
    var depth = 0
    var flush = () => {
      if (!seg.length) return
      var at = seg.findIndex((t) => isSym(t, ':'))
      var key = (at < 0 ? seg : seg.slice(0, at)).map((t) => t.v).join(' ').toLowerCase()
      list.push({key, tokens: at < 0 ? [] : seg.slice(at + 1)})
      seg = []
    }
    toks.forEach((t) => {
      if (t.t === 'sym') {
        if (t.v === '(' || t.v === '[') depth++
        else if (t.v === ')' || t.v === ']') depth--
        else if (t.v === ',' && !depth) return flush()
      }
      seg.push(t)
    })
    flush()
    return list
  }

  // statement tokens -> [tokens before the [settings], tokens inside them]; `int[]` is a type, not settings
  var split = (toks) => {
    for (var i = 0; i < toks.length; i++) {
      if (!isSym(toks[i], '[')) continue
      if (isSym(toks[i + 1], ']')) {
        i++
        continue
      }
      var close = toks.length - (isSym(toks[toks.length - 1], ']') ? 1 : 0)
      return [toks.slice(0, i), toks.slice(i + 1, close)]
    }
    return [toks, []]
  }

  // `users.id`, `public.users.id`, `users.(a, b)`: the table path and the columns
  var endpoint = (toks) => {
    var path = []
    var cols = null
    for (var i = 0; i < toks.length; i++) {
      if (isSym(toks[i], '(')) {
        cols = []
        for (i++; i < toks.length && !isSym(toks[i], ')'); i++) {
          if (toks[i].t !== 'sym') cols.push(toks[i].v)
        }
        break
      }
      if (toks[i].t !== 'sym') path.push(toks[i].v)
    }
    return cols ? {path, cols} : {path: path.slice(0, -1), cols: path.slice(-1)}
  }

  // `a.x > b.y`: the many side holds the foreign key. `-` is one to one, the left side keeps the key
  var relation = (toks, left) => {
    var [head, inside] = split(toks)
    var at = head.findIndex((t) => t.t === 'sym' && OPS.includes(t.v))
    if (at < 0) return null
    var op = head[at].v
    var a = at ? endpoint(head.slice(0, at)) : left
    var b = endpoint(head.slice(at + 1))
    var opts = {}
    settings(inside).forEach((s) => (opts[s.key] = text(s.tokens).toLowerCase()))
    var [child, parent] = op === '<' ? [b, a] : [a, b]
    return {child, parent, many: op === '<>', delete: opts.delete || '', update: opts.update || ''}
  }

  var parse = (src) => {
    var tk = tokenize(src)
    var p = 0
    var model = {tables: [], enums: [], groups: [], refs: []}
    var sym = (v, tok = tk[p]) => isSym(tok, v)
    var word = (tok = tk[p]) => (tok && tok.t === 'id' ? tok.v.toLowerCase() : '')

    // at "{": step over the whole block
    var skip = () => {
      var depth = 0
      while (p < tk.length) {
        if (sym('{')) depth++
        else if (sym('}') && !--depth) return void p++
        p++
      }
    }
    // a dotted name: schema.table
    var name = () => {
      var parts = []
      while (tk[p] && (tk[p].t === 'id' || tk[p].t === 'str')) {
        parts.push(tk[p++].v)
        if (sym('.')) p++
        else break
      }
      return parts
    }
    // at "[": the tokens inside the brackets
    var bracket = () => {
      var inner = []
      var depth = 0
      while (p < tk.length) {
        if (sym('[')) depth++
        else if (sym(']') && !--depth) break
        else if (depth) inner.push(tk[p])
        p++
      }
      p++
      return inner
    }
    // the rest of the line, and any [settings] that open on it
    var statement = () => {
      var first = tk[p].line
      var out = []
      var depth = 0
      while (p < tk.length && (tk[p].line === first || depth > 0)) {
        if (sym('[')) depth++
        else if (sym(']')) depth--
        else if (sym('}') && !depth) break
        out.push(tk[p++])
      }
      return out
    }
    // `Note: 'text'` or `Note { 'text' }`: steps over it and gives back the text
    var note = () => {
      if (sym(':', tk[p + 1])) {
        var value = tk[p + 2] ? tk[p + 2].v : ''
        p += 3
        return value
      }
      p++
      var from = p
      skip()
      return tk.slice(from, p).filter((t) => t.t === 'str').map((t) => t.v).join(' ')
    }
    var isNote = () => word() === 'note' && (sym(':', tk[p + 1]) || sym('{', tk[p + 1]))
    var link = (rel) => rel && model.refs.push(rel)

    var indexes = (table) => {
      while (p < tk.length && !sym('}')) {
        var [head, inside] = split(statement())
        var cols = sym('(', head[0]) ? head.filter((t) => t.t !== 'sym').map((t) => t.v) : head.slice(0, 1).map((t) => t.v)
        var opts = {}
        settings(inside).forEach((s) => (opts[s.key] = text(s.tokens)))
        table.indexes.push({cols, unique: 'unique' in opts, pk: 'pk' in opts, name: opts.name || ''})
      }
      p++
    }

    var column = (toks, table) => {
      var [head, inside] = split(toks)
      if (!head.length) return
      var col = {name: head[0].v, type: text(head.slice(1)), pk: false, unique: false, notNull: false, fk: false}
      settings(inside).forEach((s) => {
        if (s.key === 'pk' || s.key === 'primary key') col.pk = true
        else if (s.key === 'unique') col.unique = true
        else if (s.key === 'not null') col.notNull = true
        else if (s.key === 'increment') col.inc = true
        else if (s.key === 'default') col.def = text(s.tokens)
        else if (s.key === 'note') col.note = text(s.tokens)
        else if (s.key === 'ref') link(relation(s.tokens, {table, cols: [col.name]}))
      })
      table.cols.push(col)
    }

    var table = () => {
      p++
      var parts = name()
      var t = {
        schema: parts.length > 1 ? parts[parts.length - 2] : 'public', name: parts[parts.length - 1] || '',
        alias: '', cols: [], indexes: [], color: '', collapse: 0, note: ''
      }
      if (word() === 'as') {
        p++
        t.alias = tk[p++].v
      }
      if (sym('[')) {
        settings(bracket()).forEach((s) => {
          if (s.key === 'headercolor') t.color = text(s.tokens)
          if (s.key === 'collapse') t.collapse = parseInt(text(s.tokens), 10) || 0
        })
      }
      if (!sym('{')) return
      p++
      while (p < tk.length && !sym('}')) {
        if (word() === 'indexes' && sym('{', tk[p + 1])) {
          p += 2
          indexes(t)
        }
        else if (isNote()) t.note = note()
        else column(statement(), t)
      }
      p++
      model.tables.push(t)
    }

    var enumeration = () => {
      p++
      var parts = name()
      var e = {schema: parts.length > 1 ? parts[parts.length - 2] : 'public', name: parts[parts.length - 1] || '', values: []}
      if (!sym('{')) return
      p++
      while (p < tk.length && !sym('}')) {
        if (isNote()) note()
        else e.values.push(statement()[0].v)
      }
      p++
      model.enums.push(e)
    }

    var group = () => {
      p++
      var g = {name: name().join('.'), tables: []}
      if (sym('[')) bracket()
      if (!sym('{')) return
      p++
      while (p < tk.length && !sym('}')) {
        if (isNote()) note()
        else if (tk[p].t === 'id' || tk[p].t === 'str') g.tables.push(name())
        else p++
      }
      p++
      model.groups.push(g)
    }

    var ref = () => {
      p++
      while (p < tk.length && !sym(':') && !sym('{')) p++
      if (sym(':')) {
        p++
        link(relation(statement()))
      }
      else if (sym('{')) {
        p++
        while (p < tk.length && !sym('}')) link(relation(statement()))
        p++
      }
    }

    while (p < tk.length) {
      var w = word()
      if (w === 'table') table()
      else if (w === 'enum') enumeration()
      else if (w === 'tablegroup') group()
      else if (w === 'ref') ref()
      else if (sym('{')) skip()
      else p++
    }
    return model
  }

  var pick = (model, ep) => {
    if (ep.table) return ep.table
    var name = ep.path[ep.path.length - 1]
    var schema = ep.path.length > 1 ? ep.path[ep.path.length - 2] : ''
    var found = model.tables.filter((t) => (t.name === name || t.alias === name) && (!schema || t.schema === schema))
    var table = found.find((t) => t.schema === 'public') || found[0]
    if (!table) throw new Error('DBML: unknown table "' + ep.path.join('.') + '" in a Ref')
    return table
  }

  var {esc, num, measure} = draw

  // the card metrics, in svg units
  var PAD = 16
  var HEAD = 38
  var ROW = 28
  var MORE = 26
  var IDX_HEAD = 30
  var IDX_ROW = 20
  var IDX_FOOT = 10
  var CHIP_H = 16
  var CHIP_GAP = 4
  var RADIUS = 8
  var MARGIN = 24
  var GAP = 56
  var GROUP_PAD = 24
  var GROUP_TOP = 38

  // a rect with its top and/or bottom corners rounded
  var band = (x, y, w, h, top, bottom) =>
    `M${x},${y + top}a${top},${top} 0 0 1 ${top},${-top}H${x + w - top}a${top},${top} 0 0 1 ${top},${top}` +
    `V${y + h - bottom}a${bottom},${bottom} 0 0 1 ${-bottom},${bottom}H${x + bottom}a${bottom},${bottom} 0 0 1 ${-bottom},${-bottom}Z`

  // a polyline with rounded corners
  var round = (points, radius) => {
    var pts = points.filter((pt, i) => !i || pt[0] !== points[i - 1][0] || pt[1] !== points[i - 1][1])
    var d = `M${pts[0][0]},${pts[0][1]}`
    for (var i = 1; i < pts.length - 1; i++) {
      var prev = pts[i - 1]
      var cur = pts[i]
      var next = pts[i + 1]
      var l1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1])
      var l2 = Math.hypot(next[0] - cur[0], next[1] - cur[1])
      var r = Math.min(radius, l1 / 2, l2 / 2)
      d += `L${num(cur[0] + (prev[0] - cur[0]) * r / l1)},${num(cur[1] + (prev[1] - cur[1]) * r / l1)}` +
        `Q${cur[0]},${cur[1]} ${num(cur[0] + (next[0] - cur[0]) * r / l2)},${num(cur[1] + (next[1] - cur[1]) * r / l2)}`
    }
    return d + `L${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}`
  }

  // dbml text -> svg markup. t: the style tokens of mermaid.js, fonts: {sans, mono}, id: unique per svg
  var render = (src, t, fonts, id) => {
    var model = parse(src)
    var danger = t.danger
    var sans = fonts.sans
    var mono = fonts.mono

    // every table and enum becomes a card
    var nodes = []
    var tableNode = new Map()
    model.tables.forEach((tbl) => {
      var cols = tbl.cols
      var visible = tbl.collapse > 0 && cols.length > tbl.collapse + 1 ? cols.slice(0, tbl.collapse) : cols
      var node = {
        kind: 'table', title: `${tbl.schema}.${tbl.name}`, badge: 'TABLE', table: tbl, color: tbl.color,
        cols, visible, hidden: cols.length - visible.length, rows: [], indexes: []
      }
      tableNode.set(tbl, node)
      nodes.push(node)
    })
    model.enums.forEach((e) => {
      nodes.push({
        kind: 'enum', title: `${e.schema}.${e.name}`, badge: 'ENUM', schema: e.schema, color: '', hidden: 0, indexes: [],
        cols: e.values.map((v) => ({name: v})), visible: e.values.map((v) => ({name: v})), rows: []
      })
    })

    // links: resolve the tables, mark the foreign key columns
    var seen = new Map()
    var links = model.refs.map((rel) => {
      var child = tableNode.get(pick(model, rel.child))
      var parent = tableNode.get(pick(model, rel.parent))
      rel.child.cols.forEach((name) => {
        var col = child.cols.find((c) => c.name === name)
        if (col) col.fk = true
      })
      var label = [rel.delete && `ON DELETE ${rel.delete.toUpperCase()}`, rel.update && `ON UPDATE ${rel.update.toUpperCase()}`].filter(Boolean).join(' \u00b7 ')
      var link = {
        child, parent, childCol: rel.child.cols[0], parentCol: rel.parent.cols[0], many: rel.many, label,
        destructive: rel.delete === 'cascade'
      }
      // `ref:` on a column and a `Ref:` for the same pair describe one line: keep the one that says more
      var key = [nodes.indexOf(child), link.childCol, nodes.indexOf(parent), link.parentCol].join('|')
      var twin = seen.get(key)
      if (twin) {
        if (!twin.label && label) Object.assign(twin, link)
        return null
      }
      seen.set(key, link)
      return link
    }).filter(Boolean)

    // chips and index names
    nodes.forEach((n) => {
      if (n.kind === 'table') {
        var tbl = n.table
        var composite = new Set()
        tbl.indexes.forEach((ix) => ix.pk && ix.cols.forEach((c) => composite.add(c)))
        n.indexInfo = tbl.indexes.filter((ix) => !ix.pk).map((ix) => ({
          name: ix.name || `${ix.unique ? 'uq' : 'idx'}_${tbl.name}_${ix.cols.join('_')}`, cols: ix.cols, unique: ix.unique
        }))
        n.indexes = n.indexInfo.map((ix) => ix.name)
        var single = new Set(tbl.indexes.filter((ix) => ix.unique && ix.cols.length === 1).map((ix) => ix.cols[0]))
        n.cols.forEach((c) => {
          var pk = c.pk || composite.has(c.name)
          c.chips = [pk && 'PK', c.fk && 'FK', (c.unique || single.has(c.name)) && 'UQ', c.notNull && !pk && 'NN'].filter(Boolean)
        })
      }
      n.visible.forEach((c) => (c.chips = c.chips || []))
      n.rows = n.visible
    })

    var chipW = (s) => measure(s, 9, mono, 400, 0.5) + 10
    nodes.forEach((n) => {
      var nameW = Math.max(0, ...n.rows.map((c) => measure(c.name, 13.5, sans)))
      var typeW = Math.max(0, ...n.rows.map((c) => measure(c.type || '', 12, mono)))
      var chipsW = Math.max(0, ...n.rows.map((c) => c.chips.reduce((sum, s, i) => sum + chipW(s) + (i ? CHIP_GAP : 0), 0)))
      var badgeW = measure(n.badge, 9.5, mono, 400, 1) + 14
      var body = PAD + nameW + (chipsW ? 18 + chipsW : 0) + (typeW ? 22 + typeW : 0) + PAD
      var head = PAD + measure(n.title, 14.5, sans, 700) + 24 + badgeW + PAD
      var idx = Math.max(0, ...n.indexes.map((s) => measure(s, 11.5, mono) + 2 * PAD))
      n.w = Math.ceil(Math.max(body, head, idx, 230))
      n.chipsX = PAD + nameW + 18
      n.badgeW = badgeW
      n.h = HEAD + n.rows.length * ROW + (n.hidden ? MORE : 0) + (n.indexes.length ? IDX_HEAD + n.indexes.length * IDX_ROW + IDX_FOOT : 0) + 2
    })

    // units: a schema group or a table group keeps its cards together in one box
    var units = []
    var unitOf = new Map()
    var claim = (label, members, schema) => {
      members = members.filter((n) => !unitOf.has(n))
      if (!members.length) return
      var u = {nodes: members, label, group: true, schema}
      members.forEach((n) => unitOf.set(n, u))
      units.push(u)
    }
    model.groups.forEach((g) => {
      var members = g.tables.map((path) => {
        var name = path[path.length - 1]
        var schema = path.length > 1 ? path[path.length - 2] : ''
        return nodes.find((n) => n.table && (n.table.name === name || n.table.alias === name) && (!schema || n.table.schema === schema))
      }).filter(Boolean)
      claim(g.name, members)
    })
    var schemas = []
    nodes.forEach((n) => {
      var schema = n.table ? n.table.schema : n.schema
      if (schema !== 'public' && !unitOf.has(n) && !schemas.includes(schema)) schemas.push(schema)
    })
    schemas.forEach((s) => claim(s, nodes.filter((n) => (n.table ? n.table.schema : n.schema) === s), s))
    nodes.forEach((n) => {
      if (unitOf.has(n)) return
      var u = {nodes: [n], group: false}
      unitOf.set(n, u)
      units.push(u)
    })
    units.forEach((u) => {
      if (u.group) {
        var y = GROUP_TOP
        u.nodes.forEach((n) => {
          n.dx = GROUP_PAD
          n.dy = y
          y += n.h + 28
        })
        u.w = Math.max(...u.nodes.map((n) => n.w)) + 2 * GROUP_PAD
        u.h = y - 28 + GROUP_PAD
        u.labelW = measure(u.label.toUpperCase(), 10, mono, 400, 1.5)
        u.w = Math.max(u.w, u.labelW + 2 * GROUP_PAD)
      }
      else {
        u.nodes[0].dx = 0
        u.nodes[0].dy = 0
        u.w = u.nodes[0].w
        u.h = u.nodes[0].h
      }
    })

    // layers: a table sits to the right of the tables it points at
    var near = new Map(units.map((u) => [u, []]))
    var ties = links.filter((l) => unitOf.get(l.child) !== unitOf.get(l.parent))
    ties.forEach((l) => {
      near.get(unitOf.get(l.child)).push(unitOf.get(l.parent))
      near.get(unitOf.get(l.parent)).push(unitOf.get(l.child))
    })
    var layered = units.filter((u) => near.get(u).length)
    var loose = units.filter((u) => !near.get(u).length)
    layered.forEach((u) => (u.layer = 0))
    for (var pass = 0, moved = true; moved && pass <= units.length; pass++) {
      moved = false
      ties.forEach((l) => {
        var c = unitOf.get(l.child)
        var par = unitOf.get(l.parent)
        if (c.layer <= par.layer) {
          c.layer = par.layer + 1
          moved = true
        }
      })
    }
    var depth = Math.max(-1, ...layered.map((u) => u.layer)) + 1
    var columns = Array.from({length: depth}, (_, i) => layered.filter((u) => u.layer === i))
    layered.forEach((u) => u.nodes.forEach((n) => (n.layer = u.layer)))

    var stack = () => {
      var heights = columns.map((col) => col.reduce((sum, u) => sum + u.h, 0) + Math.max(0, col.length - 1) * GAP)
      var tallest = Math.max(0, ...heights)
      columns.forEach((col, i) => {
        var y = MARGIN + (tallest - heights[i]) / 2
        col.forEach((u) => {
          u.y = y
          y += u.h + GAP
        })
      })
      return tallest
    }
    var tallest = stack()
    for (var sweep = 0; sweep < 4; sweep++) {
      columns.forEach((col) => {
        var key = new Map(col.map((u) => {
          var ys = near.get(u).map((o) => o.y + o.h / 2)
          return [u, ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : u.y + u.h / 2]
        }))
        col.sort((a, b) => key.get(a) - key.get(b))
      })
      tallest = stack()
    }

    // channels: the vertical run of a link lives in the gap right beside the table it points at
    links.forEach((l) => {
      l.local = unitOf.get(l.child) === unitOf.get(l.parent) && loose.includes(unitOf.get(l.child))
      l.labelW = l.label ? measure(l.label, 10, mono, 400, 1) : 0
      if (!l.local) l.gap = l.child.layer < l.parent.layer ? l.parent.layer - 1 : l.parent.layer
    })
    var gaps = Array.from({length: depth}, (_, g) => {
      var inside = links.filter((l) => !l.local && l.gap === g)
      var room = inside.length && Math.max(0, ...inside.map((l) => l.labelW)) ? Math.max(...inside.map((l) => l.labelW)) + 20 : 18
      return {links: inside, room, width: Math.max(70, room + 12 + inside.length * 14 + 30)}
    })
    var x = MARGIN
    var widths = columns.map((col) => Math.max(0, ...col.map((u) => u.w)))
    columns.forEach((col, i) => {
      col.forEach((u) => (u.x = x))
      gaps[i].x = x + widths[i]
      x += widths[i] + gaps[i].width
    })
    var mainRight = depth ? x - (gaps[depth - 1].links.length ? 0 : gaps[depth - 1].width) : MARGIN
    gaps.forEach((g) => g.links.forEach((l, k) => (l.channel = g.x + g.room + 12 + k * 14)))

    // loose units flow in rows beneath the layered ones
    var wrap = Math.max(mainRight - MARGIN, 900)
    var cursorX = MARGIN
    var cursorY = depth ? MARGIN + tallest + 56 : MARGIN
    var rowH = 0
    loose.forEach((u) => {
      if (cursorX > MARGIN && cursorX - MARGIN + u.w > wrap) {
        cursorX = MARGIN
        cursorY += rowH + 32
        rowH = 0
      }
      u.x = cursorX
      u.y = cursorY
      cursorX += u.w + 32
      rowH = Math.max(rowH, u.h)
    })
    var bottom = loose.length ? cursorY + rowH : depth ? MARGIN + tallest : MARGIN
    var right = Math.max(mainRight, ...loose.map((u) => u.x + u.w))
    units.forEach((u) => u.nodes.forEach((n) => {
      n.x = u.x + n.dx
      n.y = u.y + n.dy
    }))

    // anchors: the y of a column inside its card, side by side links on one row are spread out
    var anchorY = (n, name) => {
      var i = n.visible.findIndex((c) => c.name === name)
      if (i >= 0) return n.y + HEAD + i * ROW + ROW / 2
      if (n.hidden && n.cols.some((c) => c.name === name)) return n.y + HEAD + n.visible.length * ROW + MORE / 2
      return n.y + HEAD / 2
    }
    var ends = new Map()
    var spread = (n, name, side) => {
      var key = `${nodes.indexOf(n)}|${name}|${side}`
      var list = ends.get(key) || []
      ends.set(key, list)
      list.push(1)
      return {key, index: list.length - 1}
    }
    var labels = []
    links.forEach((l) => {
      var c = l.child
      var p = l.parent
      var back = !l.local && c.layer < p.layer
      var toLeft = !l.local && c.layer > p.layer
      var s = spread(c, l.childCol, toLeft ? 'l' : 'r')
      var e = spread(p, l.parentCol, back ? 'l' : 'r')
      l.s = s
      l.e = e
      l.side = {start: toLeft ? 'l' : 'r', end: back ? 'l' : 'r'}
    })
    // lines that share an anchor are spread wide enough for a label to sit above each of them
    var shift = (ref) => (ends.get(ref.key).length > 1 ? (ref.index - (ends.get(ref.key).length - 1) / 2) * 18 : 0)
    var paths = links.map((l) => {
      var c = l.child
      var p = l.parent
      var sy = anchorY(c, l.childCol) + shift(l.s)
      var ty = anchorY(p, l.parentCol) + shift(l.e)
      var sx = l.side.start === 'l' ? c.x : c.x + c.w
      var tx = l.side.end === 'l' ? p.x : p.x + p.w
      var cx = l.local ? Math.max(sx, tx) + 14 + (links.filter((o) => o.local).indexOf(l)) * 8 : l.channel
      if (sy === ty && sx === tx) return null
      return {l, d: round([[sx, sy], [cx, sy], [cx, ty], [tx, ty]], 8), tx, ty}
    }).filter(Boolean)

    var chip = (s, x0, y0) =>
      `<rect x="${num(x0)}" y="${y0}" width="${num(chipW(s))}" height="${CHIP_H}" rx="3.5" fill="${t.node}" stroke="${t.soft}"/>` +
      `<text x="${num(x0 + chipW(s) / 2)}" y="${y0 + CHIP_H / 2}" text-anchor="middle" dominant-baseline="central" font-family="${mono}" font-size="9" letter-spacing="0.5" fill="${t.muted}">${esc(s)}</text>`
    var width = Math.ceil(right + MARGIN)
    var height = Math.ceil(bottom + MARGIN)

    // draw
    var out = [
      `<svg xmlns="http://www.w3.org/2000/svg" id="${id}" width="100%" style="max-width: ${width}px;" viewBox="0 0 ${width} ${height}" ` +
      `role="graphics-document document" aria-roledescription="dbml" font-family="${esc(sans)}">`,
      `<defs>${[['a', t.muted], ['d', danger]].map(([k, color]) =>
        `<marker id="${id}-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${color}"/></marker>`).join('')}</defs>`
    ]
    units.filter((u) => u.group).forEach((u) => {
      out.push(`<g class="dbml-group"><rect x="${num(u.x)}" y="${num(u.y)}" width="${num(u.w)}" height="${num(u.h)}" rx="16" fill="rgba(${t.inkRgb},0.03)" stroke="${t.soft}" stroke-dasharray="5 4"/>` +
        `<text x="${num(u.x + GROUP_PAD)}" y="${num(u.y + 20)}" dominant-baseline="central" font-family="${mono}" font-size="10" letter-spacing="1.5" fill="${t.soft}">${esc(u.label.toUpperCase())}</text></g>`)
    })
    // a link is a relationshipLine, so the hover and focus styling of the viewer applies to it as to an er relationship;
    // data-from / data-to name the two tables, the child holding the foreign key is the origin
    paths.forEach(({l, d}, i) => {
      l.key = 'L-' + i
      var color = l.destructive ? danger : t.muted
      var marker = `url(#${id}-${l.destructive ? 'd' : 'a'})`
      out.push(`<path class="dbml-link relationshipLine" id="${id}-${l.key}" data-from="${esc(l.child.title)}" data-to="${esc(l.parent.title)}" d="${d}" fill="none" ` +
        `stroke="${color}" stroke-width="1.4" marker-end="${marker}"${l.many ? ` marker-start="${marker}"` : ''}/>`)
    })
    paths.forEach(({l, tx, ty}) => {
      if (!l.label) return
      var back = l.side.end === 'l'
      out.push(`<g class="edgeLabel"><text data-id="${l.key}" x="${num(back ? tx - 8 : tx + 8)}" y="${num(ty - 7)}" text-anchor="${back ? 'end' : 'start'}" font-family="${mono}" font-size="10" letter-spacing="1" ` +
        `fill="${l.destructive ? danger : t.muted}" stroke="${t.paper}" stroke-width="4" paint-order="stroke">${esc(l.label)}</text></g>`)
    })
    // a wide invisible stroke on top of every line, so a line is easy to point at
    paths.forEach(({l, d}) => out.push(`<path class="dbml-hit-line" data-link="${l.key}" d="${d}" fill="none" stroke="transparent" stroke-width="12"/>`))
    nodes.forEach((n) => {
      var last = !n.hidden && !n.indexes.length
      // g.node is what the viewer focuses; its direct rects take the hover outline, the rest sits in the body
      var g = [`<g class="node dbml-table" id="${id}-dbml-${esc(n.title)}-0" transform="translate(${num(n.x)},${num(n.y)})">`,
        `<rect class="dbml-bg" width="${n.w}" height="${n.h}" rx="${RADIUS}" fill="${t.node}"/>`,
        '<g class="dbml-body">',
        n.color
          ? `<path d="${band(0, 0, n.w, HEAD, RADIUS, 0)}" fill="${esc(n.color)}" fill-opacity="0.16"/>`
          : `<path d="${band(0, 0, n.w, HEAD, RADIUS, 0)}" fill="rgba(${t.inkRgb},0.06)"/>`,
        `<path d="M0,${HEAD}H${n.w}" stroke="${t.ruleSolid}"/>`,
        `<text x="${PAD}" y="${HEAD / 2}" dominant-baseline="central" font-family="${sans}" font-size="14.5" font-weight="700" fill="${t.ink}">${esc(n.title)}</text>`,
        `<rect x="${num(n.w - PAD - n.badgeW)}" y="${(HEAD - 18) / 2}" width="${num(n.badgeW)}" height="18" rx="4" fill="none" stroke="${t.soft}"/>`,
        `<text x="${num(n.w - PAD - n.badgeW / 2)}" y="${HEAD / 2}" text-anchor="middle" dominant-baseline="central" font-family="${mono}" font-size="9.5" letter-spacing="1" fill="${t.muted}">${n.badge}</text>`]
      n.rows.forEach((c, i) => {
        var y = HEAD + i * ROW
        var edge = last && i === n.rows.length - 1
        g.push(`<g class="dbml-row" data-col="${esc(c.name)}">`)
        if (i % 2) g.push(`<path d="${band(0, y, n.w, ROW, 0, edge ? RADIUS : 0)}" fill="rgba(${t.inkRgb},0.025)"/>`)
        g.push(`<rect class="dbml-hit" y="${y}" width="${n.w}" height="${ROW}" fill="rgba(0,0,0,0)"/>`)
        g.push(`<text x="${PAD}" y="${y + ROW / 2}" dominant-baseline="central" font-size="13.5" fill="${t.ink}">${esc(c.name)}</text>`)
        var cx = n.chipsX
        c.chips.forEach((s) => {
          g.push(chip(s, cx, y + (ROW - CHIP_H) / 2))
          cx += chipW(s) + CHIP_GAP
        })
        if (c.type) g.push(`<text x="${n.w - PAD}" y="${y + ROW / 2}" text-anchor="end" dominant-baseline="central" font-family="${mono}" font-size="12" fill="${t.muted}">${esc(c.type)}</text>`)
        g.push('</g>')
      })
      var y = HEAD + n.rows.length * ROW
      if (n.hidden) {
        g.push(`<text x="${PAD}" y="${y + MORE / 2}" dominant-baseline="central" font-family="${mono}" font-size="11.5" fill="${t.soft}">+ ${n.hidden} more column${n.hidden > 1 ? 's' : ''}</text>`)
        y += MORE
      }
      if (n.indexes.length) {
        g.push(`<path d="M0,${y}H${n.w}" stroke="${t.rule}"/>`,
          `<text x="${PAD}" y="${y + 16}" dominant-baseline="central" font-family="${mono}" font-size="9.5" letter-spacing="1.5" fill="${t.soft}">INDEXES</text>`)
        n.indexes.forEach((s, i) => g.push(
          `<text x="${PAD}" y="${y + IDX_HEAD + i * IDX_ROW + IDX_ROW / 2}" dominant-baseline="central" font-family="${mono}" font-size="11.5" fill="${t.muted}">${esc(s)}</text>`))
      }
      g.push('</g>', `<rect class="dbml-border" width="${n.w}" height="${n.h}" rx="${RADIUS}" fill="none" stroke="${t.ink}" stroke-width="1.5"/>`, '</g>')
      out.push(g.join(''))
    })

    // what the popup of the viewer shows: every column and index of a table, the line behind every link
    var info = {nodes: {}, links: {}}
    nodes.forEach((n) => {
      info.nodes[n.title] = {
        kind: n.kind, title: n.title, note: n.table ? n.table.note : '',
        cols: n.cols.map((c) => ({name: c.name, type: c.type || '', chips: c.chips, def: c.def || '', note: c.note || '', inc: !!c.inc})),
        indexes: n.indexInfo || []
      }
    })
    paths.forEach(({l}) => {
      info.links[l.key] = {child: l.child.title, parent: l.parent.title, childCol: l.childCol, parentCol: l.parentCol, label: l.label, many: l.many}
    })
    out.push(`<metadata class="dbml-model">${esc(JSON.stringify(info))}</metadata>`, '</svg>')
    return out.join('')
  }

  return {parse, render}
})()
