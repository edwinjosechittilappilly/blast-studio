# Still templates

`fillTemplate(name, data, brand)` fills text-only `{{token}}` slots and applies brand colors and fonts. HTML is escaped, including code snippets; use `code` for literal source, not markup. Bundled Latin-subset IBM Plex Sans, IBM Plex Mono and Space Grotesk fonts are SIL OFL licensed; see `fonts/*OFL.txt`. Font URLs are local and rendering is offline.

Templates: `card` (title, subtitle), `quote` (quote, attribution), `code` (title, code, subtitle), `poster` (title, subtitle, detail), `thumbnail` (title, subtitle), and `carousel-title`, `carousel-content`, `carousel-closing` (title, subtitle or body, detail). All accept `brand`, defaulting to the brand kit name. Edit the HTML sources for custom layouts. Keep text inside the 5% safe zone and inspect the returned per-text-node metrics; text over an image has unknown contrast.

Use an A-series ratio or 4:5 for posters, 16:9 for thumbnails, and 4:5 or 1:1 for carousels. Render each slide as PNG with `renderHtml`; for a PDF, combine slide elements into one HTML document and call `renderHtml` with `pdf: true` and the slide dimensions. `renderSvg` rasterizes authored SVG logos, typically at 32, 180 and 512 pixels; a 32-pixel PNG can serve as a favicon. `renderDiagram` produces SVG and PNG from Mermaid or D2.
