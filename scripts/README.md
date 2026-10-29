# Build

Everything is one script, [build.mjs](build.mjs), run by bun. It builds the unpacked extension in `dist/nimbus-markdown/` (including `themes` and `vendor`); `build:zip` packs both browsers into `dist/nimbus-markdown-chrome.zip` and `dist/nimbus-markdown-firefox.zip`. No `sh`, `bat`, `zip` or node is needed.

```bash
git clone https://github.com/dvgamerr-app/nimbus-markdown.git
cd nimbus-markdown/
bun i
bun run build:dist           # chrome
bun run build:dist:firefox   # firefox
bun run build:zip            # chrome and firefox zips in dist/
bun run build:themes         # only rebuild dist/nimbus-markdown/themes
```

## Build Dependencies

- bun >= 1.1
- git (`cleanrmd` is installed from GitHub)

## nimbus-markdown Dependencies

| module | version
| :-     | -:
| bootstrap           | 5.3.8
| cleanrmd            | 0.1.0
| github-markdown-css | 5.9.0
| mathjax             | 3.2.2
| ondine              | 0.0.3
| mithril             | 1.1.7
| prismjs                | 1.30.0
| csso                   | 5.0.5
| @panzoom/panzoom    | 4.6.2
| **markdown-it**
| markdown-it            | 15.0.3
| markdown-it-abbr       | 2.0.0
| markdown-it-anchor     | 10.0.0
| markdown-it-attrs      | 5.0.1
| markdown-it-cjk-breaks | 2.0.1
| markdown-it-deflist    | 4.0.0
| markdown-it-footnote   | 4.0.0
| markdown-it-ins        | 4.0.0
| markdown-it-mark       | 4.0.0
| markdown-it-sub        | 2.0.0
| markdown-it-sup        | 2.0.0
| markdown-it-task-lists | 2.1.1
| github-slugger         | 2.0.0
| **mdc**
| @material/button    | 0.37.1
| @material/ripple    | 0.37.1
| @material/switch    | 0.36.1
| @material/tabs      | 0.37.1
| @material/textfield | 0.37.1

## IDE extensions

```bash
bun run build:vsix   # dist/nimbus-markdown-vscode.vsix, from vscode/
dotnet build visualstudio/NimbusMarkdown/NimbusMarkdown.csproj -c Release   # Visual Studio, windows only
```

A `v*` tag builds both and attaches the `.vsix` files to the GitHub release. With a trusted publishing policy on the VS Code Marketplace the tag also publishes the VS Code extension there (no token), and with the `OVSX_PAT` secret set it publishes to Open VSX.
