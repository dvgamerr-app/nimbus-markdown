// Opens Markdown files in a webview that runs the browser extension's own scripts and stylesheets (content/,
// themes/, vendor/), so VS Code shows exactly what Chrome shows. web/shim.js stands in for the chrome.* APIs.
const vscode = require('vscode')

const viewType = 'nimbusMarkdown.preview'

const scripts = [
  'vendor/markdown-it.min.js', 'vendor/ondine.min.js',
  'background/compilers/markdown-it.js', 'background/mathjax.js', 'background/ondine.js',
  'shim.js',
  'vendor/mithril.min.js',
  'vendor/prism.min.js', 'vendor/prism-autoloader.min.js', 'content/prism.js',
  'content/emoji.js',
  'vendor/panzoom.min.js', 'content/draw.js', 'content/dbml.js', 'content/journey.js', 'content/timeline.js',
  'content/gantt.js', 'content/pie.js', 'content/quadrant.js', 'content/requirement.js', 'content/gitgraph.js',
  'content/c4.js', 'content/mindmap.js', 'content/mermaid.js',
  'content/mathjax.js', 'vendor/mathjax/tex-mml-chtml.js',
  'content/index.js', 'content/scroll.js',
]
// the Nimbus themes read their colors from --nb-* tokens, point them at the VS Code colors (html:root wins over :root)
const colors = `html:root {
  --nb-background: var(--vscode-editor-background);
  --nb-foreground: var(--vscode-editor-foreground);
  --nb-card: var(--vscode-editorWidget-background, var(--vscode-editor-background));
  --nb-muted: var(--vscode-textCodeBlock-background);
  --nb-muted-foreground: var(--vscode-descriptionForeground);
  --nb-border: var(--vscode-editorWidget-border, var(--vscode-panel-border));
}
/* the webview default rings a focused link in --vscode-focusBorder, a click leaves the link focused and a key press shows it */
#_toc :focus, #_toc :focus-visible { outline: none !important; box-shadow: none !important; }
#_toc ._toc-list a:focus, #_toc ._toc-list a:focus-visible { border-top: 0 !important; border-right: 0 !important; border-bottom: 0 !important; }`
const styles = ['content/index.css', 'content/themes.css']

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const theme = () => {
  const name = vscode.workspace.getConfiguration('nimbusMarkdown').get('theme', 'auto')
  if (name !== 'auto') return name
  const kind = vscode.window.activeColorTheme.kind
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight ? 'nimbus' : 'nimbus-dark'
}

class Provider {
  constructor (context) {
    this.root = vscode.Uri.joinPath(context.extensionUri, 'web')
  }

  resolveCustomTextEditor (document, panel) {
    const {webview} = panel
    const dir = vscode.Uri.joinPath(document.uri, '..')
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.root, dir, ...(vscode.workspace.workspaceFolders || []).map((f) => f.uri)],
    }
    webview.html = this.html(webview, document, dir)

    const post = (message) => webview.postMessage(message)
    let timer
    const subs = [
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== document.uri.toString()) return
        clearTimeout(timer)
        timer = setTimeout(() => post({type: 'markdown', text: document.getText()}), 150)
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('nimbusMarkdown')) post({type: 'theme', theme: theme()})
      }),
      vscode.window.onDidChangeActiveColorTheme(() => post({type: 'theme', theme: theme()})),
      webview.onDidReceiveMessage((msg) => {
        if (msg.type !== 'open') return
        const target = vscode.Uri.joinPath(dir, decodeURIComponent(msg.href.split('#')[0]))
        vscode.commands.executeCommand('vscode.open', target)
      }),
    ]
    panel.onDidDispose(() => {
      clearTimeout(timer)
      subs.forEach((s) => s.dispose())
    })
  }

  html (webview, document, dir) {
    const uri = (path) => webview.asWebviewUri(vscode.Uri.joinPath(this.root, path))
    const cs = webview.cspSource
    const config = {
      base: uri('').toString().replace(/\/$/, ''),
      docBase: webview.asWebviewUri(dir).toString() + '/',
      path: document.uri.path,
      theme: theme(),
    }
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cs} https: data: blob:; style-src ${cs} 'unsafe-inline'; font-src ${cs} data:; script-src ${cs} 'wasm-unsafe-eval'; connect-src ${cs}">
${styles.map((s) => `<link rel="stylesheet" href="${uri(s)}">`).join('\n')}
<style>${colors}</style>
<script id="nimbus-config" type="application/json">${JSON.stringify(config)}</script>
</head>
<body>
<pre>${escape(document.getText())}</pre>
${scripts.map((s) => `<script src="${uri(s)}"></script>`).join('\n')}
</body>
</html>`
  }
}

exports.activate = (context) => {
  const toggle = () => vscode.commands.executeCommand('workbench.action.toggleEditorType')
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(viewType, new Provider(context), {
      webviewOptions: {retainContextWhenHidden: true},
    }),
    vscode.commands.registerCommand('nimbusMarkdown.showSource', toggle),
    vscode.commands.registerCommand('nimbusMarkdown.showPreview', toggle),
  )
}
