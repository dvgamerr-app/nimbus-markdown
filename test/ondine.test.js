import {describe, expect, test} from 'bun:test'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {create} from 'ondine/compiler/wasm'
import {load} from './load.js'

const wasm = readFileSync(join(import.meta.dir, '..', 'node_modules/ondine/dist/internal/all.generated.wasm'))
const fetch = async () => ({arrayBuffer: async () => wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength)})
const md = {}
load('background/ondine.js', [], {md, fetch, ondine: {create}, WebAssembly, chrome: {runtime: {getURL: (path) => path}}})
const renderer = md.ondine()

describe('ondine', () => {
  test('draws a diagram as svg', async () => {
    const {svg, type} = await renderer.render('flowchart LR\n  A --> B')
    expect(type).toBe('flowchart')
    expect(svg).toContain('<svg')
    expect(svg).toContain('--ondine-fg')
  })

  test('draws every type the extension documents', async () => {
    for (const source of ['sequenceDiagram\n  A->>B: hi', 'classDiagram\n  A <|-- B', 'pie\n  "a": 1', 'gantt\n  section s\n  t :2026-01-01, 3d', 'erDiagram\n  A ||--o{ B : has']) {
      expect((await renderer.render(source)).svg).toContain('<svg')
    }
  })

  test('answers a broken diagram with its error instead of throwing', async () => {
    const {svg, error} = await renderer.render('flowchart LR\n  A --> --> B [')
    expect(svg).toBeUndefined()
    expect(error).toContain('Parse error')
  })
})
