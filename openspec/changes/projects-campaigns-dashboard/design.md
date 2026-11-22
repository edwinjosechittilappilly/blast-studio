# Design

## Context

`projectDir` currently maps one slug directly to `projects/<slug>`, and brief, generation, review, export and library use that directory as the campaign. The dashboard is a loopback HTTP server with a one-time token, session cookie, Host validation, contained media serving and restricted settings writes. Its static UI is currently unbundled. Export has both a v1 directory manifest and a v2 campaign zip; Market Blaster currently receives the same slug used in Studio. See proposal.md for motivation. PRs #7, #9 and #8 are prerequisites; use their merged contracts rather than duplicating or replacing feedback and review behavior.

## Goals / Non-Goals

**Goals:** A single identity and storage model throughout CLI and dashboard; safe automatic migration; full workflow access with a narrow execution boundary; locally bundled, accessible components.

**Non-Goals:** Changing Market Blaster, arbitrary file editing, arbitrary shell access, hosted or multi-user dashboard, or changing review/export eligibility gates.

## Decisions

1. Parse two independently validated slug segments into a campaign identity, resolve via a single contained path helper, and migrate every existing caller, including status, library, budget ledger attribution, media, commands and resume output. Store `project.yml` with name, optional brand overrides and links and shared evidence under `evidence/`; retain all campaign artifacts under `campaigns/<campaign>/`. `project new` records supplied sources as reusable evidence. Brief generation combines those sources with all existing campaign input options, assigns unique evidence anchors and preserves origin, status and untrusted fencing. Do not use slash replacement as path validation.
2. Before commands and dashboard reads, detect legacy roots by their top-level brief. Move legacy campaign entries into a same-slug campaign without overwriting; retain unknown entries and preserve metadata. Use a recoverable, resumable per-project migration journal or staged moves, notice on migration, and conflict reporting that leaves all versions intact. A marker alone is insufficient if a process crashes midway. Never interpret a migrated project as legacy on later runs. Explicitly test partial migration, conflict, file preservation and repeated startup.
3. Carry distinct project and campaign fields into v1 and v2 export schema/contracts while retaining a composite `slug` understood by the existing importer. Zip naming and the `mblast import --slug` and subsequent check use the composite name. Two pairs can have the same hyphenated composite; detect a conflicting destination rather than silently replacing a different campaign unless an explicit existing force policy authorizes it. Verify schema compatibility with the actual Market Blaster importer; do not change that importer.
4. Use a server-owned command registry mapping operation IDs to validated structured arguments and CLI argument vectors. Never accept executable paths or command strings from the browser. Preserve existing session/Host controls, add strict same-origin validation on writes plus the existing request header, and contain paths. An atomic per-campaign lock covers job startup through process-tree exit, with explicit queued/running/succeeded/failed/cancelled states, logs under campaign `logs/`, and poll and cancellation endpoints. Global operations use the same registry and lifecycle but are not assigned a fictitious campaign. On restart, reconcile orphaned jobs and release stale locks without reporting success. Keychain entry uses a dedicated write-only secret channel, never argv or log output; redact errors.
5. Bundle `@carbon/web-components` with esbuild as local static assets, applying Carbon tokens in a small reusable layer rather than a parallel design system. Compose the component inventory into screens and preserve text equivalents, focus order, labels, live job updates and responsive layouts. Serve media with existing containment and captions where available. Replace the old spec's no-command-execution rule with the narrow registry and retain no arbitrary content edits; feedback uses only the PR #7 store.

## Risks / Trade-offs

- Migration must balance automatic startup with preservation: conflicts stop the affected migration and report actionable paths, not delete or overwrite data. Backups and recovery instructions belong in documentation.
- Composite slugs are not injective; detect collisions with stored project/campaign provenance before handoff. Existing Market Blaster behavior and manifest acceptance must be covered by an integration fixture.
- Long-running subprocess cancellation and concurrent requests can race; test process termination, lock release and restart recovery. Provider secrets and untrusted evidence must never leak into logs or instructions.
- Carbon packaging and WCAG compliance require offline, keyboard, narrow viewport and assistive-technology checks, not only unit tests.
