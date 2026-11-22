# 1. HyperFrames for video

Status: accepted

## Context

Short videos need editable compositions for different aspect ratios and captions. The design selects an HTML-based renderer so motion work can use the same general web layout technology as stills.

## Decision

Use the optional, pinned HyperFrames dependency to render video compositions. Each requested aspect has its own source composition: `9:16`, `1:1` and `16:9` are supported. FFmpeg handles encoding, probing, frame extraction and optional audio processing. Caption sources are WebVTT; burn-in is optional. VHS is a separate path for terminal demonstrations.

## Consequences

Authors must prepare a composition for each requested aspect rather than relying on a crop to rearrange the layout. Rendering requires HyperFrames and FFmpeg; terminal demos require VHS. The renderer rejects missing HyperFrames and invalid or missing aspect lists. See [`src/render/video.ts`](https://github.com/edwinjosechittilappilly/blast-studio/blob/main/src/render/video.ts) and the [rendering design](../design/blast-studio.md#rendering).
