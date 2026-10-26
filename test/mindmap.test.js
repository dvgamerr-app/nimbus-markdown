import {describe, expect, test} from 'bun:test'
import {load} from './load.js'

const {mindmap} = load(['content/draw.js', 'content/mindmap.js'], ['mindmap'])
const light = {paper: '#f5f5f5', node: '#fff', ink: '#2d3142', muted: '#4f5d75', soft: '#7a8399', rule: 'rgba(0,0,0,.1)', ruleSolid: '#bfc0c0', accent: '#bf4520', accentTint: 'rgba(191,69,32,.08)', accentText: '#bf4520', danger: '#c0401f', inkRgb: '45,49,66', series: ['#7c8f6f', '#5e7a9b', '#b8915a']}
const fonts = {sans: 'sans-serif', mono: 'monospace'}

const src = `mindmap
  root((Mindmap))
    Origins
      Long history
      ::icon(fa fa-book)
      Popularisation
    Research
      On effectiveness<br/>and features
    Tools
      Pen and paper
    [Square]
    ))Bang((
    )Cloud(
    {{Hexagon}}
`

describe('mindmap parse', () => {
  test('indentation makes the tree, shapes and icons are read', () => {
    const root = mindmap.parse(src)
    expect(root.text).toBe('Mindmap')
    expect(root.shape).toBe('circle')
    expect(root.children.map((c) => c.text)).toEqual(['Origins', 'Research', 'Tools', 'Square', 'Bang', 'Cloud', 'Hexagon'])
    expect(root.children.slice(3).map((c) => c.shape)).toEqual(['square', 'bang', 'cloud', 'hexagon'])
    expect(root.children[0].children.map((c) => c.text)).toEqual(['Long history', 'Popularisation'])
  })

  test('an id before the shape and a markdown string', () => {
    const root = mindmap.parse('mindmap\n  id1["`**Bold** root`"]\n    a(child)')
    expect(root).toMatchObject({id: 'id1', shape: 'square', text: 'Bold root'})
    expect(root.children[0]).toMatchObject({id: 'a', shape: 'rounded', text: 'child'})
  })

  test('anything else is left to mermaid', () => {
    expect(mindmap.parse('flowchart LR\n A --> B')).toBeNull()
    expect(mindmap.parse('mindmap')).toBeNull()
    expect(mindmap.parse('mindmap\n  a\n  b')).toBeNull()
    expect(mindmap.render('pie\n "a": 1', light, fonts, 'm-0')).toBe('')
  })
})

describe('mindmap render', () => {
  const svg = mindmap.render(src, light, fonts, 'm-1')
  const boxes = [...svg.matchAll(/<g class="node mindmap-item" id="m-1-mindmap-n(\d+)-0"><rect x="([\d.-]+)"/g)]

  test('a node per topic and a connector per child', () => {
    expect(svg).toContain('aria-roledescription="mindmap"')
    expect(svg.match(/class="node mindmap-item"/g)).toHaveLength(12)
    expect(svg.match(/class="mindmap-line relationshipLine"/g)).toHaveLength(11)
  })

  test('only the root takes the accent', () => {
    expect(svg.match(/stroke="#bf4520"/g)).toHaveLength(1)
  })

  test('branches split to both sides of the root', () => {
    const root = parseFloat(boxes[0][2])
    const xs = boxes.slice(1).map((b) => parseFloat(b[2]))
    expect(xs.some((x) => x < root)).toBe(true)
    expect(xs.some((x) => x > root)).toBe(true)
  })

  test('connectors are orthogonal elbows', () => {
    const paths = [...svg.matchAll(/class="mindmap-line relationshipLine"[^>]* d="([^"]+)"/g)].map((m) => m[1])
    paths.forEach((d) => expect(d).toMatch(/^M[\d.]+,[\d.]+H[\d.]+(Q[\d., ]+V[\d.]+Q[\d., ]+H[\d.]+)?$/))
  })

  test('a line break in a label makes two lines', () => {
    expect(svg).toContain('>On effectiveness</text>')
    expect(svg).toContain('>and features</text>')
  })
})
