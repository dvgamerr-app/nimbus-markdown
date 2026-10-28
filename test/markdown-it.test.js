import {describe, expect, test} from 'bun:test'
import '../scripts/entries/markdown-it.mjs'
import {load} from './load.js'

const {md} = load('background/compilers/markdown-it.js', ['md'], {mdit: globalThis.mdit})
const defaults = md.compilers['markdown-it']({storage: {state: {}}}).defaults
const compile = (markdown) => md.compilers['markdown-it']({storage: {state: {'markdown-it': defaults}}}).compile(markdown)

describe('markdown-it compiler', () => {
  test('wraps a table in a box that scrolls it', () => {
    const html = compile('| a | b |\n| - | - |\n| 1 | 2 |\n')
    expect(html).toMatch(/^<div class="table-scroll"><table>[\s\S]*<\/table>\s*<\/div>\s*$/)
  })

  test('wraps every table on its own', () => {
    const html = compile('| a |\n| - |\n| 1 |\n\ntext\n\n| b |\n| - |\n| 2 |\n')
    expect(html.match(/<div class="table-scroll">/g)).toHaveLength(2)
    expect(html.match(/<\/table>\s*<\/div>/g)).toHaveLength(2)
  })
})
