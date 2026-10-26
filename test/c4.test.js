import {describe, expect, test} from 'bun:test'
import {load} from './load.js'

const {c4} = load(['content/draw.js', 'content/c4.js'], ['c4'])
const light = {paper: '#f5f5f5', node: '#fff', ink: '#2d3142', muted: '#4f5d75', soft: '#7a8399', rule: 'rgba(0,0,0,.1)', ruleSolid: '#bfc0c0', accent: '#eb6c36', accentTint: 'rgba(235,108,54,.08)', accentText: '#bf4520', danger: '#c0401f', inkRgb: '45,49,66'}
const fonts = {sans: 'sans-serif', mono: 'monospace'}

const context = `C4Context
  title System Context
  Enterprise_Boundary(b0, "Bank, Inc") {
    Person(customer, "Customer", "A customer, of the bank.")
    Person_Ext(other, "Other")
    System(core, "Internet Banking", "Views accounts.")
    System_Boundary(b1, "Inner") {
      SystemDb_Ext(main, "Mainframe", "Stores data.")
      SystemQueue(q, "Queue")
    }
  }
  BiRel(customer, core, "Uses")
  Rel(core, main, "Reads", "JDBC")
  Rel_Back(q, core, "Feeds")
  UpdateRelStyle(customer, core, $textColor="blue", $lineColor="blue", $offsetX="5")
  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
`

describe('c4 parse', () => {
  const model = c4.parse(context)

  test('kind, title and layout config', () => {
    expect(model.kind).toBe('C4Context')
    expect(model.title).toBe('System Context')
    expect(model.shapeInRow).toBe(3)
    expect(model.boundaryInRow).toBe(1)
  })

  test('boundaries nest and quoted commas stay in one argument', () => {
    const b0 = model.root.children[0]
    expect(b0).toMatchObject({type: 'boundary', alias: 'b0', label: 'Bank, Inc', kind: 'enterprise'})
    expect(b0.children.map((c) => c.alias)).toEqual(['customer', 'other', 'core', 'b1'])
    expect(b0.children[3].children.map((c) => c.alias)).toEqual(['main', 'q'])
    expect(b0.children[0].descr).toBe('A customer, of the bank.')
  })

  test('shapes: kind, store and external', () => {
    const main = model.elements.find((e) => e.alias === 'main')
    expect(main).toMatchObject({kind: 'system', store: 'db', ext: true})
    expect(model.elements.find((e) => e.alias === 'other').ext).toBe(true)
    expect(model.elements.find((e) => e.alias === 'q').store).toBe('queue')
  })

  test('relations: bi, back, technology and style', () => {
    expect(model.rels[0]).toMatchObject({from: 'customer', to: 'core', bi: true, lineColor: 'blue', textColor: 'blue'})
    expect(model.rels[1]).toMatchObject({label: 'Reads', techn: 'JDBC'})
    expect(model.rels[2]).toMatchObject({from: 'core', to: 'q'})
  })

  test('containers, components, deployment nodes and indexed relations', () => {
    const m = c4.parse(`C4Deployment
      Deployment_Node(dc, "DC", "Kubernetes") {
        Container(api, "API", "Bun", "Service")
      }
      Node(ext, "External", "SaaS") {
        ComponentDb_Ext(db, "DB", "Postgres", "Data")
      }
      RelIndex(1, api, db, "Reads", "SQL")`)
    expect(m.root.children[0]).toMatchObject({node: true, kind: 'Kubernetes'})
    expect(m.elements[0]).toMatchObject({kind: 'container', techn: 'Bun', descr: 'Service'})
    expect(m.elements[1]).toMatchObject({kind: 'component', store: 'db', ext: true})
    expect(m.rels[0]).toMatchObject({index: '1', from: 'api', to: 'db', techn: 'SQL'})
  })

  test('anything else is left to mermaid', () => {
    expect(c4.parse('flowchart LR\n A --> B')).toBeNull()
    expect(c4.parse('C4Context\n  title only')).toBeNull()
    expect(c4.render('pie\n "a": 1', light, fonts, 'c-0')).toBe('')
  })
})

describe('c4 render', () => {
  const svg = c4.render(context, light, fonts, 'c-1')

  test('a node per element, a frame per boundary, a line per relation', () => {
    expect(svg).toContain('aria-roledescription="c4"')
    expect(svg.match(/class="node c4-node"/g)).toHaveLength(5)
    expect(svg.match(/class="c4-boundary"/g)).toHaveLength(2)
    expect(svg.match(/class="c4-rel relationshipLine"/g)).toHaveLength(3)
    expect(svg).toContain('id="c-1-c4-core-0"')
    expect(svg).toContain('data-from="core" data-to="main"')
  })

  test('lines are orthogonal', () => {
    const paths = [...svg.matchAll(/class="c4-rel relationshipLine"[^>]* d="([^"]+)"/g)].map((m) => m[1])
    paths.forEach((d) => {
      const pts = [...d.matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map((m) => [+m[1], +m[2]])
      for (let i = 1; i < pts.length; i++) {
        // between the rounded corners every run is straight
        if (Math.abs(pts[i][0] - pts[i - 1][0]) > 9 && Math.abs(pts[i][1] - pts[i - 1][1]) > 9) throw new Error('diagonal in ' + d)
      }
    })
  })

  test('the system in scope takes the accent, a bi relation has two heads, a styled line keeps its colour', () => {
    expect(svg).toMatch(/id="c-1-c4-core-0"[\s\S]*?stroke="#eb6c36"/)
    expect(svg).toMatch(/data-from="customer"[^>]*marker-start/)
    expect(svg).toContain('stroke="blue"')
  })

  test('the model the viewer reads', () => {
    const meta = JSON.parse(svg.match(/<metadata class="c4-model">([\s\S]*?)<\/metadata>/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
    expect(meta.nodes.core).toMatchObject({name: 'Internet Banking', focal: true})
    expect(Object.keys(meta.links)).toHaveLength(3)
  })
})
