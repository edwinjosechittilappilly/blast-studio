#!/usr/bin/env python3
"""Generate the standalone banner: python3 scripts/brand/banner.py."""
from html import escape
from fonts import ROOT, face, licenses

style = "\n".join((face("Display", "SpaceGrotesk.woff2", "100 900"), face("Text", "IBMPlexSans.woff2", "100 900"), face("Mono", "IBMPlexMono.woff2")))
gates = "".join(f'<path d="M1040 {y-5}l4 4 7-9" class="check"/><text x="1060" y="{y}" class="panel">{label}</text>' for label, y in (("Policy", 155), ("Disclosure", 180), ("Specs", 205), ("Accessibility", 230), ("Grounding", 255)))
rubric = "".join(f'<text x="1040" y="{y}" class="panel">{label}</text><rect x="1156" y="{y-9}" width="66" height="6" rx="3" fill="#423b59"/><rect x="1156" y="{y-9}" width="{width}" height="6" rx="3" fill="#a894ff"/>' for label, y, width in (("Hook", 301, 49), ("Simplicity", 327, 42), ("Anti-slop", 353, 54), ("Platform fit", 379, 46)))
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="560" viewBox="0 0 1280 560" role="img" aria-labelledby="title desc">
<title id="title">Blast Studio</title><desc id="desc">Create, review and render content for the places developers read. An illustration of content formats, review checks and a handoff to Market Blaster.</desc>
<metadata>{escape(licenses())}</metadata><defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="9"/><feOffset dy="7"/><feComponentTransfer><feFuncA type="linear" slope=".45"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter><radialGradient id="glow"><stop stop-color="#7c5cff" stop-opacity=".22"/><stop offset="1" stop-color="#7c5cff" stop-opacity="0"/></radialGradient></defs>
<style>{style}
.name{{font:700 67px Display,sans-serif;letter-spacing:-2px;fill:#fff}} .tag{{font:400 25px Text,sans-serif;fill:#e9e5f4}} .code{{font:400 17px Mono,monospace;fill:#f1eaff}} .small{{font:500 18px Text,sans-serif;fill:#dcd3ee}} .tile{{font:600 16px Text,sans-serif;fill:#eee8fa}} .panel{{font:500 16px Text,sans-serif;fill:#f0ebfa}} .heading{{font:700 18px Display,sans-serif;fill:#fff}} .check{{fill:none;stroke:#f2a39c;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}}</style>
<rect width="1280" height="560" fill="#10121f"/><ellipse cx="895" cy="275" rx="375" ry="260" fill="url(#glow)"/>
<rect x="52" y="63" width="35" height="35" rx="9" fill="#7c5cff"/><path d="M62 80h15m-7-7v15" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
<text x="52" y="182" class="name">Blast Studio</text>
<text x="55" y="235" class="tag">Create, review and render content</text><text x="55" y="270" class="tag">for the places developers read.</text>
<rect x="54" y="310" width="511" height="53" rx="9" fill="#29253c" stroke="#716188"/><text x="71" y="343" class="code">$ bstudio new launch --pr 42 --repo you/app</text>
<text x="55" y="422" class="small">pairs with <tspan fill="#f5a49b">Market Blaster</tspan></text>
<!-- Output tiles -->
<g filter="url(#shadow)"><rect x="624" y="62" width="217" height="145" rx="12" fill="#faf7ff"/><circle cx="650" cy="91" r="11" fill="#7c5cff"/><text x="672" y="97" style="font:600 16px Text,sans-serif;fill:#332b47">LinkedIn</text><path d="M643 122h167M643 143h144M643 164h156" stroke="#b6acc6" stroke-width="7" stroke-linecap="round"/></g>
<g filter="url(#shadow)"><rect x="679" y="235" width="137" height="151" rx="10" fill="#4d416b" transform="rotate(-9 747 310)"/><rect x="699" y="228" width="137" height="151" rx="10" fill="#a79ad3" transform="rotate(5 767 303)"/><rect x="718" y="222" width="137" height="151" rx="10" fill="#f1ecff"/><path d="M736 253h92M736 272h75M736 291h82" stroke="#7c6aab" stroke-width="6" stroke-linecap="round"/><text x="736" y="354" style="font:600 16px Text,sans-serif;fill:#3f3458">Carousel</text></g>
<g filter="url(#shadow)"><rect x="863" y="43" width="112" height="203" rx="20" fill="#30304b" stroke="#a99cc4" stroke-width="3"/><rect x="871" y="56" width="96" height="178" rx="13" fill="#704de0"/><path d="M910 116v36l28-18z" fill="#fff"/><rect x="881" y="187" width="76" height="24" rx="5" fill="#211b3a"/><text x="919" y="204" text-anchor="middle" style="font:600 14px Text,sans-serif;fill:#fff">Short · 9:16</text></g>
<g filter="url(#shadow)"><rect x="870" y="269" width="138" height="113" rx="11" fill="#f1ecff"/><rect x="882" y="295" width="30" height="26" rx="4" fill="#7c5cff"/><rect x="931" y="282" width="30" height="26" rx="4" fill="#b45d6b"/><rect x="957" y="329" width="30" height="26" rx="4" fill="#7c5cff"/><path d="M912 308l19-11m-13 17 39 27" stroke="#574b70" stroke-width="2"/></g>
<g filter="url(#shadow)"><rect x="626" y="412" width="271" height="92" rx="11" fill="#d78d8b"/><circle cx="667" cy="458" r="23" fill="#10121f"/><path d="M654 458h26m-13-13v26" stroke="#f4d3cd" stroke-width="3"/><text x="708" y="452" style="font:700 19px Display,sans-serif;fill:#211a30">Poster / logo</text><text x="708" y="477" style="font:400 15px Text,sans-serif;fill:#35243a">Editable sources</text></g>
<!-- Editorial review -->
<g filter="url(#shadow)"><rect x="1021" y="57" width="224" height="355" rx="13" fill="#27243a" stroke="#82739c"/><text x="1040" y="94" class="heading">Review</text><path d="M1040 111h182" stroke="#625674"/>{gates}<path d="M1040 271h182" stroke="#625674"/>{rubric}</g>
<path d="M932 455h55m-8-7 8 7-8 7" fill="none" stroke="#f2a39c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="1002" y="428" width="243" height="55" rx="12" fill="#7c5cff"/><text x="1123" y="462" text-anchor="middle" class="heading">Market Blaster</text>
</svg>'''
(ROOT / "docs/assets/banner.svg").write_text(svg + "\n")
