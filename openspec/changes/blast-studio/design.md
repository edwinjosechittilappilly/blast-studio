# Design

## Context

The approved [Blast Studio design](../../../docs/design/blast-studio.md) is the source of truth; see the proposal for motivation. The code repository contains packs, templates and skills, while projects and unpublished content live in a separate studio root.

## Goals / Non-Goals

**Goals:** Preserve evidence, isolate untrusted inputs and agent workspaces, make review and spend auditable, and hand off only eligible content.

**Non-Goals:** Publishing, analytics, stock marketplaces, voice cloning, website automation, and Remotion or Motion Canvas adapters.

## Decisions

- Deliver M1 text and stills, M2 motion and media, then M3 operations, while implementing each group's tests and documentation alongside it. Market Blaster's `media-and-import` is a separate dependency for the integrated handoff.
- Use editable HTML/CSS with Playwright for stills, SVG for logos, Mermaid/D2 for diagrams, and separate HyperFrames compositions per aspect ratio; VHS handles terminal demos. Render metrics are review inputs, not approximations of visual quality.
- Represent briefs, plans, assets, reviews and the append-only reserve/settle ledger as files. Cache generated media by prompt hash and require `--regen` to repeat paid generation.
- Run maker and reviewer in isolated credential-free workspaces with untrusted content fenced; use a different reviewer model, validated JSON and deterministic gates before scoring. Human acceptance cannot override gates.
- Seed sourced pack data and unknowns from research. Snapshot source changes with failure separated from change; proposed pack edits require quoted evidence and schema validation, and human verification is separate.
- Use a loopback-only Node HTTP dashboard with a one-time token exchanged for a strict HttpOnly cookie. Limit writes to budget and provider settings using the YAML Document API; derive views from files.

## Risks / Trade-offs

- Scores are editorial judgments, not reach predictions; calibration and deterministic gates reduce reviewer bias.
- Reserve/settle locking and conservative crash accounting prevent concurrent calls from bypassing caps, at the cost of stranded reservations needing operator attention.
- Platform rules and tool versions drift; source snapshots, verification, freshness warnings, pinned renderers and Linux perceptual tests make drift visible.
- Separate Market Blaster implementation must land before the integrated import proof; manual handoffs remain explicit.
