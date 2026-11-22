# Tasks

Prerequisites: reconcile merged/merging PRs #7 (feedback.yml), #9 (dashboard review) and #8 before implementing; retain their contracts. B and C depend on A; D can proceed independently after prerequisites; E depends on A–D; F verifies the integrated result.

## 1. Slice A — Storage, migration and CLI

- [ ] 1.1 Implement validated project/campaign identities, contained paths, `project.yml`, `project new` with repo/URL/note evidence, and `project list`; test metadata, multiple projects and invalid paths.
- [ ] 1.2 Implement first-run lossless migration with notice, interruption recovery, no-overwrite conflicts and idempotence; test unknown files, repeated runs and partial migration.
- [ ] 1.3 Migrate every slug-based CLI caller, status, library, media and budget attribution to `<project>/<campaign>` and group status/library by project; test distinct campaigns and rejected legacy or escaping addresses.
- [ ] 1.4 Merge shared evidence and all campaign brief inputs with unique anchors, provenance, status and untrusted boundaries; test README plus inputs and resumable `new` failure output.
- [ ] 1.5 Use `parseArgs` for all commands, accept both value spellings, implement per-command help with examples and `--version`; test command help and equivalent arguments.
- [ ] 1.6 Add `new --from` continuation without recreating the brief, `brief --force`, scoped `plan`/`make --platforms/--assets`, and reject unknown IDs in plan/make/render/review; test resume, scope and invalid IDs.
- [ ] 1.7 Implement `feedback <campaign> list|add|rm`, campaign-wide and targeted notes, and stale-target warnings that never block valid revision; test batching, removal and replanned assets.
- [ ] 1.8 Read agent asset blockers into the specs gate; print blockers, review failure reasons, top fixes, review path, next-step hints and exact asset rights-confirm commands; test an unresolved blocker fails the gate.
- [ ] 1.9 Snapshot posts, sources, outputs and reviews before make/revise/render into `history/<n>/`; implement history and restore with pre-restore preservation and test repeated mutation and recovery.

## 2. Slice B — Export and Market Blaster naming

- [ ] 2.1 Update v1 and v2 manifest schemas and exporters with project/campaign fields and `<project>--<campaign>` composite slug; test archive name, manifests, gates and distinct hyphenated pairs.
- [ ] 2.2 Pass composite slug to Market Blaster import/check and test actual importer compatibility and failure propagation without changing Market Blaster.
- [ ] 2.3 Support local export without MB, optional project-level target and explicit validated `--mb` path, `--dir` and `--force`; surface overwrite warnings, suggest force for approved-draft refusals and test both paths.
- [ ] 2.4 Preserve timestamped export history and correctly derive exported state for zip and directory exports; test repeated exports remain downloadable and library shows exported.

## 3. Slice C — Job runner API

- [ ] 3.1 Implement typed allowlisted CLI operation registry, argument validation and no-shell execution; reject arbitrary commands and path escapes in API tests.
- [ ] 3.2 Implement one atomic per-campaign lock and durable job state shared by CLI and dashboard, 409 conflict, campaign logs, pollable output, process-tree cancellation and restart recovery; implement `bstudio jobs list|cancel|log` and test CLI/dashboard races and surviving running jobs.
- [ ] 3.3 Enforce loopback, Host, session, request header and Origin protections on job and feedback endpoints; test hostile hosts/origins, unauthenticated calls and media containment.
- [ ] 3.4 Implement Keychain write-only secret handling without argv, responses or logs containing keys; test redaction and error paths.
- [ ] 3.5 Stream agent output while running, expose step, elapsed and historical ETA in CLI and live job tail, support `--quiet`, and record ledger `step` and milliseconds; test pre-exit visibility and missing history.
- [ ] 3.6 Declare `requiresTTY` in the operation registry; disable unavailable operations in the dashboard with a reason and copyable CLI command, tested with the TTY-only image provider.

## 4. Slice D — Carbon component layer

- [ ] 4.1 Bundle Apache-2.0 Carbon web components and tokens locally with esbuild; verify the installed dashboard loads offline without external assets.
- [ ] 4.2 Implement reusable score/threshold, verdict, gates, rubric evidence/fix, hooks, self-review, captioned media, job log and command form components; document inventory and usage.
- [ ] 4.3 Verify WCAG 2.1 AA, keyboard/focus, contrast, labels, announcements and 375px layout for every component; correct failures.
- [ ] 4.4 Use the same selected outline rubric as the reviewer in the rubric component; test outline and standard platforms against their actual review scores.

## 5. Slice E — Parity screens

- [ ] 5.1 Build grouped library/status and project/campaign creation screens supporting all brief inputs, `brief --force`, `new --from`, `status --verbose`, init and doctor; test CLI-equivalent options and resume.
- [ ] 5.2 Add scoped per-card re-make/re-render/re-review, revise with campaign-wide/post/asset pending notes, removal, pending count, spend warning and save-and-apply; show blockers, review reasons and actionable rights commands. Test stale notes and actual gate outcomes.
- [ ] 5.3 Add accept reason, rights confirmation, export without MB or with validated `--mb` path, `--dir`, confirmed `--force`, history and zip download, mark URL, budget, provider settings, key source status and write-only keys, sources check/verify, jobs and snapshot history/restore; verify command coverage except documented CLI-only operations.
- [ ] 5.4 Add `dashboard --open`, actionable port-in-use message, friendly HTML 401 and refreshable/back-navigable project/campaign/platform hash routes; test session and API security remains intact.

## 6. Slice F — Documentation and Slipway end-to-end

- [ ] 6.1 Update CLI, storage/migration/recovery, package/manifest, dashboard security/offline and component inventory documentation; document breaking addresses, unambiguous composite naming, CLI-only `install-skills`, `render-preview`, `sources propose`, `review --calibrate`, and P1/P2 deferral to beads.
- [ ] 6.2 Add a Slipway end-to-end test creating a project with shared evidence and multiple campaigns, streaming jobs, exercising blockers and feedback, snapshot/restore, scoped reruns, local and MB export history/download and grouped status.
- [ ] 6.3 Run focused migration, CLI, schema/import, shared-lock/restart, feedback/blocker, history, API security/job, offline and accessible responsive tests, plus the Slipway end-to-end test; verify no Market Blaster changes are required.
