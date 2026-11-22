---
name: studio-visual
description: Create editable branded stills, carousels, logos and diagrams.
---

# Studio visual

Use editable HTML/CSS templates in `templates/`, with brand colors, typography and voice from brand.yml. Use only OFL fonts supplied here or explicitly installed by the user. Keep important content inside safe zones and check text size and contrast. Write concise, informative alt text describing the visual's meaning, not merely its type.
Use the platform pack's image dimensions and safe zones; keep all text, logo and URL inside them. Use brand.yml colors and fonts, place the supplied logo and a real brand URL where they remain legible, and omit either if unavailable. Do not invent URLs, commands or output: use real command text and results only when supplied by the brief. Replace all template placeholders with supported content.

For cards and posters convey one message, with a headline of at most 8 words. Establish a distinct headline, subhead and body type scale; at 1080 px width use at least 24 px for all text, scaled proportionally for other widths. Use contrast of at least 4.5:1 for text and an 8 px spacing grid at 1080 px width. Inspect the result at 375 px display width and simplify or enlarge text until it is legible. Honor stricter pack accessibility requirements.


Plan a carousel as ordered slides with one idea per slide, a consistent layout and visible slide numbers. Save each as `assets/<id>/source/<number>.html`; use the same dimensions and `.slide` structure. For posters and cards use `source.html` and template typography. For logos use editable `source.svg`, avoid unsupported trademark claims, and leave trademarkChecked false until a human confirms a search. For diagrams use `source.mmd` or `source.d2`: lay out left to right, use at most 9 nodes and at most 4 words per label, label relationships, and include a legend. Describe every embedded asset in asset.yml `embeds` so AI provenance is inherited.

Preview locally with `bstudio render-preview <source> --size WxH --out <temporary.png>`. Inspect and iterate on clipping, safe zones, contrast, hierarchy and fidelity; previews are disposable, and only declared sources and asset.yml are copied back. For video, follow studio-video and its HyperFrames guidance.
