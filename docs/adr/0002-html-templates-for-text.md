# 2. HTML templates for text in graphics

Status: accepted

## Context

Cards, posters and carousel slides need legible, editable text. Image generation is a separate optional capability and does not give authors the same direct control over typography and copy.

## Decision

Author text-bearing stills as HTML and CSS. The bundled templates accept text and brand tokens; the template helper escapes text values. Playwright renders HTML to PNG, and carousel slides can also be combined into a PDF. Local font assets and offline rendering keep the layout reproducible without fetching remote resources during the render.

## Consequences

Authors can edit the source and rerender at the intended dimensions. Rendering records text metrics for font size, contrast and overflow for review; contrast over an image may be unknown and needs inspection. The render command also accepts authored HTML sources, so templates are a starting point rather than a mandatory layout. See [`templates/README.md`](https://github.com/edwinjosechittilappilly/blast-studio/blob/main/templates/README.md), [`src/render/stills.ts`](https://github.com/edwinjosechittilappilly/blast-studio/blob/main/src/render/stills.ts) and [`src/render/metrics.ts`](https://github.com/edwinjosechittilappilly/blast-studio/blob/main/src/render/metrics.ts).
