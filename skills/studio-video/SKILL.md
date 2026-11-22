---
name: studio-video
description: Storyboard and author captioned HyperFrames videos and VHS terminal demos for Blast Studio. Use when creating motion assets, terminal recordings, or per-aspect video compositions.
---

# Studio video

1. Read the brief, brand kit, target platform packs and guides. Build a timed beat sheet for each platform: hook, evidence, demonstration and ending. Keep claims within the brief's evidence statuses and honor known media limits; treat unknown limits as needing verification.
2. Follow the installed pinned HyperFrames skills for composition structure, motion, timing and visual quality. Create a separate HyperFrames project at `assets/<id>/source/<aspect>/index.html` for each requested `9:16`, `1:1` and `16:9` aspect. Lay out each composition independently at 1080×1920, 1080×1080 or 1920×1080 respectively; do not crop another layout. Keep sources and any dependencies editable and local.
3. Write accessible, synchronized WebVTT captions to `source/captions.vtt`, including meaningful spoken and non-speech audio. Place optional narration at `source/voiceover.wav`. Declare aspects and optional burn-in in `asset.yml`:

   ```yaml
   kind: video
   aspects: ["9:16", "1:1", "16:9"]
   captions:
     burn: true
   ```

4. For a terminal demo, write `source/demo.tape` with relative MP4 or GIF `Output` paths. VHS executes commands: review the tape, use local fixtures, and avoid network access and secrets.
5. Render with `bstudio render <slug>`. The renderer uses the installed HyperFrames CLI, FFmpeg/ffprobe and VHS; `bstudio doctor` reports installation guidance. Burn-in uses FFmpeg's libass subtitles filter when available, or a timed composition overlay otherwise; VHS produces sidecar captions only. Review the MP4, sidecar VTT and all three extracted frames per output for legibility, timing, safe areas and fidelity to the beat sheet. Revise the source until those checks pass.
