// Mermaid code blocks drawn by Ondine (https://ondine.sh): the background compiles the source to svg, the colours and
// fonts come from --ondine-* custom properties set here, so a theme switch never compiles again
var mmd = (() => {
  var loaded = false

  var walk = (regex, string, result = [], match = regex.exec(string)) =>
    !match ? result : walk(regex, string, result.concat(match[1]))

  // diagram-design style guide tokens
  var tokens = {
    light: {
      paper: '#f5f5f5', paper2: '#ececec', node: '#ffffff',
      ink: '#2d3142', muted: '#4f5d75', soft: '#7a8399',
      rule: 'rgba(45,49,66,0.12)', ruleSolid: '#bfc0c0',
      accent: '#eb6c36', accentTint: 'rgba(235,108,54,0.08)', link: '#2e5aa8',
      accentText: '#bf4520', danger: '#c0401f', dark: false,
      series: ['#7c8f6f', '#5e7a9b', '#b8915a', '#9c6b50', '#6e6479'],
      inkRgb: '45,49,66', accentRgb: '235,108,54', mutedRgb: '79,93,117',
      syn: {vis: '#9a6e3a', fn: '#dd4a68', type: '#dd4a68', keyword: '#07a', punct: '#999', constant: '#905'}
    },
    dark: {
      paper: '#020202', paper2: '#0f0f0f', node: '#0f0f0f',
      ink: '#f5f5f5', muted: '#dedede', soft: '#a3a3a3',
      rule: 'rgba(245,245,245,0.12)', ruleSolid: '#404040',
      accent: '#79b1f9', accentTint: 'rgba(121,177,249,0.10)', link: '#79b1f9',
      accentText: '#79b1f9', danger: '#f07f77', dark: true,
      series: ['#69ba7c', '#79b1f9', '#dcaf61', '#f07f77', '#a3a3a3'],
      inkRgb: '245,245,245', accentRgb: '121,177,249', mutedRgb: '222,222,222',
      syn: {vis: '#f8f8f2', fn: '#e6db74', type: '#e6db74', keyword: '#66d9ef', punct: '#f8f8f2', constant: '#f92672'}
    }
  }

  var sans = "'Geist', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
  var mono = "'Geist Mono', ui-monospace, 'SFMono-Regular', Consolas, monospace"

  // the custom properties of an Ondine svg, see https://ondine.sh/docs/guides/theming
  var ondineVars = (t) => ({
    '--ondine-bg': t.paper,
    '--ondine-fg': t.ink,
    '--ondine-muted': t.muted,
    '--ondine-line': t.muted,
    '--ondine-surface': t.node,
    '--ondine-surface-alt': t.paper2,
    '--ondine-border': t.ink,
    '--ondine-accent': t.accent,
    '--ondine-critical': t.danger,
    '--ondine-stroke': '1px',
    '--ondine-radius': '6px',
    '--ondine-font': sans,
    ...[t.accent, ...t.series, t.muted, t.soft].reduce((all, color, i) => (all[`--ondine-series-${i + 1}`] = color, all), {})
  })

  var icons = {
    fullscreen: '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>',
    exit: '<path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/>',
    zoomIn: '<path d="M8 3v10M3 8h10"/>',
    zoomOut: '<path d="M3 8h10"/>',
    reset: '<path d="M3 8a5 5 0 1 0 1.5-3.5M3 2v3h3"/>'
  }
  var icon = (name) =>
    `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`

  // mouse wheels send one large delta per notch (line mode in firefox); touchpads stream small
  // or horizontal deltas. once a gesture looks like a touchpad, keep it until the stream pauses
  var lastTrackpad = -Infinity
  var trackpad = (e) => {
    if (e.deltaMode !== 0) return false
    if (e.deltaX !== 0 || Math.abs(e.deltaY) < 30 || e.timeStamp - lastTrackpad < 150) {
      lastTrackpad = e.timeStamp
      return true
    }
    return false
  }

  // fullscreen fills the browser viewport only, not the screen
  var fullscreen = (pre, active) => {
    pre.classList.toggle('mmd-fullscreen', active)
    document.documentElement.classList.toggle('_mmd-fullscreen', active)
    pre._mmdFullscreen && pre._mmdFullscreen()
  }
  document.addEventListener('keydown', (e) => {
    var pre = document.querySelector('pre.mmd-fullscreen')
    if (!pre || e.ctrlKey || e.metaKey || e.altKey) return
    if (pre._mmdKey && pre._mmdKey(e)) return e.preventDefault()
    if (e.key === 'Escape') fullscreen(pre, false)
  })

  // fullscreen + zoom controls; zoom/move only work in fullscreen, inline the diagram is static
  // mouse: wheel zoom, drag move | touchpad: pinch zoom, two-finger move | touch: pinch zoom, drag move
  var toolbar = (pre, panzoom) => {
    // every render builds a new set of controls: drop the previous set, its listeners and its panzoom
    pre._mmdDispose && pre._mmdDispose()
    var abort = new AbortController()
    var signal = abort.signal
    pre._mmdDispose = () => {
      abort.abort()
      panzoom.destroy()
      pre.querySelectorAll(':scope > .mmd-toolbar').forEach((el) => el.remove())
    }

    var bar = document.createElement('div')
    bar.className = 'mmd-toolbar'
    var button = (name, title, onclick) => {
      var btn = document.createElement('button')
      btn.type = 'button'
      btn.title = title
      btn.dataset.action = name
      btn.innerHTML = icon(name)
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        onclick(btn)
      })
      bar.appendChild(btn)
      return btn
    }
    var active = () => pre.classList.contains('mmd-fullscreen')
    var level = document.createElement('span')
    level.className = 'mmd-level'
    level.title = 'Reset zoom'
    level.textContent = '100%'
    level.addEventListener('click', (e) => {
      e.stopPropagation()
      panzoom.reset()
    })

    button('zoomOut', 'Zoom out', () => panzoom.zoomOut())
    bar.appendChild(level)
    button('zoomIn', 'Zoom in', () => panzoom.zoomIn())
    button('reset', 'Reset', () => panzoom.reset())
    var full = button('fullscreen', 'Fullscreen', () => fullscreen(pre, !active()))
    bar.addEventListener('pointerdown', (e) => e.stopPropagation())
    pre.appendChild(bar)

    var code = pre.querySelector(':scope > code.mermaid')
    var svg = code.querySelector('svg')
    var svgEvent = (name, fn) => svg.addEventListener(name, (e) => active() && fn(e), {signal})
    svgEvent('panzoomchange', (e) => {
      level.textContent = Math.round(e.detail.scale * 100) + '%'
    })
    code.addEventListener('pointerdown', (e) => active() && panzoom.handleDown(e), {signal})
    document.addEventListener('pointermove', (e) => active() && panzoom.handleMove(e), {signal})
    document.addEventListener('pointerup', (e) => active() && panzoom.handleUp(e), {signal})

    // keys while fullscreen: + - 0 zoom, arrows move, escape leaves
    var step = 40
    var moves = {ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step]}
    pre._mmdKey = (e) => {
      if (e.key === '+' || e.key === '=') panzoom.zoomIn()
      else if (e.key === '-') panzoom.zoomOut()
      else if (e.key === '0') panzoom.reset()
      else if (moves[e.key]) panzoom.pan(...moves[e.key], {relative: true})
      else return false
      return true
    }

    var sync = () => {
      var on = active()
      full.innerHTML = icon(on ? 'exit' : 'fullscreen')
      full.title = on ? 'Exit fullscreen' : 'Fullscreen'
      panzoom.setOptions({touchAction: on ? 'none' : 'auto'})
      code.style.userSelect = svg.style.userSelect = on ? 'none' : ''
      panzoom.reset({animate: false})
      level.textContent = '100%'
    }
    pre._mmdFullscreen = sync
    sync()

    pre.onwheel = (e) => {
      if (!active()) return
      e.preventDefault()
      if (e.ctrlKey) {
        // touchpad pinch (reported as ctrl+wheel with small deltas)
        var scale = panzoom.getScale() * Math.exp(-e.deltaY * 0.01)
        panzoom.zoomToPoint(scale, e)
      }
      else if (trackpad(e)) {
        // touchpad two-finger scroll -> move
        var current = panzoom.getScale()
        panzoom.pan(-e.deltaX / current, -e.deltaY / current, {relative: true})
      }
      else {
        // mouse wheel -> zoom
        panzoom.zoomWithWheel(e)
      }
    }
    pre.ondblclick = () => active() && panzoom.reset()
  }

  // the page asks for a render more than once while it loads (before and after the theme css arrives):
  // run one at a time, rerun once after
  var running = false
  var queued = false
  var sequence = 0

  var ask = (source, options) => new Promise((resolve) =>
    chrome.runtime.sendMessage({message: 'ondine', source, options}, (res) =>
      resolve(res || {error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'no answer'})
    )
  )

  var render = () => {
    if (running) {
      queued = true
      return
    }
    running = true
    if (loaded) {
      var definitions = walk(/<pre><code class="mermaid(?: dbml)?">([\s\S]+?)<\/code><\/pre>/gi, state.html)

      Array.from(document.querySelectorAll('pre code.mermaid')).forEach((diagram, index) => {
        diagram.removeAttribute('data-processed')
        diagram.innerHTML = definitions[index]
      })
    }
    var dark =
      state._themes[state.theme] === 'dark' ||
      (state._themes[state.theme] === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    var t = dark ? tokens.dark : tokens.light
    document.documentElement.classList.toggle('_mermaid-dark', dark)
    var vars = ondineVars(t)

    // render from textContent: innerHTML would decode entities in the source
    var jobs = Array.from(document.querySelectorAll('code.mermaid')).map((node) => {
      var text = node.textContent
      var id = 'mmd-' + ++sequence
      node.removeAttribute('data-processed')
      Object.keys(vars).forEach((name) => node.style.setProperty(name, vars[name]))
      // the room the diagram has on the page: the content box of its <pre>
      var box = node.parentNode
      var pad = box ? getComputedStyle(box) : null
      var fit = box ? box.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight) : 0
      var drawn = Promise.resolve().then(() =>
        node.classList.contains('dbml')
          ? {svg: dbml.render(text, t, {sans, mono}, id)}
          : ask(text, {idPrefix: id, fontSize: 13, maxWidth: fit > 0 ? fit : undefined})
      )
      return drawn.then(({svg, error}) => {
        if (error) throw new Error(error)
        node.innerHTML = svg
        node.setAttribute('data-processed', 'true')
      }).catch((err) => {
        node.textContent = text + '\n\n' + (err && err.message || err)
        node.setAttribute('data-processed', 'true')
      })
    })
    loaded = true

    Promise.all(jobs).then(() => {
      document.querySelectorAll('pre > code.mermaid > svg').forEach((diagram) => {
        var panzoom = Panzoom(diagram, {canvas: true, maxScale: 20, minScale: 0.2, touchAction: 'auto', pinchAndPan: true, noBind: true, cursor: ''})
        var pre = diagram.closest('pre')
        pre && pre.querySelector(':scope > code.mermaid') && toolbar(pre, panzoom)
      })
    }).finally(() => {
      running = false
      if (queued) {
        queued = false
        render()
      }
    })
  }

  return {render}
})()
