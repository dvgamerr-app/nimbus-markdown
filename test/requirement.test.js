import {describe, expect, test} from 'bun:test'
import {load} from './load.js'

const {requirement} = load(['content/draw.js', 'content/requirement.js'], ['requirement'])
const light = {paper: '#f5f5f5', node: '#fff', ink: '#2d3142', muted: '#4f5d75', soft: '#7a8399', rule: 'rgba(0,0,0,.1)', ruleSolid: '#bfc0c0', accent: '#eb6c36', accentTint: 'rgba(235,108,54,.08)', link: '#2e5aa8', accentText: '#bf4520', danger: '#c0401f', inkRgb: '45,49,66'}
const fonts = {sans: 'sans-serif', mono: 'monospace'}

const src = `requirementDiagram
  requirement test_req {
    id: 1
    text: the test text.
    risk: high
    verifymethod: test
  }
  functionalRequirement "func req" {
    id: 1.1
    text: "functional text."
    risk: Medium
    verifymethod: inspection
  }
  designConstraint dc_req {
    id: 1.5
    text: constraint text.
    risk: low
    verifymethod: analysis
  }
  element test_entity {
    type: simulation
    docref: github.com/mermaid
  }
  test_entity - satisfies -> test_req
  test_req - contains -> "func req"
  dc_req <- traces - "func req"
  test_entity - verifies -> dc_req
`

describe('requirement parse', () => {
  const model = requirement.parse(src)

  test('boxes with their fields', () => {
    expect(model.nodes.map((n) => n.name)).toEqual(['test_req', 'func req', 'dc_req', 'test_entity'])
    expect(model.nodes[0]).toMatchObject({kind: 'requirement', tag: 'REQUIREMENT', id: '1', text: 'the test text.', risk: 'high', verify: 'test'})
    expect(model.nodes[1]).toMatchObject({tag: 'FUNCTIONAL REQUIREMENT', text: 'functional text.'})
    expect(model.nodes[3]).toMatchObject({kind: 'element', type: 'simulation', docref: 'github.com/mermaid'})
  })

  test('relations, a backward arrow keeps its source', () => {
    expect(model.links).toEqual([
      {from: 'test_entity', type: 'satisfies', to: 'test_req'},
      {from: 'test_req', type: 'contains', to: 'func req'},
      {from: 'func req', type: 'traces', to: 'dc_req'},
      {from: 'test_entity', type: 'verifies', to: 'dc_req'}
    ])
  })

  test('a relation to an undeclared name makes a bare element', () => {
    const m = requirement.parse('requirementDiagram\n  a - derives -> b\n')
    expect(m.nodes).toEqual([{name: 'a', kind: 'element', tag: 'ELEMENT'}, {name: 'b', kind: 'element', tag: 'ELEMENT'}])
  })

  test('anything else is left to mermaid', () => {
    expect(requirement.parse('flowchart LR\n A --> B')).toBeNull()
    expect(requirement.parse('requirementDiagram\n  direction LR\n  a - derives -> b')).toBeNull()
    expect(requirement.parse('requirementDiagram\n  a - derives -> b\n  style a fill:#f9f')).toBeNull()
    expect(requirement.parse('requirementDiagram\n  a - likes -> b')).toBeNull()
    expect(requirement.parse('requirementDiagram\n  requirement a {\n    id: 1\n')).toBeNull()
    expect(requirement.render('pie\n "a": 1', light, fonts, 'r-0')).toBe('')
  })
})

describe('requirement render', () => {
  const svg = requirement.render(src, light, fonts, 'r-1')
  const model = JSON.parse(/<metadata class="requirement-model">([^<]*)<\/metadata>/.exec(svg)[1].replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'))

  test('a card per box and a line per relation', () => {
    expect(svg).toContain('aria-roledescription="requirement"')
    expect(svg.match(/class="node req-box"/g)).toHaveLength(4)
    expect(svg.match(/class="req-link relationshipLine"/g)).toHaveLength(4)
    expect(svg).toContain('id="r-1-req-func req-0"')
    expect(svg).toContain('data-from="func req" data-to="dc_req"')
  })

  test('loose relations are dashed, containment ends in a circle-plus', () => {
    expect(svg).toMatch(/data-from="func req" data-to="dc_req"[^>]*stroke-dasharray="5 4"/)
    expect(svg).toMatch(/data-from="test_req" data-to="func req"[^>]*marker-start="url\(#r-1-contains\)"/)
    expect(svg).toContain('>CONTAINS<')
  })

  test('high risk takes the accent', () => {
    expect(svg).toContain(`stroke="${light.accent}"`)
    expect(svg).toContain('>HIGH<')
  })

  test('geometry sits on the 4px grid', () => {
    const boxes = [...svg.matchAll(/class="node req-box"[^>]*translate\(([\d.]+),([\d.]+)\)/g)]
    boxes.forEach(([, x, y]) => {
      expect(Number(x) % 4).toBe(0)
      expect(Number(y) % 4).toBe(0)
    })
  })

  test('the model holds the fields and the relations', () => {
    expect(model.nodes.test_req).toMatchObject({kind: 'requirement', risk: 'high', verify: 'test', in: ['L-0'], out: ['L-1']})
    expect(model.links['L-2']).toEqual({from: 'func req', to: 'dc_req', type: 'traces'})
  })

  test('a cycle still draws', () => {
    const cyc = requirement.render('requirementDiagram\n  a - derives -> b\n  b - derives -> c\n  c - traces -> a\n', light, fonts, 'r-2')
    expect(cyc.match(/class="node req-box"/g)).toHaveLength(3)
    expect(cyc.match(/relationshipLine/g)).toHaveLength(3)
    expect(cyc).not.toContain('NaN')
  })
})
