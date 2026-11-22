---
name: studio-visual
description: Create editable branded stills, carousels, logos and diagrams.
---

# Studio visual

Use editable HTML/CSS templates in `templates/`, with brand colors, typography and voice from brand.yml. Use only OFL fonts supplied here or explicitly installed by the user. Keep important content inside safe zones and check text size and contrast. Write concise, informative alt text describing the visual's meaning, not merely its type.

Plan a carousel as ordered slides: one clear title, a small number of focused content slides, and a closing slide. Save each as `assets/<id>/source/<number>.html`; use the same dimensions and `.slide` structure. For posters and cards use `source.html` and template typography. For logos use editable `source.svg`, avoid unsupported trademark claims, and leave trademarkChecked false until a human confirms a search. For diagrams use `source.mmd` or `source.d2`, label relationships and keep the layout readable. Describe every embedded asset in asset.yml `embeds` so AI provenance is inherited.

Preview locally with `bstudio render-preview <source> --size WxH --out <temporary.png>`. Inspect and iterate on clipping, safe zones, contrast, hierarchy and fidelity; previews are disposable, and only declared sources and asset.yml are copied back. For video, follow studio-video and its HyperFrames guidance.
