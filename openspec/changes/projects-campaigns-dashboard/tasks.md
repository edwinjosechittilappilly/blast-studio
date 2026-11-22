# Tasks

Prerequisites: reconcile merged/merging PRs #7 (feedback.yml), #9 (dashboard review) and #8 before implementing; retain their contracts. B and C depend on A; D can proceed independently after prerequisites; E depends on A–D; F verifies the integrated result.

## 1. Slice A — Storage, migration and CLI

- [ ] 1.1 Implement validated project/campaign identities, contained paths, `project.yml`, `project new` with repo/URL/note evidence, and `project list`; test metadata, multiple projects and invalid paths.
- [ ] 1.2 Implement first-run lossless migration with notice, interruption recovery, no-overwrite conflicts and idempotence; test unknown files, repeated runs and partial migration.
- [ ] 1.3 Migrate every slug-based CLI caller, status, library, media and budget attribution to `<project>/<campaign>` and group status/library by project; test distinct campaigns and rejected legacy or escaping addresses.
- [ ] 1.4 Merge shared evidence and all campaign brief inputs with unique anchors, provenance, status and untrusted boundaries; test README plus inputs and resumable `new` failure output.

## 2. Slice B — Export and Market Blaster naming

- [ ] 2.1 Update v1 and v2 manifest schemas and exporters with project/campaign fields and composite slug; test archive name, manifests, gates and collision handling.
- [ ] 2.2 Pass composite slug to Market Blaster import/check and test actual importer compatibility and failure propagation without changing Market Blaster.

## 3. Slice C — Job runner API

- [ ] 3.1 Implement typed allowlisted CLI operation registry, argument validation and no-shell execution; reject arbitrary commands and path escapes in API tests.
- [ ] 3.2 Implement atomic per-campaign exclusivity, 409 conflict, campaign logs, pollable states/output, process-tree cancellation and restart recovery; test races, independent campaigns, failures and cancellation.
- [ ] 3.3 Enforce loopback, Host, session, request header and Origin protections on job and feedback endpoints; test hostile hosts/origins, unauthenticated calls and media containment.
- [ ] 3.4 Implement Keychain write-only secret handling without argv, responses or logs containing keys; test redaction and error paths.

## 4. Slice D — Carbon component layer

- [ ] 4.1 Bundle Apache-2.0 Carbon web components and tokens locally with esbuild; verify the installed dashboard loads offline without external assets.
- [ ] 4.2 Implement reusable score/threshold, verdict, gates, rubric evidence/fix, hooks, self-review, captioned media, job log and command form components; document inventory and usage.
- [ ] 4.3 Verify WCAG 2.1 AA, keyboard/focus, contrast, labels, announcements and 375px layout for every component; correct failures.

## 5. Slice E — Parity screens

- [ ] 5.1 Build grouped library/status and project/campaign creation screens supporting every brief input and shared evidence; verify outputs match CLI.
- [ ] 5.2 Add plan, make, render, review, revise, per-post/asset owner notes via feedback store, accept reason, rights confirmation, export to configured Market Blaster project and mark URL; verify full workflow and gates.
- [ ] 5.3 Add budget set/show, provider settings and write-only keys, sources check/verify, doctor and all remaining CLI commands, with validated forms, job status and cancellation; verify complete CLI command coverage.

## 6. Slice F — Documentation and Slipway end-to-end

- [ ] 6.1 Update CLI, storage/migration/recovery, package/manifest, dashboard security/offline and component inventory documentation; document breaking addresses and composite slug collision behavior.
- [ ] 6.2 Add a Slipway end-to-end test creating a project with shared evidence and multiple campaigns, generating/reviewing/revising with owner notes, confirming rights, exporting/importing and marking, with grouped status and job lifecycle assertions.
- [ ] 6.3 Run focused migration, CLI, schema/import, API security/job, offline and accessible responsive tests, plus the Slipway end-to-end test; verify no Market Blaster changes are required.
