#!/usr/bin/env python3
"""Generate the documentation workflow illustration."""
from html import escape
from fonts import ROOT, face, licenses

style = "\n".join((face("Text", "IBMPlexSans.woff2", "100 900"), face("Display", "SpaceGrotesk.woff2", "100 900")))
steps = [("Brief", 224, 92), ("Plan", 332, 80), ("Make", 428, 82), ("Render", 526, 92), ("Review", 634, 100), ("Revise / Accept", 750, 148), ("Export", 914, 86)]
boxes = []
for label, x, width in steps:
    label_y = 120 if label == "Review" else 132
    subtitle = '<text x="684" y="145" text-anchor="middle" class="small">gates + rubric</text>' if label == "Review" else ""
    boxes.append(f'<rect x="{x}" y="96" width="{width}" height="62" rx="10" fill="#292541" stroke="#696080"/><text x="{x + width/2}" y="{label_y}" text-anchor="middle" class="step">{label}</text>{subtitle}')
    boxes.append(f'<path d="M{x + width + 3} 127h10m-4-4 4 4-4 4" class="arrow"/>')
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="320" viewBox="0 0 1280 320" role="img" aria-labelledby="title desc">
<title id="title">Blast Studio workflow</title><desc id="desc">Inputs move through brief, plan, make, render, review, revise or accept, and export to Market Blaster. An updater feeds platform packs into make and review.</desc>
<metadata>{escape(licenses())}</metadata><style>{style}
.title{{font:700 23px Display,sans-serif;fill:#fff}} .step{{font:600 17px Text,sans-serif;fill:#faf8ff}} .detail{{font:400 16px Text,sans-serif;fill:#e1d9f1}} .small{{font:500 15px Text,sans-serif;fill:#eee9ff}} .arrow{{fill:none;stroke:#bdb1dc;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}}</style>
<rect width="1280" height="320" rx="20" fill="#10121f"/>
<text x="34" y="50" class="title">From source to handoff</text>
<rect x="34" y="78" width="174" height="100" rx="10" fill="#312a4d" stroke="#7c5cff"/><text x="50" y="105" class="step">Inputs</text><text x="50" y="130" class="detail">Idea · links · commit</text><text x="50" y="153" class="detail">PR · MB brief</text><path d="M211 127h10m-4-4 4 4-4 4" class="arrow"/>
{''.join(boxes)}
<rect x="1016" y="96" width="226" height="62" rx="10" fill="#7c5cff"/><text x="1129" y="132" text-anchor="middle" class="step">Market Blaster</text>
<rect x="382" y="224" width="120" height="48" rx="9" fill="#302844" stroke="#d58582"/><text x="442" y="254" text-anchor="middle" class="small">Updater</text><path d="M505 248h24m-4-4 4 4-4 4" class="arrow"/>
<rect x="532" y="224" width="154" height="48" rx="9" fill="#302844" stroke="#d58582"/><text x="609" y="254" text-anchor="middle" class="small">Platform packs</text>
<path d="M570 224V202H469V164m-4 4 4-4 4 4M650 224V202H684V164m-4 4 4-4 4 4" class="arrow"/>
</svg>'''
(ROOT / "docs/assets/pipeline.svg").write_text(svg + "\n")
