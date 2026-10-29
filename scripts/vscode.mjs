// Builds the VS Code extension in dist/vscode/ and, with `pack`, the .vsix beside it with vsce. The webview runs the
// scripts, stylesheets and themes of the Chrome build, so that build is made first and copied.
// usage: bun scripts/vscode.mjs [pack]
import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

const root = resolve(import.meta.dir, '..')
const src = (...p) => join(root, 'vscode', ...p)
const chrome = (...p) => join(root, 'dist', 'nimbus-markdown', ...p)
const out = (...p) => join(root, 'dist', 'vscode', ...p)

const run = async (cmd, cwd = root) => {
  const proc = Bun.spawn(cmd, {cwd, stdout: 'inherit', stderr: 'inherit'})
  if (await proc.exited) process.exit(1)
}

console.log('> chrome build')
await run(['bun', 'scripts/build.mjs', 'chrome'])

await rm(out(), {recursive: true, force: true})
await mkdir(out('web'), {recursive: true})

console.log('> web')
// the options and popup pages need these, the preview does not
const skip = /^(bootstrap|csso|mdc)/
for (const dir of ['content', 'themes', 'background']) await cp(chrome(dir), out('web', dir), {recursive: true})
await cp(chrome('vendor'), out('web', 'vendor'), {recursive: true, filter: (from) => !skip.test(from.split(/[\\/]/).pop())})
await cp(src('web', 'shim.js'), out('web', 'shim.js'))

// the github themes point at the extension origin for the anchor icon
for (const name of await readdir(out('web', 'themes'))) {
  const file = out('web', 'themes', name)
  const code = await readFile(file, 'utf8')
  if (code.includes('chrome-extension://')) await writeFile(file, code.replaceAll('chrome-extension://__MSG_@@extension_id__/', '../'))
}

console.log('> package')
await cp(src('extension.js'), out('extension.js'))
await cp(src('package.json'), out('package.json'))
await cp(src('README.md'), out('README.md'))
await cp(src('.vscodeignore'), out('.vscodeignore'))
await cp(join(root, 'icons/default/128x128.png'), out('icon.png'))
await cp(join(root, 'LICENSE'), out('LICENSE'))

if (process.argv[2] === 'pack') {
  console.log('> vsix')
  const vsce = join(root, 'node_modules/.bin/vsce')
  await run([vsce, 'package', '--no-dependencies', '--out', join(root, 'dist', 'nimbus-markdown-vscode.vsix')], out())
}
console.log('done')
