import {describe, expect, test} from 'bun:test'
import {load} from './load.js'

const {gitgraph} = load(['content/draw.js', 'content/gitgraph.js'], ['gitgraph'])
const light = {paper: '#f5f5f5', paper2: '#ececec', node: '#fff', ink: '#2d3142', muted: '#4f5d75', soft: '#7a8399', rule: 'rgba(0,0,0,.1)', ruleSolid: '#bfc0c0', accent: '#eb6c36', accentTint: 'rgba(235,108,54,.08)', accentText: '#bf4520', danger: '#c0401f', inkRgb: '45,49,66', series: ['#7c8f6f', '#5e7a9b', '#b8915a', '#9c6b50', '#6e6479']}
const fonts = {sans: 'sans-serif', mono: 'monospace'}

const src = `gitGraph
  commit id: "init"
  commit tag: "v0.1"
  branch develop
  checkout develop
  commit id: "dev1"
  commit type: HIGHLIGHT
  branch feature/x order: 3
  checkout feature/x
  commit type: REVERSE
  commit
  checkout develop
  merge feature/x
  checkout main
  cherry-pick id: "dev1"
  merge develop tag: "v1.0" type: HIGHLIGHT
  commit type: NORMAL
`

const info = (svg) => JSON.parse(/<metadata class="gitgraph-model">(.*?)<\/metadata>/.exec(svg)[1].replace(/&quot;/g, '"'))

describe('gitgraph parse', () => {
  test('commits, branches, merges and picks', () => {
    const model = gitgraph.parse(src)
    expect(model.dir).toBe('LR')
    expect(model.branches.map((b) => b.name)).toEqual(['main', 'develop', 'feature/x'])
    expect(model.branches[2].order).toBe(3)
    expect(model.commits).toHaveLength(10)
    expect(model.commits[0]).toMatchObject({id: 'init', branch: 'main', type: 'NORMAL', parents: []})
    expect(model.commits[1].tag).toBe('v0.1')
    expect(model.commits[2]).toMatchObject({id: 'dev1', branch: 'develop', parents: [model.commits[1].id]})
    expect(model.commits[3].type).toBe('HIGHLIGHT')
    expect(model.commits[4]).toMatchObject({branch: 'feature/x', type: 'REVERSE'})
    expect(model.commits[6]).toMatchObject({branch: 'develop', merge: 'feature/x', parents: [model.commits[3].id, model.commits[5].id]})
    expect(model.commits[7]).toMatchObject({branch: 'main', cherry: 'dev1'})
    expect(model.commits[8]).toMatchObject({merge: 'develop', tag: 'v1.0', type: 'HIGHLIGHT'})
  })

  test('generated ids are stable between parses', () => {
    expect(gitgraph.parse(src).commits[1].id).toBe(gitgraph.parse(src).commits[1].id)
    expect(gitgraph.parse(src).commits[1].id).toMatch(/^1-[0-9a-f]{7}$/)
  })

  test('direction, switch and a front matter title', () => {
    const model = gitgraph.parse('---\ntitle: Train\n---\ngitGraph TB:\n  commit\n  branch b\n  switch main\n  commit')
    expect(model.title).toBe('Train')
    expect(model.dir).toBe('TB')
    expect(model.commits.map((c) => c.branch)).toEqual(['main', 'main'])
  })

  test('anything else is left to mermaid', () => {
    expect(gitgraph.parse('flowchart LR\n A --> B')).toBeNull()
    expect(gitgraph.parse('gitGraph')).toBeNull()
    expect(gitgraph.parse('gitGraph BT:\n  commit')).toBeNull()
    expect(gitgraph.parse('gitGraph\n  commit\n  checkout nowhere')).toBeNull()
    expect(gitgraph.parse('gitGraph\n  commit\n  merge main')).toBeNull()
    expect(gitgraph.parse('gitGraph\n  commit id: "a"\n  commit id: "a"')).toBeNull()
    expect(gitgraph.parse('gitGraph\n  commit type: WEIRD')).toBeNull()
    expect(gitgraph.parse('gitGraph\n  commit\n  cherry-pick id: "nope"')).toBeNull()
    expect(gitgraph.parse('%%{init: {"gitGraph": {"showBranches": false}}}%%\ngitGraph\n  commit')).toBeNull()
    expect(gitgraph.parse('---\nconfig:\n  gitGraph:\n    mainBranchName: trunk\n---\ngitGraph\n  commit')).toBeNull()
    expect(gitgraph.render('pie\n "a": 1', light, fonts, 'g-0')).toBe('')
  })
})

describe('gitgraph render', () => {
  const svg = gitgraph.render(src, light, fonts, 'g-1')

  test('edges name commits by the same key as the nodes, ids that clean alike stay apart', () => {
    const odd = gitgraph.render('gitGraph\n  commit id: "v1.0"\n  commit id: "a b"\n  commit id: "a_b"', light, fonts, 'g-9')
    expect(odd).toContain('id="g-9-git-v1_0-0"')
    expect(odd).toContain('id="g-9-git-a_b-0"')
    expect(odd).toContain('id="g-9-git-a_b_2-0"')
    expect(odd).toContain('data-from="v1_0" data-to="a_b"')
    expect(odd).toContain('data-from="a_b" data-to="a_b_2"')
  })

  test('a node per commit, a lane per branch', () => {
    expect(svg).toContain('aria-roledescription="gitGraph"')
    expect(svg.match(/class="node git-commit"/g)).toHaveLength(10)
    expect(svg.match(/class="git-branch"/g)).toHaveLength(3)
    expect(svg).toContain('id="g-1-git-dev1-0"')
    expect(svg).toContain('<title>Git graph</title>')
  })

  test('branch-offs and merges are rounded right angles, a pick is dashed', () => {
    const lines = svg.match(/<path class="git-line relationshipLine"[^>]*>/g)
    // nine first-parent links, two merges, one pick
    expect(lines).toHaveLength(12)
    const bent = lines.filter((l) => /data-kind="(branch|merge|cherry)"/.test(l))
    expect(bent).toHaveLength(5)
    bent.forEach((l) => expect(l).toMatch(/Q/))
    expect(lines.filter((l) => l.includes('stroke-dasharray="4 3"'))).toHaveLength(1)
  })

  test('main is ink, the accent only marks highlights and tags', () => {
    expect(svg).toContain('fill="#2d3142"')
    expect(svg.match(/class="git-tag"/g)).toHaveLength(2)
    const branchLines = svg.match(/data-kind="(line|branch|merge)"[^>]*stroke="([^"]+)"/g).map((l) => /stroke="([^"]+)"/.exec(l)[1])
    expect(branchLines).not.toContain(light.accent)
  })

  test('the model rides along for the popup', () => {
    const model = info(svg)
    expect(model.branches).toEqual(['main', 'develop', 'feature/x'])
    expect(model.nodes.dev1).toMatchObject({name: 'dev1', branch: 'develop', n: 3})
  })

  test('top to bottom draws the same graph', () => {
    const tb = gitgraph.render(src.replace('gitGraph', 'gitGraph TB:'), light, fonts, 'g-2')
    expect(tb.match(/class="node git-commit"/g)).toHaveLength(10)
    expect(info(tb).dir).toBe('TB')
  })
})
