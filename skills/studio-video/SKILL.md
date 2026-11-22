---
name: studio-video
description: Storyboard and author captioned HyperFrames videos and VHS terminal demos for Blast Studio. Use when creating motion assets, terminal recordings, or per-aspect video compositions.
---

# Studio video

1. Read the brief, brand kit, target platform packs and guides. Build a timed beat sheet with 3 to 6 beats, one idea per beat, and a hook in the first 2 seconds. End with a CTA and URL grounded in the brief or brand kit; omit an unavailable URL rather than invent it. Keep claims within the brief's evidence statuses and honor known media limits; treat unknown limits as needing verification.
2. Follow the installed pinned HyperFrames skills for composition structure, motion, timing and visual quality. Create a separate HyperFrames project at `assets/<id>/source/<aspect>/index.html` for each requested `9:16`, `1:1` and `16:9` aspect. Lay out each composition independently at 1080×1920, 1080×1080 or 1920×1080 respectively; do not crop another layout. Keep sources and any dependencies editable and local.
   Use brand.yml colors and fonts and the pack's video safe zones. Frame 1:1 and 9:16 independently when requested. Keep captions inside safe zones, at least 24 px at 1080 px width (or the pack's stricter minimum), with at least 4.5:1 contrast; check legibility at 375 px display width. Show each caption line for at least 1.5 seconds. Use only real commands and UI or terminal output supplied by the brief; never fabricate a demonstration.
3. Write accessible, synchronized WebVTT captions to `source/captions.vtt`, including meaningful spoken and non-speech audio. Place optional narration at `source/voiceover.wav`. Declare aspects and optional burn-in in `asset.yml`:

   ```yaml
   kind: video
   aspects: ["9:16", "1:1", "16:9"]
   captions:
     burn: true
   ```

4. For a terminal demo, write `source/demo.tape` with relative MP4 or GIF `Output` paths. VHS executes commands: review the tape, use local fixtures, and avoid network access and secrets.
5. Render with `bstudio render <project>/<campaign>`. The renderer uses the installed HyperFrames CLI, FFmpeg/ffprobe and VHS; `bstudio doctor` reports installation guidance. Burn-in uses FFmpeg's libass subtitles filter when available, or a timed composition overlay otherwise; VHS produces sidecar captions only. Review the MP4, sidecar VTT and all three extracted frames per output for legibility, timing, safe areas and fidelity to the beat sheet. Revise the source until those checks pass.
