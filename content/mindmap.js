// Mermaid mindmaps drawn to the diagram-design tree laid on its side: the root in the middle as the one accent, the
// first-level branches split left and right by size, each taking one colour of the series palette as a thin edge bar.
// Connectors are orthogonal elbows from the parent's edge to a bus and into each child. Syntax that is not understood
// falls back to mermaid itself, see render()
var mindmap = (() => {
  // the delimiters of a node shape, longest first so (( is not read as (
  var SHAPES = [
    ['((', '))', 'circle'], ['))', '((', 'bang'], ['{{', '}}', 'hexagon'],
    [')', '(', 'cloud'], ['(', ')', 'rounded'], ['[', ']', 'square']
  ]

  var label = (text) => {
    var found
    // a markdown string: "`text`"
    if ((found = /^"`([\s\S]*)`"$/.exec(text)) || (found = /^"([\s\S]*)"$/.exec(text))) text = found[1]
    return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim()
  }

  var node = (text) => {
    text = text.replace(/:::.*$/, '').trim()
    for (var i = 0; i < SHAPES.length; i++) {
      var [open, close, shape] = SHAPES[i]
      var at = text.indexOf(open)
      if (at < 0 || !text.endsWith(close) || text.length < at + open.length + close.length) continue
      var id = text.slice(0, at).trim()
      if (id && !/^[\w-]+$/.test(id)) continue
      return {id, shape, text: label(text.slice(at + open.length, text.length - close.length))}
    }
    return {id: '', shape: 'plain', text: label(text)}
  }

  // hang an item under the nearest shallower one; false when it has no parent, a second root is not a mindmap
  // mermaid would draw either
  var attach = (stack, item, indent) => {
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    if (!stack.length) return false
    stack[stack.length - 1].item.children.push(item)
    stack.push({indent, item})
    return true
  }

  // icons and classes decorate the node above them, the drawing keeps only the node
  var decoration = (line) => /^::icon\(/.test(line) || /^:::/.test(line)

  // one non-empty source line into the state; false when the source is not a mindmap this renderer draws
  var take = (state, raw, line) => {
    if (!state.head) {
      state.head = /^mindmap$/i.test(line)
      return state.head
    }
    if (decoration(line)) return true
    var indent = raw.length - raw.trimStart().length
    var item = Object.assign(node(line), {children: []})
    if (!item.text) return false
    if (state.root) return attach(state.stack, item, indent)
    state.root = item
    state.stack = [{indent, item}]
    return true
  }

  var parse = (src) => {
    var lines = draw.lines(src)
    if (!lines) return null
    var state = {head: false, root: null, stack: []}
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].replace(/%%.*$/, '').replace(/	/g, '    ')
      var line = raw.trim()
      if (line && !take(state, raw, line)) return null
    }
    return state.head && state.root ? state.root : null
  }

  var {esc, num, grid, measure, wrap} = draw

  var MARGIN = 32
  var LEVEL = 48
  var GAP = 12
  var BRANCH_GAP = 16
  var R = 8
  // type per depth: size, weight, line height, padding x / y, widest text
  var TYPE = [
    {size: 14, weight: 600, line: 18, px: 16, py: 12, max: 200},
    {size: 12, weight: 600, line: 15, px: 16, py: 10, max: 180},
    {size: 12, weight: 500, line: 15, px: 12, py: 8, max: 160}
  ]

  var typeOf = (item) => TYPE[Math.min(item.depth, 2)]
  var gapOf = (item) => (item.depth ? GAP : BRANCH_GAP)

  // the box of one item from its wrapped text
  var boxOf = (item, sans) => {
    var type = typeOf(item)
    var depth = item.depth
    item.lines = item.text.split(/<br\s*\/?>/i).flatMap((part) => wrap(part, type.max, type.size, sans, type.weight, 4)).slice(0, 4)
    var widest = Math.max(...item.lines.map((l) => measure(l, type.size, sans, type.weight)))
    item.w = grid(Math.max(depth ? 64 : 96, widest + type.px * 2 + (depth === 1 ? 4 : 0) + (item.shape === 'hexagon' ? 12 : 0)))
    item.h = grid(Math.max(depth ? 32 : 48, item.lines.length * type.line + type.py * 2))
  }

  // walk the tree once: depth, size and an index for every node, in reading order
  var sizeTree = (root, sans) => {
    var all = []
    var size = (item, depth, branch) => {
      item.depth = depth
      item.branch = branch
      item.n = all.length
      all.push(item)
      boxOf(item, sans)
      item.children.forEach((child, i) => size(child, depth + 1, depth ? branch : i))
    }
    size(root, 0, -1)
    return all
  }

  // the vertical room a subtree needs: its own box or its children stacked, whichever is taller
  var stacked = (item, key) => item.children.reduce((sum, c, i) => sum + c[key] + (i ? gapOf(item) : 0), 0)
  var span = (item) => {
    item.children.forEach(span)
    item.span = Math.max(item.h, stacked(item, 'span'))
  }

  var markSide = (item, side) => {
    item.side = side
    item.children.forEach((c) => markSide(c, side))
  }

  // first-level branches go right then left, each to the side that is shorter so far, order kept per side
  var splitSides = (root) => {
    var sides = {right: [], left: []}
    var height = {right: 0, left: 0}
    root.children.forEach((c) => {
      var side = height.right <= height.left ? 'right' : 'left'
      height[side] += c.span + (sides[side].length ? BRANCH_GAP : 0)
      sides[side].push(c)
      markSide(c, side)
    })
    return {sides, height}
  }

  // columns: every depth on a side is as wide as its widest node, nodes align on the edge nearer the root
  var columns = (all) => {
    var cols = {right: [], left: []}
    all.forEach((item) => {
      if (!item.depth) return
      var c = cols[item.side]
      c[item.depth] = Math.max(c[item.depth] || 0, item.w)
    })
    return cols
  }

  // place a subtree in the band from top: the node centred on its children, or on its own band when a leaf.
  // lay: {root, cols}
  var place = (lay, item, top) => {
    if (item.children.length) {
      var y = top + (item.span - stacked(item, 'span')) / 2
      item.children.forEach((c) => {
        place(lay, c, y)
        y += c.span + gapOf(item)
      })
      item.cy = (item.children[0].cy + item.children[item.children.length - 1].cy) / 2
    }
    else item.cy = top + item.span / 2
    var near = lay.root.w / 2 + LEVEL
    for (var d = 1; d < item.depth; d++) near += lay.cols[item.side][d] + LEVEL
    item.x = item.side === 'right' ? near : -near - item.w
    item.y = Math.round((item.cy - item.h / 2) / 4) * 4
    item.cy = item.y + item.h / 2
  }

  var placeAll = (root, all, sides, height) => {
    var lay = {root, cols: columns(all)}
    ;['right', 'left'].forEach((side) => {
      var y = -height[side] / 2
      sides[side].forEach((c) => {
        place(lay, c, y)
        y += c.span + BRANCH_GAP
      })
    })
    root.x = -root.w / 2
    root.y = Math.round(-root.h / 2 / 4) * 4
    root.cy = root.y + root.h / 2
  }

  // shift onto the canvas; answers the size of it
  var toCanvas = (all) => {
    var minX = Math.min(...all.map((i) => i.x))
    var minY = Math.min(...all.map((i) => i.y))
    var maxX = Math.max(...all.map((i) => i.x + i.w))
    var maxY = Math.max(...all.map((i) => i.y + i.h))
    var dx = MARGIN - minX
    var dy = MARGIN - minY
    all.forEach((i) => {
      i.x += dx
      i.y += dy
      i.cy += dy
    })
    return {width: grid(maxX - minX) + MARGIN * 2, bottom: grid(maxY - minY) + MARGIN * 2}
  }

  // out of the parent's side, a bus halfway across the gap, into the child's near edge
  var elbow = (x1, y1, x2, y2, s) => {
    var r = Math.min(R, Math.abs(y2 - y1) / 2)
    if (r < 1) return `M${num(x1)},${num(y1)}H${num(x2)}`
    var xm = x1 + s * LEVEL / 2
    var v = y2 > y1 ? 1 : -1
    return `M${num(x1)},${num(y1)}H${num(xm - s * r)}Q${num(xm)},${num(y1)} ${num(xm)},${num(y1 + v * r)}` +
      `V${num(y2 - v * r)}Q${num(xm)},${num(y2)} ${num(xm + s * r)},${num(y2)}H${num(x2)}`
  }

  // g: the drawing context {t, series, sans, id}
  var connector = (g, parent, child) => {
    var right = child.side === 'right'
    var x1 = right ? parent.x + parent.w : parent.x
    var x2 = right ? child.x : child.x + child.w
    var d = elbow(x1, parent.cy, x2, child.cy, right ? 1 : -1)
    return `<path class="mindmap-line relationshipLine" id="${g.id}-L-${child.n}" data-from="n${parent.n}" data-to="n${child.n}" ` +
      `d="${d}" fill="none" stroke="${g.t.muted}" stroke-width="1"/>`
  }

  // the outline of a node by its shape: subtle variants of one box, not cartoons
  var outline = (item, fill, stroke, extra) => {
    var {x, y, w, h} = item
    if (item.shape === 'hexagon') {
      var c = 10
      return `<path d="M${x + c},${y}H${x + w - c}L${x + w},${y + h / 2}L${x + w - c},${y + h}H${x + c}L${x},${y + h / 2}Z" fill="${fill}" stroke="${stroke}"${extra}/>`
    }
    var rx = {square: 2, rounded: 12, circle: h / 2}[item.shape] || (item.depth > 1 ? 4 : 6)
    var dash = item.shape === 'cloud' || item.shape === 'bang' ? ' stroke-dasharray="4 3"' : ''
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(rx, h / 2)}" fill="${fill}" stroke="${stroke}"${dash}${extra}/>`
  }

  // a paper backing so the connectors never show through the node
  var backing = (item, rx, t) => `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="${rx}" fill="${t.paper}"/>`

  // how far the branch bar stays clear of a chamfer or a wide corner
  var barInset = (item) => {
    if (item.shape === 'hexagon') return 12
    return item.shape === 'rounded' || item.shape === 'circle' ? 8 : 4
  }

  var rootShapes = (g, item) => [outline(item, g.t.accentTint, g.t.accent, ' stroke-width="1.2"')]

  // the branch colour: a thin bar on the outer edge
  var branchShapes = (g, item) => {
    var inset = barInset(item)
    var bx = item.side === 'right' ? item.x + item.w - inset - 3 : item.x + inset
    return [backing(item, 6, g.t), outline(item, g.t.node, g.t.ink, ''),
      `<rect x="${bx}" y="${item.y + 6}" width="3" height="${item.h - 12}" rx="1.5" fill="${g.series[item.branch % g.series.length]}"/>`]
  }

  var leafShapes = (g, item) => [backing(item, 4, g.t),
    item.shape === 'plain'
      ? outline(item, `rgba(${g.t.inkRgb},0.03)`, g.t.rule, '')
      : outline(item, g.t.node, g.t.muted, '')]

  var shapesOf = (g, item) => {
    if (!item.depth) return rootShapes(g, item)
    return item.depth === 1 ? branchShapes(g, item) : leafShapes(g, item)
  }

  // the branch label sits off-centre by the width of its bar
  var textCentre = (item) => {
    if (item.depth !== 1) return item.x + item.w / 2
    return item.x + item.w / 2 - (item.side === 'right' ? 2 : -2)
  }

  var nodeMarks = (g, item) => {
    var type = typeOf(item)
    var cx = textCentre(item)
    var top = item.cy - (item.lines.length * type.line) / 2 + type.line / 2
    var texts = item.lines.map((line, k) =>
      `<text x="${num(cx)}" y="${num(top + k * type.line)}" text-anchor="middle" dominant-baseline="central" font-family="${g.sans}" font-size="${type.size}" font-weight="${type.weight}" fill="${g.t.ink}">${esc(line)}</text>`)
    return [`<g class="node mindmap-item" id="${g.id}-mindmap-n${item.n}-0">`, ...shapesOf(g, item), ...texts, '</g>'].join('')
  }

  // mindmap source -> svg markup, or '' when mermaid should draw it. t: the style tokens of mermaid.js
  var render = (src, t, fonts, id) => {
    var root = parse(src)
    if (!root) return ''
    var sans = fonts.sans
    var g = {t, sans, id, series: t.series && t.series.length ? t.series : [t.muted]}

    var all = sizeTree(root, sans)
    span(root)
    var {sides, height} = splitSides(root)
    placeAll(root, all, sides, height)
    var {width, bottom} = toCanvas(all)

    var lines = []
    all.forEach((parent) => parent.children.forEach((child) => lines.push(connector(g, parent, child))))
    var nodes = all.map((item) => nodeMarks(g, item))

    var info = {nodes: {}}
    all.forEach((item) => {
      info.nodes['n' + item.n] = {name: item.lines.join(' '), depth: item.depth, shape: item.shape, children: item.children.length}
    })
    var name = root.lines.join(' ')
    var summary = `Mindmap of ${name}: ${root.children.length} branches, ${all.length - 1} topics` +
      (root.children.length ? ` (${root.children.map((c) => c.lines.join(' ')).join(', ')})` : '')

    return [`<svg xmlns="http://www.w3.org/2000/svg" id="${id}" width="100%" style="max-width: ${num(width)}px;" viewBox="0 0 ${num(width)} ${num(bottom)}" ` +
      `role="graphics-document document" aria-roledescription="mindmap" font-family="${esc(sans)}">`,
      `<title>${esc(name)}</title><desc>${esc(summary)}</desc>`,
      lines.join(''), nodes.join(''),
      `<metadata class="mindmap-model">${esc(JSON.stringify(info))}</metadata>`, '</svg>'].join('')
  }

  return {parse, render}
})()
