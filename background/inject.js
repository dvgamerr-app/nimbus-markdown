
md.inject = ({storage: {state}}) => (id) => {

  chrome.scripting.executeScript({
    target: {tabId: id},
    args: [{
      theme: state.theme,
      raw: state.raw,
      themes: state.themes,
      content: state.content,
      compiler: state.compiler,
      custom: state.custom,
      icon: state.settings.icon,
    }],
    func: (_args) => {
      // tab updates can fire twice for one page: a second injection finds the page
      // already mounted (no pre) or already claimed, and would reset the running app
      var pre = document.querySelector('pre')
      if (!pre || window._mdInjected) {
        return false
      }
      window._mdInjected = true
      pre.style.visibility = 'hidden'
      args = _args
      return true
    },
    injectImmediately: true
  }).then((res) => {
    if (!res || !res[0] || !res[0].result) {
      return
    }

    chrome.scripting.insertCSS({
      target: {tabId: id},
      files: [
        '/content/index.css',
        '/content/themes.css',
      ]
    })

    chrome.scripting.executeScript({
      target: {tabId: id},
      files: [
        '/vendor/mithril.min.js',
        state.content.syntax && ['/vendor/prism.min.js', '/vendor/prism-autoloader.min.js', '/content/prism.js'],
        state.content.emoji && '/content/emoji.js',
        state.content.mermaid && ['/vendor/panzoom.min.js', '/content/draw.js', '/content/dbml.js', '/content/mermaid.js'],
        state.content.mathjax && ['/content/mathjax.js', '/vendor/mathjax/tex-mml-chtml.js'],
        '/content/index.js',
        '/content/scroll.js',
        state.content.autoreload && '/content/autoreload.js',
      ].filter(Boolean).flat(),
      injectImmediately: true
    })
  }, () => {
    // origin not allowed or tab closed
  })

}
