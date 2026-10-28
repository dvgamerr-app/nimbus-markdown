// Mermaid source -> svg. The Ondine compiler is webassembly, which the extension pages and the worker may run
// under the default extension CSP, a content script on a page with a strict CSP may not
md.ondine = () => {
  var renderer = null

  var load = () => {
    renderer = renderer || fetch(chrome.runtime.getURL('/vendor/ondine.wasm'))
      .then((res) => res.arrayBuffer())
      .then((bytes) => WebAssembly.compile(bytes))
      .then((all) => ondine.create({modules: {all}}))
    return renderer
  }

  return {
    render: (source, options) =>
      load().then(
        (compiler) => {
          var {svg, type} = compiler.render(source, options)
          return {svg, type}
        },
        (err) => ({error: String(err && err.message || err)})
      )
        .catch((err) => ({error: String(err && err.message || err)}))
  }
}
