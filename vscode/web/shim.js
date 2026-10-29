// Lets the browser extension's content scripts run in a VS Code webview: stands in for the chrome.* APIs they
// call and plays the role of the background worker (markdown compile, Ondine, Prism and MathJax lazy loads).
(() => {
  var config = JSON.parse(document.getElementById('nimbus-config').textContent)
  var vscode = acquireVsCodeApi()
  var listeners = []
  var store = {}

  // a webview shares its origin between documents, keep the scroll position of each one apart
  try {
    history.replaceState(null, '', '/' + encodeURIComponent(config.path))
  }
  catch (err) {}

  window.args = {
    theme: config.theme,
    raw: false,
    themes: {width: 'auto'},
    content: {autoreload: false, emoji: true, mathjax: true, mermaid: true, syntax: true, toc: true},
    compiler: 'markdown-it',
    custom: {theme: '', color: 'auto'},
    icon: 'default',
  }

  var script = (path) => new Promise((resolve) => {
    var el = document.createElement('script')
    el.src = config.base + path
    el.onload = el.onerror = () => resolve()
    document.head.appendChild(el)
  })

  var absolute = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i
  var images = (html) =>
    html.replace(/(<img\s[^>]*?\ssrc=")([^"]+)"/gi, (tag, head, src) =>
      absolute.test(src) ? tag : head + new URL(src, config.docBase).href + '"')

  var compiler = md.compilers['markdown-it']({storage: {state: {'markdown-it': md.compilers['markdown-it'].defaults}}})
  var mathjax = md.mathjax()
  var ondine = md.ondine()

  var handlers = {
    markdown: (req) => {
      var jax = mathjax()
      var html = jax.detokenize(compiler.compile(jax.tokenize(req.markdown)))
      return {message: 'html', html: images(html)}
    },
    ondine: (req) => ondine.render(req.source, req.options),
    prism: (req) => script(`/vendor/prism/prism-${req.language}.min.js`),
    mathjax: (req) => script(`/vendor/mathjax/extensions/${req.extension}.js`),
  }

  window.chrome = {
    runtime: {
      id: 'nimbus-markdown',
      lastError: undefined,
      getURL: (path) => config.base + path,
      onMessage: {addListener: (fn) => listeners.push(fn)},
      sendMessage: (req, done) => {
        var handler = handlers[req.message]
        var result = handler ? Promise.resolve(handler(req)) : Promise.resolve()
        return result.then((res) => (done && done(res), res))
      },
    },
    storage: {
      local: {
        get: (key, done) => done({[key]: store[key]}),
        set: (items) => Object.assign(store, items),
      },
    },
  }

  window.addEventListener('message', ({data}) => {
    if (data.type === 'markdown') render(data.text)
    else if (data.type === 'theme') listeners.forEach((fn) => fn({message: 'theme', theme: data.theme}))
  })

  // relative links open the other file in VS Code
  document.addEventListener('click', (e) => {
    var link = e.target.closest && e.target.closest('a[href]')
    var href = link && link.getAttribute('href')
    if (!href || absolute.test(href)) return
    e.preventDefault()
    vscode.postMessage({type: 'open', href})
  })
})()
