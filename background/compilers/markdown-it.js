
var md = {compilers: {}}

md.compilers['markdown-it'] = (() => {
  var defaults = {
    breaks: true,
    html: true,
    linkify: true,
    typographer: true,
    xhtmlOut: true,
    langPrefix: 'language-',
    quotes: '“”‘’',
    // plugins
    abbr: true,
    attrs: true,
    cjk: true,
    deflist: true,
    footnote: true,
    ins: true,
    mark: true,
    sub: true,
    sup: true,
    tasklists: true,
  }

  var description = {
    breaks: 'Convert \\n in paragraphs into <br>',
    html: 'Enable HTML tags in source',
    linkify: 'Autoconvert URL-like text to links',
    typographer: 'Enable some language-neutral replacement + quotes beautification',
    xhtmlOut: 'Use / to close single tags (<br />)',
    // plugins
    abbr: 'Abbreviation <abbr>\n*[word]: Text',
    attrs: 'Custom attributes\n# header {#id}',
    cjk: 'Suppress linebreaks between east asian characters',
    deflist: 'Definition list <dl>\ntitle\n: definition',
    footnote: 'Footnotes\nword[^1]\n[^1]: text',
    ins: 'Inserted text <ins>\n++text++',
    mark: 'Marked text <mark>\n==text==',
    sub: 'Subscript <sub>\n~text~',
    sup: 'Superscript <sup>\n^text^',
    tasklists: 'Task lists\n- [x]\n- [ ]',
  }

  // a table sits in a box of its own: the box scrolls a wide table and a theme frames it
  var scrollTables = (md) => {
    md.renderer.rules.table_open = (tokens, idx, options, env, self) =>
      '<div class="table-scroll">' + self.renderToken(tokens, idx, options)
    md.renderer.rules.table_close = (tokens, idx, options, env, self) =>
      self.renderToken(tokens, idx, options) + '</div>'
  }

  var ctor = ({storage: {state}}) => ({
    defaults,
    description,
    compile: (markdown) =>
      mdit.mdit(state['markdown-it'])
        .use(mdit.anchor, {
          slugify: (s) => new mdit.slugger().slug(s)
        })
        .use(state['markdown-it'].abbr ? mdit.abbr : () => {})
        .use(state['markdown-it'].attrs ? mdit.attrs : () => {})
        .use(state['markdown-it'].cjk ? mdit.cjk : () => {})
        .use(state['markdown-it'].deflist ? mdit.deflist : () => {})
        .use(state['markdown-it'].footnote ? mdit.footnote : () => {})
        .use(state['markdown-it'].ins ? mdit.ins : () => {})
        .use(state['markdown-it'].mark ? mdit.mark : () => {})
        .use(state['markdown-it'].sub ? mdit.sub : () => {})
        .use(state['markdown-it'].sup ? mdit.sup : () => {})
        .use(state['markdown-it'].tasklists ? mdit.tasklists : () => {})
        .use(scrollTables)
        .render(markdown)
  })

  return Object.assign(ctor, {defaults, description})
})()
