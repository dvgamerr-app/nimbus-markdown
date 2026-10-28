
# Change Log

## Unreleased
- draw Mermaid diagrams with Ondine instead of Mermaid: the background compiles each diagram to SVG with WebAssembly, the colours follow the Nimbus light and dark themes through `--ondine-*` custom properties
- keep the self-drawn journey, timeline, gantt, pie, quadrant, requirement, git graph, c4 and mindmap renderers, and skin the Ondine diagrams in the same diagram-design style, node classes like `A:::focal` included
- fullscreen motion on Ondine: hover a node to light its links, click it for comets running blue into it and orange out of it, play sequences, state machines, journeys and timelines step by step (P, [ and ])
- drop the find box, overview map and node popup of the old viewer
- `zenuml` diagrams are not supported by Ondine and show their source with the error
- update every dependency except MathJax 4, Mithril 2 and the Material Design components, which need their own migrations

## v6.0 - 2026-10-21
- rename to Nimbus Markdown, with Nimbus light and dark themes as the default
- markdown-it as the only compiler
- build with a single bun script
- update mermaid to v12.2.0
- draw `dbml` fenced code blocks as table cards with constraint chips, schema groups and routed foreign keys, with hover pulses and a table popup in fullscreen
- draw user journeys as a journey map: stage columns under a five level sentiment curve, the lowest stage in the accent, with hover, a stage popup and step by step playback
- draw timelines on one hairline baseline: periods alternate above and below, years spaced by elapsed time, the busiest period in the accent, the axis stretched to the page width, with a legend strip, a period popup and its own playback: an ink stroke draws along the baseline while each period's drop and label reveal in turn
- fullscreen mermaid viewer: find node, overview map, node focus popup, blue links into a node and orange links out
- fix a second script injection resetting an already rendered page
- bump markdown-it, fflate and prismjs to patched versions

## v5.3 - 2024-04-30
- custom theme support
- syntax highlighted raw markdown view
- pan, zoom and resize mermaid diagrams
- improved settings page
- fix frontmatter being stripped in raw markdown view
- fix anchor icon missing on origins with strict csp
- fix emoji rendered in prism code blocks
- update mermaid from v10.4.0 to v10.8.0
- update marked from v9.0.3 to v12.0.1

## v5.2 - 2023-09-26
- add markdown-it as default compiler
- add support for markdown extended syntax
- fix auto scroll on very large pages
- fix detect wildcard subdomains in origin
- fix allow port in origin
- theme fixes
- new default icon with an overlay
- update mermaid from v9.4.0 to v10.4.0
- update marked from v4 to v9

## v5.1 - 2023-03-14
- new advanced options page for managing the enabled origins
- each enabled origin now can have its own header and path detection setup
- the header detection now includes the text/plain content type
- header and path detection are now being applied together instead of one or the other
- on hard reload automatically scroll to hash fragment or last known position
- add missing tex/latex extensions for mathjax
- strip yaml/toml frontmatter and use the title variable to set the page title
- add favicon to markdown content pages
- dark mode for the popup and the options page
- bundle all prism languages and load them on demand
- fix emoji regex to exclude html tags and code blocks
- fix toc regex picking up header links
- fix default github theme to be always light
- print style fixes and other theme fixes
- update marked from v4.1.1 to v4.2.5
- update mermaid from v9.2.2 to v9.4.0
- update github theme from v5.1.0 to v5.2.0

## v5.0 - 2022-12-05
- migrate to manifest v3
- update mathjax from v2 to v3
- update mermaid from v8 to v9
- update marked from v1 to v4
- update remark from v13 to v14
- update prism syntax support
- add 30 new themes + update github themes
- add dark theme support for prism and mermaid
- add content width option
- update table of content styles to match theme
- expose syntax highlighting option
- add hot autoreloading
- add light icon option for dark browser theme
- disabling CSP is no longer possible
- customizing the page encoding is no longer possible

## v4.0 - 2020-12-24
- add mermaid diagrams support
- fix autoscroll in Chrome 87
- update marked, remark and prism
- update github theme
- initial Edge release

## v3.9 - 2020-02-23
- fix autoreload for file urls in Chrome 80

## v3.8 - 2020-01-05
- remember ToC scroll position

## v3.7 - 2019-09-01
- fixed incompatibility issue with other extensions
- fix file:// URLs on 'Block third-party cookies' enabled
- update marked, remark and prism
- update github theme

## v3.6 - 2018-07-07
- add autoreload content option
- improve origin detection
- show refresh button only on origins that need refreshing

## v3.5 - 2018-04-16
- add csp option for each origin individually
- add encoding option for each origin individually
- improve content-type header detection for Firefox

## v3.4 - 2018-01-12
- Firefox fixes

## v3.3 - 2017-11-22
- patch content-type header in Firefox

## v3.2 - 2017-10-30
- add mathjax support
- migrate the UI to Material Components (MDC)
- update remark compiler
- update github theme
- initial Firefox release

## v3.1 - 2017-04-28
- add content-type header detection
- add allow all origins button

## v3.0 - 2017-04-17
- improve scroll logic
- migrate to browser action
- add emoji support

## v2.9 - 2017-04-01
- add remark compiler

## v2.8 - 2017-03-29
- update compiler options tab

## v2.7 - 2017-03-12
- update github theme

## v2.6 - 2017-01-26
- add table of content (ToC)
- add content options tab
- expose remember scroll position as option
- update default path matching regex
- update github-dark theme

## v2.5 - 2017-01-23
- store scroll position for each path individually
- add tabs to the extension popup

## v2.4 - 2017-01-02
- load file urls dynamically
- fix anchor links

## v2.3 - 2016-10-30
- migrate to optional permissions
- render based on manually allowed remote origins
- add advanced options page to manage origins
- overhaul the UI using Material Design (MDL)

## v2.2 - 2016-09-25
- improve rendering time
- update github theme

## v2.1 - 2016-09-13
- add getcomposer.org to the list of excluded domains

## v2.0 - 2016-07-02
- migrate the content script logic to mithril
- update themes

## v1.8 - 2016-01-01
- update marked
- update github theme

## v1.7 - 2015-07-17
- exclude bitbucket.org and gitlab.com from .md matching
- match urls ending with anchor when showing the page action button

## v1.6 - 2015-04-21
- update github theme
- update prism

## v1.5 - 2014-10-19
- update github theme

## v1.4 - 2014-08-20
- update github theme

## v1.3 - 2014-07-31
- fix scroll position on remote origins

## v1.2 - 2014-07-26
- remember scroll position

## v1.1 - 2014-04-21
- css theme fix

## v1.0 - 2014-04-09
- render using marked compiler
- raw markdown / rendered html toggle button
- themes including a github one
- compiler options
- initial Chrome release
