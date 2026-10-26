import {describe, expect, test} from 'bun:test'
import {load} from './load.js'

const {pie} = load(['content/draw.js', 'content/pie.js'], ['pie'])
const series = ['#7c8f6f', '#5e7a9b', '#b8915a', '#9c6b50', '#6e6479']
const light = {paper: '#f5f5f5', node: '#fff', ink: '#2d3142', muted: '#4f5d75', soft: '#7a8399', rule: 'rgba(0,0,0,.1)', ruleSolid: '#bfc0c0', accent: '#eb6c36', accentTint: 'rgba(235,108,54,.08)', accentText: '#bf4520', danger: '#c0401f', inkRgb: '45,49,66', series}
const dark = {...light, paper: '#020202', accent: '#79b1f9', accentText: '#79b1f9', dark: true, series: ['#69ba7c', '#79b1f9', '#dcaf61', '#f07f77', '#a3a3a3']}
const fonts = {sans: 'sans-serif', mono: 'monospace'}

const src = `pie showData
  title Browser share
  "Chrome" : 65
  "Safari" : 18
  "Firefox" : 7.5
  "Edge" : 5
  "Other" : 4.5
`

describe('pie parse', () => {
  test('title, showData and slices', () => {
    const model = pie.parse(src)
    expect(model.title).toBe('Browser share')
    expect(model.showData).toBe(true)
    expect(model.slices).toHaveLength(5)
    expect(model.slices[2]).toEqual({label: 'Firefox', value: 7.5})
  })

  test('the title can sit on the pie line', () => {
    const model = pie.parse('pie title Pets\n  "Dogs" : 3\n  "Cats" : 1')
    expect(model.title).toBe('Pets')
    expect(model.showData).toBe(false)
  })

  test('anything else is left to mermaid', () => {
    expect(pie.parse('flowchart LR\n A --> B')).toBeNull()
    expect(pie.parse('pie\n  "a" : -1')).toBeNull()
    expect(pie.parse('pie\n  "a" : 0')).toBeNull()
    expect(pie.parse('pie\n  nonsense')).toBeNull()
    expect(pie.render('timeline\n 2002 : x', light, fonts, 'p-0')).toBe('')
  })
})

describe('pie render', () => {
  const svg = pie.render(src, light, fonts, 'p-1')

  test('a slice per value, named directly', () => {
    expect(svg).toContain('aria-roledescription="pie"')
    expect(svg.match(/class="node pie-slice"/g)).toHaveLength(5)
    expect(svg).toContain('id="p-1-pie-s0-0"')
    expect(svg).toContain('>Firefox<')
    expect(svg).toContain('7.5 · 7.5%')
  })

  test('only the largest slice takes the accent, the total sits in the centre', () => {
    expect(svg.match(/fill="#eb6c36" fill-opacity="1"/g)).toHaveLength(1)
    expect(svg).toContain('>TOTAL<')
    expect(svg).toContain('>100<')
  })

  test('without showData the centre carries the focal share', () => {
    const plain = pie.render('pie\n  "A" : 1\n  "B" : 3', light, fonts, 'p-2')
    expect(plain).toContain('>75%<')
    expect(plain).toContain('>B<')
  })

  test('dark mode never repeats the accent in the palette', () => {
    const darkSvg = pie.render(src, dark, fonts, 'p-3')
    expect(darkSvg.match(/fill="#79b1f9" fill-opacity/g)).toHaveLength(1)
  })

  test('an init directive leaves the chart to mermaid', () => {
    expect(pie.parse(`%%{init: {'pie': {'textPosition': 0.5}}}%%\n${src}`)).toBeNull()
  })

  test('a model for the popup', () => {
    const meta = /<metadata class="pie-model">([^<]+)<\/metadata>/.exec(svg)[1].replace(/&quot;/g, '"')
    expect(JSON.parse(meta).nodes.s0).toEqual({name: 'Chrome', value: 65, share: 65, focal: true})
  })
})
