#!/usr/bin/env python3
"""Render the recorded CLI session: python3 scripts/brand/demo.py."""
from html import escape
from fonts import ROOT, face, licenses

lines = (ROOT / "scripts/brand/demo-transcript.txt").read_text().splitlines()
height = 90 + len(lines) * 27 + 30
rows = "\n".join(
    f'<text x="36" y="{92 + i * 27}" fill="{ "#d2baff" if line.startswith("$") else "#eee7fa" }">{escape(line)}</text>'
    for i, line in enumerate(lines)
)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="{height}" viewBox="0 0 1280 {height}" role="img" aria-label="Recorded Blast Studio session: initialize a studio, write a brief, check status, and render a sample card.">
<metadata>{escape(licenses())}</metadata>
<style>{face("Mono", "IBMPlexMono.woff2")} text{{font:16px Mono,monospace;white-space:pre}}</style>
<rect width="1280" height="{height}" rx="12" fill="#18102e"/>
<path d="M12 0h1256a12 12 0 0 1 12 12v42H0V12A12 12 0 0 1 12 0" fill="#302149"/>
<circle cx="28" cy="27" r="5" fill="#c7a5ff"/><circle cx="47" cy="27" r="5" fill="#9278b8"/><circle cx="66" cy="27" r="5" fill="#69597e"/>
<text x="96" y="33" fill="#e5d8f7">Terminal · local studio</text>
{rows}
</svg>'''
(ROOT / "docs/assets/demo.svg").write_text(svg + "\n")
