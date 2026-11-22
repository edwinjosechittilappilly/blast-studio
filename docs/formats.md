# Formats and assets

Each platform plan selects a post type and zero or more assets. A post is Markdown at `posts/<platform>.md`, with YAML frontmatter for platform, evidence, media and optional title, disclosure and thread. An asset lives at `assets/<id>/`, with editable source, `asset.yml` metadata and rendered files in `out/`. The platform pack controls which post types are allowed and records known media specifications. Check its guide and current platform requirements before publication.

## Still images and diagrams

| Asset kind | Source | Rendered output |
| --- | --- | --- |
| `card`, `poster` | `source.html` | `out/image.png` |
| `carousel` | HTML slides in `source/`, sorted by filename | numbered PNG slides and `out/carousel.pdf` |
| `logo` | `source.svg` | SVG, PNGs at 32, 180 and 512 pixels, and favicon |
| `diagram` | `source.mmd` or `source.d2` | SVG and PNG |

Cards and posters use Playwright. The renderer records text size, contrast and overflow measurements for review. Mermaid diagrams need Mermaid CLI; D2 diagrams need D2. Logos require a trademark search check in their metadata before they can pass the rights gate. Templates in the repository provide starting points for HTML artwork.

## Video and terminal demos

Video assets use a HyperFrames composition at `source/<aspect>/index.html` for every aspect in `asset.yml`. Supported aspects are `9:16`, `1:1`, and `16:9`; each composition must render at the corresponding expected dimensions. HyperFrames and FFmpeg produce MP4 outputs, and three frames per output are extracted for review.

Put WebVTT captions at `source/captions.vtt`. They are copied to the output; `captions.burn: true` requests burned-in captions and requires the source file. A `source/voiceover.wav`, when present, is mixed into the video. Video review requires a VTT output. Each aspect needs its own composition, so adjust the layout for its dimensions.

Terminal demos use VHS and a `source/demo.tape` with MP4 or GIF `Output` directives. Review tapes before rendering: they execute terminal commands and may access the network. GIF output cannot carry voiceover. FFmpeg is used for media processing and frame extraction.

## Generated illustration and voice

An `illustration` asset reads a prompt from `source.json`; a `voiceover` asset reads `source.txt`. Select an image provider (`gemini`, `openai`, or `omp`) or the OpenAI voice provider in the studio configuration before using them. Both default to `none`. Provider calls can incur costs and are subject to the configured budget. Generated metadata records provider, cost, prompt hash, AI status and license information. Generated assets used by composites propagate their AI status through `embeds`.

`bstudio render <project>/<campaign>` uses cached paid generation when available. `--regen` requests fresh generation. Review licensing, disclosure and platform requirements for the resulting media.

## Preview

`bstudio render-preview <file> --size WxH --out <png>` renders one HTML, SVG, Mermaid or D2 source offline. It is useful while editing an asset; project rendering still produces the outputs and metadata used by review and export.
