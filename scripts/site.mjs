// assembles the GitHub Pages site into _site: the landing page, its media and the live demo
// usage: bun run build:dist && bun scripts/site.mjs [outdir]
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = process.argv[2] || join(root, '_site')
const dist = join(root, 'dist', 'nimbus-markdown')
if (!existsSync(join(dist, 'content', 'mermaid.js'))) {
  console.error('dist/nimbus-markdown is missing, run bun run build:dist first')
  process.exit(1)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'screenshots'), { recursive: true })
cpSync(join(root, 'site'), out, { recursive: true })

const shots = join(root, 'docs', 'screenshots')
readdirSync(shots)
  .filter((name) => /^0.*\.png$|^fullscreen-.*\.mp4$|^poster-.*\.jpg$/.test(name))
  .forEach((name) => cpSync(join(shots, name), join(out, 'screenshots', name)))

// visit sessions and click actions through Traceway, only when a browser DSN (<ingest token>@<instance>/api/report) is given at build time
const dsn = (process.env.PUBLIC_TRACEWAY_DSN || '').trim()
const page = join(out, 'index.html')
let html = readFileSync(page, 'utf8')
if (dsn.includes('@')) {
  cpSync(join(root, 'node_modules', '@tracewayapp', 'frontend', 'dist', 'traceway.iife.global.js'), join(out, 'traceway.js'))
  const attr = dsn.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  html = html
    .replace('<!-- traceway -->', `<meta name="traceway-dsn" content="${attr}">\n<script src="traceway.js" defer></script>\n<script src="track.js" defer></script>`)
    .replace('<!-- traceway-faq -->', '        <details><summary>Does this website track me?</summary><p>This page uses Traceway, a self-hosted service, to record each visit as an anonymous session: the page address, referrer, IP address, browser and screen size, plus a replay of how the page is used and which buttons are clicked. It sets no cookies and has no sign-in or forms. The extension itself is not tracked at all.</p></details>')
} else {
  rmSync(join(out, 'track.js'))
  html = html.replace('<!-- traceway -->\n', '').replace('<!-- traceway-faq -->\n', '')
}
writeFileSync(page, html)

cpSync(join(root, 'icons', 'default', '128x128.png'), join(out, 'icon.png'))
cpSync(join(root, 'docs', 'store', 'marquee-promo-1280x640.png'), join(out, 'og.png'))

// the demo runs the built extension renderer unchanged: the same files background/inject.js injects for mermaid
const ext = join(out, 'demo', 'ext')
;[
  'content/index.css', 'content/themes.css', 'themes/nimbus.css', 'themes/nimbus-dark.css',
  'vendor/ondine.min.js', 'vendor/ondine.wasm', 'vendor/panzoom.min.js', 'background/ondine.js',
  ...['draw', 'dbml', 'mermaid']
    .map((name) => `content/${name}.js`)
].forEach((file) => {
  mkdirSync(dirname(join(ext, file)), { recursive: true })
  cpSync(join(dist, file), join(ext, file))
})
console.log(`site assembled in ${out}`)
