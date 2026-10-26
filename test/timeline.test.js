import {describe, expect, test} from 'bun:test'
import {load} from './load.js'

const {timeline} = load(['content/draw.js', 'content/timeline.js'], ['timeline'])
const light = {paper: '#f5f5f5', node: '#fff', ink: '#2d3142', muted: '#4f5d75', soft: '#7a8399', rule: 'rgba(0,0,0,.1)', ruleSolid: '#bfc0c0', accent: '#bf4520', accentTint: 'rgba(191,69,32,.08)', accentText: '#bf4520', danger: '#c0401f', inkRgb: '45,49,66'}
const fonts = {sans: 'sans-serif', mono: 'monospace'}

const src = `timeline
  title Social
  section Early
    2002 : LinkedIn
    2004 : Facebook : Google : Orkut
  section Growth
    2010 : Instagram
        : Pinterest
`
const dots = (svg) => [...svg.matchAll(/<circle cx="([\d.]+)" cy="[\d.]+" r="[46]"/g)].map((m) => parseFloat(m[1]))
const info = (svg) => JSON.parse(/<metadata class="timeline-model">([^<]*)<\/metadata>/.exec(svg)[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))

describe('timeline parse', () => {
  test('title, sections, periods and events', () => {
    const model = timeline.parse(src)
    expect(model.title).toBe('Social')
    expect(model.sections.map((s) => s.name)).toEqual(['Early', 'Growth'])
    expect(model.sections[0].periods[1]).toEqual({label: '2004', events: ['Facebook', 'Google', 'Orkut']})
  })

  test('a line that starts with a colon adds to the period above', () => {
    expect(timeline.parse(src).sections[1].periods[0].events).toEqual(['Instagram', 'Pinterest'])
  })

  test('comments, accessibility lines and a direction are ignored', () => {
    const model = timeline.parse('timeline LR\n%% x\naccTitle: t\naccDescr {\n  long\n}\nA : 1')
    expect(model.sections[0].periods).toEqual([{label: 'A', events: ['1']}])
  })

  test('anything else is left to mermaid', () => {
    expect(timeline.parse('flowchart LR\n A --> B')).toBeNull()
    expect(timeline.parse('timeline\n  title only')).toBeNull()
    expect(timeline.parse('timeline\n  : orphan')).toBeNull()
    expect(timeline.render('pie\n "a": 1', light, fonts, 't-0')).toBe('')
  })
})

describe('timeline render', () => {
  const svg = timeline.render(src, light, fonts, 't-1')

  test('a period per label, a baseline link between neighbours', () => {
    expect(svg).toContain('aria-roledescription="timeline"')
    expect(svg.match(/class="node timeline-period"/g)).toHaveLength(3)
    expect(svg).toContain('id="t-1-timeline-p2-0"')
    expect(svg.match(/class="timeline-line relationshipLine"/g)).toHaveLength(2)
    expect(svg).toContain('data-from="p0" data-to="p1"')
  })

  test('years are spaced by value', () => {
    const at = dots(svg)
    expect((at[1] - at[0]) / (at[2] - at[1])).toBeCloseTo(2 / 6, 1)
    expect(svg).toContain('Spacing is proportional to elapsed time.')
  })

  test('words are spaced evenly and need no spacing note', () => {
    const even = timeline.render('timeline\n  Alpha : a\n  Beta : b\n  Gamma : c', light, fonts, 't-2')
    const at = dots(even)
    expect(at[1] - at[0]).toBeCloseTo(at[2] - at[1], 1)
    expect(even).not.toContain('LEGEND')
  })

  test('the busiest period is the one major milestone', () => {
    const periods = svg.match(/<g class="node timeline-period".*?<\/g>/g)
    expect(periods.filter((g) => g.includes('r="6" fill="#bf4520"'))).toHaveLength(1)
    expect(svg).toContain('Busiest period')
    expect(info(svg).nodes.p1).toMatchObject({name: '2004', n: 2, major: true, gap: 2, prev: 'p0', next: 'p2'})
  })

  test('a tie has no milestone', () => {
    const flat = timeline.render('timeline\n  Q1 : a : b\n  Q2 : c : d', light, fonts, 't-3')
    // the style keeps the accent for the ring of a selected period, the drawing has none
    expect(flat.replace(/<style>[^<]*<\/style>/, '')).not.toContain('#bf4520')
    expect(info(flat).nodes.p1.gap).toBeNull()
  })

  test('a crowded period shows a few events and counts the rest', () => {
    const many = timeline.render('timeline\n  2020 : a : b : c : d : e : f', light, fonts, 't-4')
    expect(many).toContain('+3 MORE')
    expect(info(many).nodes.p0.events).toHaveLength(6)
  })

  test('labels on one side never meet', () => {
    const wide = timeline.render('timeline\n  2000 : A very long event name\n  2001 : b\n  2002 : Another very long event name', light, fonts, 't-5')
    const at = dots(wide)
    const boxes = [...wide.matchAll(/class="timeline-hit" x="([\d.]+)" y="[\d.]+" width="(\d+)"/g)].map((m) => [parseFloat(m[1]), parseFloat(m[1]) + parseFloat(m[2])])
    expect(boxes[2][0]).toBeGreaterThan(boxes[0][1])
    expect(at[1] - at[0]).toBeCloseTo(at[2] - at[1], 1)
  })
})

describe('timeline fit', () => {
  const width = (svg) => parseFloat(/viewBox="0 0 ([\d.]+)/.exec(svg)[1])

  test('the axis stretches to the room it is given, the type keeps its size', () => {
    const natural = timeline.render(src, light, fonts, 't-6')
    const wide = timeline.render(src, light, fonts, 't-7', 1200)
    expect(width(natural)).toBeLessThan(1200)
    expect(Math.abs(width(wide) - 1200)).toBeLessThanOrEqual(4)
    expect(wide.match(/font-size="12"/g).length).toBe(natural.match(/font-size="12"/g).length)
    const at = dots(wide)
    expect((at[1] - at[0]) / (at[2] - at[1])).toBeCloseTo(2 / 6, 1)
  })

  test('a narrower room never squeezes the axis', () => {
    expect(width(timeline.render(src, light, fonts, 't-8', 100))).toBe(width(timeline.render(src, light, fonts, 't-9')))
  })
})

describe('timeline motion', () => {
  // just enough of an svg for motion(): its model, the period groups and the progress stroke
  const stub = (svg) => {
    const attrs = {}
    const el = (key) => ({setAttribute: (k, v) => (attrs[key] = v), removeAttribute: () => delete attrs[key]})
    const groups = {}
    const progress = {style: {}}
    const classes = new Set()
    return {
      attrs, progress, classes,
      svg: {
        id: 'm',
        classList: {toggle: (c, on) => (on ? classes.add(c) : classes.delete(c))},
        querySelector: (sel) => {
          if (sel === 'metadata.timeline-model') return {textContent: /<metadata class="timeline-model">([^<]*)</.exec(svg)[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&')}
          if (sel === '.tl-progress') return progress
          const key = /timeline-(p\d+)-0/.exec(sel)[1]
          return (groups[key] = groups[key] || el(key))
        }
      }
    }
  }

  test('a step per period: the one in play, the ones behind, the ones ahead', () => {
    const s = stub(timeline.render(src, light, fonts, 'm'))
    const run = timeline.motion(s.svg)
    expect(run.steps.map((x) => x.label)).toEqual(['2002 · LinkedIn', '2004 · Facebook, Google, Orkut', '2010 · Instagram, Pinterest'])
    run.frame(1)
    expect(s.attrs).toEqual({p0: 'done', p1: 'now', p2: 'wait'})
    expect(s.classes.has('tl-motion')).toBe(true)
    expect(parseFloat(s.progress.style.strokeDashoffset)).toBeGreaterThan(0)
    run.frame(run.steps.length)
    expect(s.attrs).toEqual({})
    expect(s.classes.has('tl-motion')).toBe(false)
  })

  test('a long timeline steps by section, eight steps at most', () => {
    const long = 'timeline\n' + ['A', 'B', 'C'].map((name, k) => `  section ${name}\n` + [0, 1, 2, 3].map((i) => `    ${2000 + k * 4 + i} : e`).join('\n')).join('\n')
    expect(timeline.motion(stub(timeline.render(long, light, fonts, 'm')).svg).steps.map((x) => x.label)).toEqual(['2000 – 2003 · A', '2004 – 2007 · B', '2008 – 2011 · C'])
    const flat = 'timeline\n' + Array.from({length: 20}, (_, i) => `  ${2000 + i} : e`).join('\n')
    expect(timeline.motion(stub(timeline.render(flat, light, fonts, 'm')).svg).steps.length).toBeLessThanOrEqual(8)
  })
})

describe('timeline story', () => {
  const nodes = info(timeline.render(src, light, fonts, 't-10')).nodes

  test('years read as years between the neighbours', () => {
    expect(nodes.p1.story).toBe('2004 brings Facebook, Google and Orkut. It falls in Early. It comes 2 years after 2002 (LinkedIn) and 6 years before 2010 (Instagram and Pinterest). The busiest period: 3 of the 6 events on the timeline happen here.')
  })

  test('the ends open and close the timeline', () => {
    expect(nodes.p0.story).toContain('It opens the timeline, 2 years before 2004')
    expect(nodes.p2.story).toContain('It closes the timeline, 6 years after 2004')
  })

  test('words follow and lead without a distance', () => {
    const words = info(timeline.render('timeline\n  Alpha : a\n  Beta\n  Gamma : c', light, fonts, 't-11')).nodes
    expect(words.p1.story).toBe('Beta is marked with no events. It follows Alpha (a) and leads to Gamma (c).')
  })
})
