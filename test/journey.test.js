import {describe, expect, test} from 'bun:test'
import {load} from './load.js'

const {journey} = load(['content/draw.js', 'content/journey.js'], ['journey'])
const light = {paper: '#f5f5f5', node: '#fff', ink: '#2d3142', muted: '#4f5d75', soft: '#7a8399', rule: 'rgba(0,0,0,.1)', ruleSolid: '#bfc0c0', accent: '#bf4520', accentTint: 'rgba(191,69,32,.08)', accentText: '#bf4520', danger: '#c0401f', inkRgb: '45,49,66'}
const fonts = {sans: 'sans-serif', mono: 'monospace'}

const src = `journey
  title Trial
  section A
    Sign up: 4: Visitor
    Hit the limit: 1: Visitor, Teammate
  section B
    Upgrade: 3
`

describe('journey parse', () => {
  test('title, sections, scores and actors', () => {
    const model = journey.parse(src)
    expect(model.title).toBe('Trial')
    expect(model.sections.map((s) => s.name)).toEqual(['A', 'B'])
    expect(model.sections[0].stages[1]).toEqual({name: 'Hit the limit', score: 1, actors: ['Visitor', 'Teammate']})
    expect(model.sections[1].stages[0].actors).toEqual([])
  })

  test('comments and accessibility lines are ignored, scores are clamped', () => {
    const model = journey.parse('journey\n%% x\naccTitle: t\naccDescr {\n  long\n}\nA: 9\nB: 0')
    expect(model.sections[0].stages.map((s) => s.score)).toEqual([5, 1])
  })

  test('anything else is left to mermaid', () => {
    expect(journey.parse('flowchart LR\n A --> B')).toBeNull()
    expect(journey.parse('journey\n  title only')).toBeNull()
    expect(journey.parse('journey\n  Task without a score')).toBeNull()
    expect(journey.render('pie\n "a": 1', light, fonts, 'j-0')).toBe('')
  })
})

describe('journey render', () => {
  const svg = journey.render(src, light, fonts, 'j-1')

  test('a stage per task, a segment between neighbours', () => {
    expect(svg).toContain('aria-roledescription="journey"')
    expect(svg.match(/class="node journey-stage"/g)).toHaveLength(3)
    expect(svg.match(/class="journey-line relationshipLine"/g)).toHaveLength(2)
    expect(svg).toContain('data-from="s0" data-to="s1"')
    expect(svg).toContain('id="j-1-journey-s2-0"')
  })

  test('the lowest stage takes the accent with its incoming segment and a marker', () => {
    expect(svg).toContain('LOWEST POINT')
    expect(svg.match(/stroke="#bf4520" stroke-width="2"/g)).toHaveLength(1)
    expect(svg).toContain('LOW · 1/5')
  })

  test('the model names the neighbours of a stage', () => {
    const model = JSON.parse(/<metadata class="journey-model">([^<]*)<\/metadata>/.exec(svg)[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
    expect(model.nodes.s1).toMatchObject({name: 'Hit the limit', n: 2, level: 'LOW', prev: 's0', next: 's2', low: true})
  })

  test('no trough when every stage feels the same', () => {
    const flat = journey.render('journey\n  A: 3\n  B: 3', light, fonts, 'j-2')
    expect(flat).not.toContain('LOWEST POINT')
    expect(flat).not.toContain('#bf4520')
  })
})
