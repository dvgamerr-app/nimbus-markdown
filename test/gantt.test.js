import {describe, expect, test} from 'bun:test'
import {load} from './load.js'

const {gantt} = load(['content/draw.js', 'content/gantt.js'], ['gantt'])
const light = {paper: '#f5f5f5', node: '#fff', ink: '#2d3142', muted: '#4f5d75', soft: '#7a8399', rule: 'rgba(0,0,0,.1)', ruleSolid: '#bfc0c0', accent: '#eb6c36', accentTint: 'rgba(235,108,54,.08)', accentText: '#bf4520', danger: '#c0401f', inkRgb: '45,49,66', mutedRgb: '79,93,117'}
const fonts = {sans: 'sans-serif', mono: 'monospace'}
const day = (s) => Date.UTC(...s.split('-').map((v, i) => (i === 1 ? v - 1 : +v)))

const src = `gantt
  title Plan
  dateFormat YYYY-MM-DD
  axisFormat %d %b
  todayMarker off
  section Design
    Research   :done, des1, 2026-01-05, 2026-01-12
    Wireframes :active, des2, after des1, 5d
  section Build
    Backend    :crit, b1, after des2, 1w
    Ship       :milestone, m1, after b1, 0d
    Freeze     :vert, v1, 2026-01-30, 0d
  click b1 href "https://example.com"
`

describe('gantt parse', () => {
  test('title, sections, tags, ids and dates', () => {
    const model = gantt.parse(src)
    expect(model.title).toBe('Plan')
    expect(model.sections.map((s) => s.name)).toEqual(['Design', 'Build'])
    const [research, wire, backend, ship] = model.tasks
    expect(research.tags).toEqual(['done'])
    expect(research.from).toBe(day('2026-01-05'))
    expect(research.to).toBe(day('2026-01-12'))
    expect(wire.from).toBe(research.to)
    expect(wire.to - wire.from).toBe(5 * 86400000)
    expect(backend.from).toBe(wire.to)
    expect(ship.from).toBe(backend.to)
    expect(model.links.b1).toBe('https://example.com')
  })

  test('a task without a start follows the one above, ids are numbered', () => {
    const model = gantt.parse('gantt\n  A :2026-03-02, 2d\n  B :3d')
    expect(model.tasks.map((t) => t.id)).toEqual(['task1', 'task2'])
    expect(model.tasks[1].from).toBe(model.tasks[0].to)
  })

  test('excluded weekends stretch a duration over them', () => {
    // Friday plus two working days ends on Tuesday
    const model = gantt.parse('gantt\n  excludes weekends\n  A :2026-01-09, 2d')
    expect(model.tasks[0].to).toBe(day('2026-01-13'))
  })

  test('a bar that ends on a weekend stops at the last working day', () => {
    // Monday plus five working days: the bar covers Mon-Fri, the next task waits until Monday
    const model = gantt.parse('gantt\n  excludes weekends\n  A :2026-01-05, 5d\n  B :1d')
    expect(model.tasks[0].until).toBe(day('2026-01-10'))
    expect(model.tasks[0].to).toBe(day('2026-01-12'))
    expect(model.tasks[1].from).toBe(day('2026-01-12'))
  })

  test('after takes the latest of several tasks', () => {
    const model = gantt.parse('gantt\n  A :a, 2026-01-01, 2d\n  B :b, 2026-01-01, 5d\n  C :after a b, 1d')
    expect(model.tasks[2].from).toBe(day('2026-01-06'))
  })

  test('anything else is left to mermaid', () => {
    expect(gantt.parse('flowchart LR\n A --> B')).toBeNull()
    expect(gantt.parse('gantt\n  title only')).toBeNull()
    expect(gantt.parse('gantt\n  displayMode compact\n  A :2026-01-01, 1d')).toBeNull()
    expect(gantt.parse('gantt\n  excludes 2026-01-02\n  A :2026-01-01, 1d')).toBeNull()
    expect(gantt.parse('gantt\n  A :a, 2026-01-01, until b')).toBeNull()
    expect(gantt.parse('gantt\n  A :after nope, 1d')).toBeNull()
    expect(gantt.parse('gantt\n  dateFormat X\n  A :1700000000, 1d')).toBeNull()
    expect(gantt.render('pie\n "a": 1', light, fonts, 'g-0')).toBe('')
  })
})

describe('gantt render', () => {
  const svg = gantt.render(src, light, fonts, 'g-1')

  test('a task group per row, the vertical marker is not a row', () => {
    expect(svg).toContain('aria-roledescription="gantt"')
    expect(svg.match(/class="node gantt-task"/g)).toHaveLength(4)
    expect(svg).toContain('id="g-1-gantt-b1-0"')
    expect(svg.match(/class="gantt-vert"/g)).toHaveLength(1)
    expect(svg).toContain('FREEZE')
  })

  test('the critical task takes the accent, its name the darker accent', () => {
    expect(svg).toContain('stroke="#eb6c36"')
    expect(svg).toContain('fill="#bf4520">Backend')
  })

  test('section eyebrows, axis ticks in the axis format, a link on the clickable task', () => {
    expect(svg).toContain('>DESIGN<')
    expect(svg).toMatch(/>\d\d Jan</)
    expect(svg).toContain('<a href="https://example.com"')
  })

  test('a tick interval that never moves on or is too fine leaves the chart to mermaid', () => {
    for (const tick of ['0month', '0day', '1millisecond']) {
      expect(gantt.render(`gantt\n  tickInterval ${tick}\n  A :2026-01-01, 1d`, light, fonts, 'g-t')).toBe('')
    }
  })

  test('the model rides along for the popup', () => {
    const meta = /<metadata class="gantt-model">(.*?)<\/metadata>/.exec(svg)[1].replace(/&quot;/g, '"')
    expect(JSON.parse(meta).nodes.b1).toMatchObject({name: 'Backend', section: 'Build', tags: ['crit'], after: ['des2']})
  })
})
