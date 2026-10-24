// Builds the unpacked extension in dist/nimbus-markdown/, and dist/nimbus-markdown-<browser>.zip with `zip`.
// usage: bun scripts/build.mjs [chrome|firefox] [themes|zip]
import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'
import {zipSync} from 'fflate'
import {minify as terser} from 'terser'
import {minify as csso} from 'csso'
import * as sass from 'sass'

const browser = process.argv[2] || 'chrome'
const themesOnly = process.argv[3] === 'themes'
const withZip = process.argv[3] === 'zip'
if (!['chrome', 'firefox'].includes(browser)) {
  console.error('Specify target browser: chrome, firefox')
  process.exit(1)
}

const here = import.meta.dir
const root = resolve(here, '..')
const mod = (...p) => join(root, 'node_modules', ...p)
const dist = (...p) => join(root, 'dist', ...p)
const out = (...p) => dist('nimbus-markdown', ...p)
const vendor = (...p) => out('vendor', ...p)
const themes = (...p) => out('themes', ...p)
const read = (file) => readFile(file, 'utf8')
const step = (name) => console.log(`> ${name}`)

const js = async (code) => (await terser(code, {compress: true, mangle: true})).code
const css = (code) => csso(code).css

// replace the first occurrence, failing loudly when an upstream update moves the target
const patch = (code, from, to, label) => {
  if (!code.includes(from)) throw new Error(`patch target missing in ${label}: ${from}`)
  return code.replace(from, to)
}

const bundle = async (entry) => {
  const result = await Bun.build({entrypoints: [join(here, 'entries', entry)], target: 'browser', format: 'iife'})
  if (!result.success) throw new AggregateError(result.logs, `bundle ${entry} failed`)
  return result.outputs[0].text()
}

const copyDir = async (from, to, filter) => {
  await mkdir(to, {recursive: true})
  for (const name of await readdir(from)) {
    if (filter(name)) await cp(join(from, name), join(to, name))
  }
}

async function buildVendor () {
  await mkdir(vendor(), {recursive: true})

  step('bootstrap, csso, mithril, panzoom')
  await cp(mod('bootstrap/dist/css/bootstrap.min.css'), vendor('bootstrap.min.css'))
  await cp(mod('csso/dist/csso.js'), vendor('csso.min.js'))
  await cp(mod('mithril/mithril.min.js'), vendor('mithril.min.js'))
  await cp(mod('@panzoom/panzoom/dist/panzoom.min.js'), vendor('panzoom.min.js'))

  step('markdown-it')
  await writeFile(vendor('markdown-it.min.js'), await js(await bundle('markdown-it.mjs')))

  step('mdc')
  await writeFile(vendor('mdc.min.js'), await js(await bundle('mdc.mjs')))
  const mdc = sass.compile(join(here, 'entries/mdc.scss'), {
    loadPaths: [mod()],
    quietDeps: true,
    sourceMap: false,
  })
  await writeFile(vendor('mdc.min.css'), css(mdc.css))

  step('mathjax')
  const mj = mod('mathjax/es5')
  await mkdir(vendor('mathjax'), {recursive: true})
  // Chrome Web Store rejects MV3 packages that mention remote code URLs. MathJax's speech-rule-engine only
  // fetches these from jsDelivr for speech/IE fallbacks, which we never use, so drop the host.
  const mathjax = (await read(join(mj, 'tex-mml-chtml.js'))).replaceAll('https://cdn.jsdelivr.net/npm/', '')
  await writeFile(vendor('mathjax/tex-mml-chtml.js'), mathjax)
  await copyDir(join(mj, 'input/tex/extensions'), vendor('mathjax/extensions'), (n) => n.endsWith('.js'))
  await copyDir(join(mj, 'output/chtml/fonts/woff-v2'), vendor('mathjax/fonts'), (n) => n.endsWith('.woff'))

  step('mermaid')
  // https://github.com/mermaid-js/mermaid/issues/5378
  // https://discourse.mozilla.org/t/cannot-inject-a-javascript-file-because-of-a-csp-limitations/128649
  const mermaid = patch(
    await read(mod('mermaid/dist/mermaid.min.js')),
    'Function("return this")',
    '(() => globalThis)',
    'mermaid.min.js'
  ).replaceAll('Function("return this")', '(() => globalThis)')
  await writeFile(vendor('mermaid.min.js'), mermaid)

  step('prism')
  const prism = mod('prismjs')
  await writeFile(vendor('prism.min.js'), await js(await read(join(prism, 'prism.js'))))
  // https://github.com/PrismJS/prism/issues/3654
  const autoloader = patch(
    await read(join(prism, 'plugins/autoloader/prism-autoloader.js')),
    'addScript(getLanguagePath(lang), function () {',
    'Prism.plugins.autoloader.addScript(lang, function () {',
    'prism-autoloader.js'
  )
  await writeFile(vendor('prism-autoloader.min.js'), await js(autoloader))
  // the page theme owns background, radius, padding and margin of code blocks
  const strip = (code, parts) => parts.reduce((res, p) => res.replace(p, ''), code)
  const common = ['background:0 0;', 'border-radius:.3em', 'padding:1em;', 'margin:.5em 0;']
  await writeFile(vendor('prism.min.css'), strip(css(await read(join(prism, 'themes/prism.css'))),
    [...common, 'background:#f5f2f0', 'background:rgba(255,255,255,.5)']))
  await writeFile(vendor('prism-okaidia.min.css'), strip(css(await read(join(prism, 'themes/prism-okaidia.css'))),
    [...common, 'background:#272822']))
  await copyDir(join(prism, 'components'), vendor('prism'), (n) => /^prism-.*\.min\.js$/.test(n))
}

// theme name -> path of the stylesheet inside cleanrmd/inst/resources
const cleanrmd = {
  almond: 'almond/almond',
  awsm: 'awsm.css/awsm',
  axist: 'axist/axist',
  bamboo: 'bamboo/bamboo',
  bullframe: 'bullframe/bullframe',
  holiday: 'holiday/holiday',
  kacit: 'kacit/kacit',
  latex: 'latex.css/latex',
  modest: 'markdown-modest/markdown-modest',
  retro: 'markdown-retro/markdown-retro',
  marx: 'marx/marx',
  mini: 'minicss/minicss',
  new: 'new.css/new',
  'no-class': 'no-class/no-class',
  pico: 'picocss/pico',
  sakura: 'sakura/sakura',
  'sakura-vader': 'sakura-vader/sakura-vader',
  semantic: 'semantic/semantic',
  simple: 'simplecss/simple',
  'style-sans': 'style-sans/style-sans',
  'style-serif': 'style-serif/style-serif',
  stylize: 'stylize/stylize',
  superstylin: 'superstylin/superstylin',
  tacit: 'tacit/tacit',
  vanilla: 'vanilla/vanilla',
  water: 'water/water',
  'water-dark': 'water-dark/water-dark',
  writ: 'writ/writ',
}

async function buildThemes () {
  step('themes')
  await mkdir(themes(), {recursive: true})
  const write = (name, code) => writeFile(themes(`${name}.css`), code)

  const prefix = {chrome: 'chrome', firefox: 'moz'}[browser]
  const anchor = `mask-image:url("${prefix}-extension://__MSG_@@extension_id__/content/anchor.svg")`
  for (const [name, file] of [['github', 'light'], ['github-dark', 'dark']]) {
    const code = css(await read(mod('github-markdown-css', `github-markdown-${file}.css`)))
    await write(name, code.replaceAll(/mask-image:url\(".*?"\)/g, anchor))
  }

  const base = await read(join(here, 'nimbus/base.css'))
  await write('nimbus', css((await read(join(here, 'nimbus/light.css'))) + base))
  await write('nimbus-dark', css((await read(join(here, 'nimbus/dark.css'))) + base))

  for (const [name, src] of Object.entries(cleanrmd)) {
    await write(name, css(await read(mod('cleanrmd/inst/resources', `${src}.css`))))
  }

  const fix = async (name, edit) => write(name, edit(await read(themes(`${name}.css`))))
  await fix('mini', (c) => patch(patch(c, '*,h5', 'body', 'mini.css'), '*,html', 'body', 'mini.css'))
  await fix('latex', (c) => patch(c, 'scroll-behavior:smooth', '', 'latex.css'))
  await fix('simple', (c) => patch(c, 'scroll-behavior:smooth', '', 'simple.css'))
}

async function buildPackage () {
  step('dist')
  for (const name of ['background', 'content', 'icons', 'options', 'popup', 'LICENSE']) {
    await cp(join(root, name), out(name), {recursive: true})
  }
  await cp(join(root, `manifest.${browser}.json`), out('manifest.json'))
}

async function buildZip () {
  step('zip')
  const zip = dist(`nimbus-markdown-${browser}.zip`)
  await rm(zip, {force: true})
  const files = {}
  const walk = async (dir, rel) => {
    for (const entry of await readdir(dir, {withFileTypes: true})) {
      const name = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(join(dir, entry.name), name)
      else files[name] = new Uint8Array(await readFile(join(dir, entry.name)))
    }
  }
  // chrome archives the folder itself, firefox archives its contents
  await walk(out(), browser === 'chrome' ? 'nimbus-markdown' : '')
  await writeFile(zip, zipSync(files, {level: 9}))
}

if (themesOnly) {
  await rm(themes(), {recursive: true, force: true})
  await buildThemes()
} else {
  await rm(out(), {recursive: true, force: true})
  await buildVendor()
  await buildThemes()
  await buildPackage()
  if (withZip) await buildZip()
}
console.log('done')
