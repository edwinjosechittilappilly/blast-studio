#!/usr/bin/env python3
"""Generate the standalone banner: python3 scripts/brand/banner.py."""
from html import escape
from fonts import ROOT, face, licenses

style = "\n".join((face("Display", "SpaceGrotesk.woff2", "100 900"), face("Text", "IBMPlexSans.woff2", "100 900"), face("Mono", "IBMPlexMono.woff2")))
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="420" viewBox="0 0 1280 420" role="img" aria-label="Blast Studio. Create, review and render content for the places you publish.">
<metadata>{escape(licenses())}</metadata>
<style>{style}
.name{{font:700 76px Display,sans-serif;letter-spacing:-2px;fill:#fbf8ff}}
.tag{{font:400 25px Text,sans-serif;fill:#e4daf2}}
.small{{font:500 18px Text,sans-serif;fill:#ede4fa}}
.code{{font:400 16px Mono,monospace;fill:#e9dcff}}
.label{{font:600 15px Text,sans-serif;letter-spacing:2px;fill:#bba8d7}}</style>
<rect width="1280" height="420" fill="#18102e"/>
<path d="M0 0H1280V14H0z" fill="#ab87f4"/>
<path d="M855 14H1280V420H855z" fill="#281b49"/>
<path d="M916 0v420M1070 0v420M1224 0v420M855 110h425M855 264h425" stroke="#b998f2" stroke-opacity=".16"/>
<path d="M66 70h34v34H66z" transform="rotate(45 83 87)" fill="#c8a9ff"/>
<text x="66" y="188" class="name">Blast Studio</text>
<text x="70" y="239" class="tag">Create, review and render content</text>
<text x="70" y="273" class="tag">for the places you publish.</text>
<rect x="70" y="313" width="565" height="48" rx="5" fill="#302149" stroke="#665382"/>
<text x="88" y="343" class="code">$ bstudio brief launch --idea "Your idea"</text>
<text x="905" y="97" class="label">FROM IDEA TO ASSETS</text>
<text x="905" y="159" class="small">Brief and plan</text>
<text x="905" y="207" class="small">Make and render</text>
<text x="905" y="255" class="small">Review and export</text>
<path d="M906 304h90v7h-90zM906 322h150v7H906zM906 340h116v7H906z" fill="#b99ae8" opacity=".55"/>
<path d="M1120 294h80v80h-80z" fill="#c8a9ff"/>
<path d="M1144 334h32m-16-16v32" stroke="#281b49" stroke-width="4"/>
</svg>'''
(ROOT / "docs/assets/banner.svg").write_text(svg + "\n")
