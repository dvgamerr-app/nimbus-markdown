
// chrome loads the scripts in the service worker, firefox loads them from background.scripts
if (typeof importScripts === 'function') {
  importScripts('/vendor/markdown-it.min.js')
  importScripts('/vendor/ondine.min.js')
  importScripts('/background/compilers/markdown-it.js')

  importScripts('/background/storage.js')
  importScripts('/background/webrequest.js')
  importScripts('/background/detect.js')
  importScripts('/background/inject.js')
  importScripts('/background/messages.js')
  importScripts('/background/mathjax.js')
  importScripts('/background/xhr.js')
  importScripts('/background/ondine.js')
  importScripts('/background/icon.js')
}

;(() => {
  var storage = md.storage(md)
  var inject = md.inject({storage})
  var detect = md.detect({storage, inject})
  var webrequest = md.webrequest({storage})
  var mathjax = md.mathjax()
  var xhr = md.xhr()
  var ondine = md.ondine()
  var icon = md.icon({storage})

  var compilers = Object.keys(md.compilers)
    .reduce((all, compiler) => (
      all[compiler] = md.compilers[compiler]({storage}),
      all
    ), {})

  var messages = md.messages({storage, compilers, mathjax, xhr, ondine, webrequest, icon})

  // listeners are added at once so a waking worker still gets the event that woke it, they run once the
  // settings are loaded. messages answers every request, so the channel stays open for it
  chrome.tabs.onUpdated.addListener((...args) => storage.ready.then(() => detect.tab(...args)))
  chrome.runtime.onMessage.addListener((...args) => (storage.ready.then(() => messages(...args)), true))

  storage.ready.then(icon)
})()
