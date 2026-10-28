import {describe, expect, test} from 'bun:test'
import {readFileSync} from 'node:fs'

const doc = readFileSync(new URL('../docs/design-system.html', import.meta.url), 'utf8')
const source = readFileSync(new URL('../content/mermaid.js', import.meta.url), 'utf8')

describe('design system page', () => {
  test('every swatch color is a token in mermaid.js', () => {
    const colors = [...doc.matchAll(/<span>([^<]*)<\/span>/g)].flatMap((m) => m[1].match(/#[0-9a-f]{6}/gi) || [])
    expect(colors.length).toBeGreaterThan(20)
    for (const color of colors) expect(source.toLowerCase()).toContain(color.toLowerCase())
  })

  test('dark accent roles that carry a state are told apart', () => {
    const dark = source.slice(source.indexOf('dark: {'))
    const get = (key) => new RegExp(key + ": '(#[0-9a-f]{6})'").exec(dark)[1]
    expect(get('flowOut')).not.toBe(get('flowIn'))
    expect(get('link')).not.toBe(get('accent'))
  })
})
