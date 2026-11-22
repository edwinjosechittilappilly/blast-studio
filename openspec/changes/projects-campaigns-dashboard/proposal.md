# Proposal

## Why

Blast Studio currently treats each campaign as a project, duplicating shared evidence and making related campaigns difficult to navigate. Its local dashboard exposes a subset of CLI workflows, forcing owners back to the terminal to create, review, revise and deliver content.

## What Changes

- **BREAKING**: Introduce projects containing campaigns; require `<project>/<campaign>` wherever the CLI previously accepted a campaign slug, and automatically migrate legacy single-campaign projects without losing files.
- Add project metadata and shared evidence creation, merge shared and campaign-specific evidence into briefs, and group library and status by project.
- **BREAKING**: Name campaign archives and Market Blaster import slugs `<project>-<campaign>` and include both identities in manifests, preserving Market Blaster compatibility without changes to it.
- Provide dashboard parity for all CLI operations through validated, allowlisted jobs and narrow feedback writes; preserve local authentication and request protections.
- Bundle IBM Carbon web components locally and provide an accessible, responsive, reusable review and command interface with a documented component inventory.

## Capabilities

### New Capabilities
- `project-campaigns`: Project metadata, shared evidence, campaign identities and lossless migration.
- `dashboard-jobs`: Validated command execution, job lifecycle, logging and cancellation.
- `dashboard-components`: Offline Carbon component layer and accessible responsive behavior.

### Modified Capabilities
- `content-inputs`: Merge project evidence and campaign inputs and use campaign addresses.
- `studio-dashboard`: Project-grouped views and full CLI workflow access replace its prohibition on command execution.
- `export-handoff`: Carry both identities and use the composite archive and Market Blaster slug.

## Impact

Storage paths, CLI arguments, library/status, budget attribution, export schemas and package documentation, dashboard API and assets, and tests must change together. This change depends on merged or merging PRs #7 (feedback.yml), #9 (dashboard review), and #8; reconcile their actual merged contracts before implementation. Market Blaster itself is unchanged.
