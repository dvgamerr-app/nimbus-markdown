import {describe, expect, test} from 'bun:test'
import {load} from './load.js'

const {quadrant} = load(['content/draw.js', 'content/quadrant.js'], ['quadrant'])
const light = {paper: '#f5f5f5', node: '#fff', ink: '#2d3142', muted: '#4f5d75', soft: '#7a8399', rule: 'rgba(0,0,0,.1)', ruleSolid: '#bfc0c0', accent: '#eb6c36', accentTint: 'rgba(235,108,54,.08)', accentText: '#bf4520', danger: '#c0401f', inkRgb: '45,49,66'}
const fonts = {sans: 'sans-serif', mono: 'monospace'}

const src = `quadrantChart
  title Reach and engagement
  x-axis Low Reach --> High Reach
  y-axis Low Engagement --> High Engagement
  quadrant-1 We should expand
  quadrant-2 Need to promote
  quadrant-3 Re-evaluate
  quadrant-4 May be improved
  Campaign A: [0.3, 0.6]
  Campaign B: [0.45, 0.23]
  Campaign C: [0.57, 0.69]
  Campaign D: [0.78, 0.34] radius: 12
  Campaign E: [0.40, 0.34] color: #ff3300, stroke-color: #0000ff
`

describe('quadrant parse', () => {
  test('title, axes, cells and points', () => {
    const model = quadrant.parse(src)
    expect(model.title).toBe('Reach and engagement')
    expect(model.x).toEqual(['Low Reach', 'High Reach'])
    expect(model.quadrants[3]).toBe('May be improved')
    expect(model.points).toHaveLength(5)
    expect(model.points[3]).toEqual({label: 'Campaign D', x: 0.78, y: 0.34, radius: 12})
    expect(model.points[4]).toMatchObject({color: '#ff3300', stroke: '#0000ff'})
  })

  test('an axis with one name is named at its tip', () => {
    expect(quadrant.parse('quadrantChart\n  x-axis Effort').x).toEqual(['', 'Effort'])
  })

  test('anything else is left to mermaid', () => {
    expect(quadrant.parse('flowchart LR\n A --> B')).toBeNull()
    expect(quadrant.parse('quadrantChart\n  A:::hot: [0.1, 0.2]')).toBeNull()
    expect(quadrant.parse('quadrantChart\n  classDef hot color: #f00')).toBeNull()
    expect(quadrant.parse('quadrantChart\n  A: [1.5, 0.2]')).toBeNull()
    expect(quadrant.parse('quadrantChart\n  A: [0.5, 0.2] shape: square')).toBeNull()
    expect(quadrant.render('pie\n "a": 1', light, fonts, 'q-0')).toBe('')
  })
})

describe('quadrant render', () => {
  const svg = quadrant.render(src, light, fonts, 'q-1')

  test('a point per item, axis ends and cells as eyebrows', () => {
    expect(svg).toContain('aria-roledescription="quadrantChart"')
    expect(svg.match(/class="node quadrant-point"/g)).toHaveLength(5)
    expect(svg).toContain('>HIGH REACH<')
    expect(svg).toContain('>WE SHOULD EXPAND<')
  })

  test('one focal item in quadrant-1, colours from the source kept', () => {
    expect(svg.match(/fill="#eb6c36"\/>/g)).toHaveLength(1)
    expect(svg).toContain('fill="#ff3300" stroke="#0000ff"')
    expect(svg).toContain('r="12"')
  })

  test('a model for the popup', () => {
    const meta = /<metadata class="quadrant-model">([^<]+)<\/metadata>/.exec(svg)[1].replace(/&quot;/g, '"')
    const nodes = JSON.parse(meta).nodes
    expect(nodes.p2).toMatchObject({name: 'Campaign C', quadrant: 1, focal: true})
    expect(nodes.p1).toMatchObject({quadrant: 3, cell: 'Re-evaluate', focal: false})
  })
})
