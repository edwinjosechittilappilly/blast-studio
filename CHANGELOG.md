# Changelog

All notable changes are recorded here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.1.2

### Breaking changes

- Campaigns now live inside projects and are addressed as `<project>/<campaign>` in every CLI command, the dashboard and jobs. (#14)
- Existing studios migrate automatically on first start, with campaigns moved to same-name campaigns under their old project names. Back up your studio directory first, because the migration is one-way without a backup. (#14)
- Market Blaster handoff uses the composite slug `<project>--<campaign>`, and the export zip is named `<project>--<campaign>.campaign.zip`. (#14)
- Each export is also kept under `export/<timestamp>/`, next to the stable newest zip. (#19)
- Renaming a project or campaign changes its Market Blaster slug. (#14)
- Review now requires alt text on video media, and a rendered output whose source changed since the last render fails the specs gate until you run `bstudio render`. Outputs rendered before this release only warn. (#27, #31)

### Dashboard

- Rebuilt on the Carbon design system with search, sorting, responsive layouts, dark and light themes, and a mobile card view with sort controls. (#9, #21, #24)
- Every CLI workflow is available in the dashboard: create projects and campaigns, run plan, make, render and review, accept, confirm rights, mark published, history and restore, feedback, export, settings, sources and health. (#24)
- Project page with repository, shared evidence and campaigns, including projects without campaigns yet. (#24)
- Jobs panel with live status, log tail and cancel. Dashboard jobs use the same campaign locks as the CLI. (#12, #20, #24)
- Settings for budget, providers and write-only API keys stored in the macOS login keychain, plus source-update checks and a health view with suggested fixes. (#9, #12, #24)
- Review panel compares independent rubric scores, gates and hooks with the maker's self-review. It adds score meters, expandable criteria with evidence and suggested fixes, and copy buttons. (#9, #15, #21)
- Resolve agent-declared blockers with a recorded reason, and see when a review is out of date. (#28)
- Run Revise from review findings when no feedback is queued. (#29)
- Choose manual or Market Blaster delivery per post, see each destination's route in Export, and mark manual posts published. (#30)
- Media gallery and viewer show filename, kind and poster frame, with zoom, captions and download. (#13, #17)
- Feedback form with per-note targeting by platform or asset. Apply runs the revision with progress, retry and cancel. (#9, #21)
- Dashboard sessions persist across restarts and expire after 12 hours of inactivity. (#9)

### CLI

- `revise --note "…" [--platform id | --asset id]` applies owner feedback to one platform, one asset, or the whole campaign. Feedback is stored in `feedback.yml` and doesn't use up automatic review rounds. (#7, #11)
- `feedback <address> add|list|rm` queues, inspects and removes notes without running a revision. (#11)
- `history` lists the snapshots taken before commands such as `plan`, `make`, `revise`, `render`, `delivery`, `restore` and blocker resolution overwrite artifacts, and `restore <n>` brings one back. (#11, #28, #30)
- `plan` and `make` accept `--platforms` and `--assets` to rerun a subset, and unknown IDs fail before the agent runs. (#11)
- `jobs` lists, shows logs for, and cancels durable background jobs. (#12)
- `project new|list|rename` and `campaign rename` keep records, history and spend attribution, and refuse to run during active jobs. (#14)
- `blockers <address> [list]` and `blockers <address> resolve <target> <index> --text … --reason …` resolve agent-declared blockers and record them in `resolutions.yml`. (#28)
- `delivery <address> <platform> manual|marketBlaster` routes a post natively; export writes a manual handoff under `handoff/<platform>/` and `mark` records the live URL. (#30)
- `export --list` shows previous exports. `export` without a Market Blaster target writes a local zip you can import later. The target comes from `--mb`, then `project.yml`, then studio config. (#19, #24)
- `status` shows exported and published state, delivery routes, and recommends re-exporting or re-importing when content or routes changed after the last export. (#19, #30)
- Export records a successful Market Blaster import; a zip written without importing no longer counts as handed off. (#23)
- `--version`, `-h` and `--help` work across commands, and `brief` and `new` help documents every option. (#14, #23)
- `export --mb ~/path` and `brief --mb-brief ~/path` expand `~/`. (#19, #24)
- A source checkout runs `src/` when Node can strip types, so it no longer runs stale `dist/` code. Installed packages still use `dist/`. (#16, #18)

### Quality and safety

- Placeholder gate: the specs gate fails on `[PLACEHOLDER]`-style markers in post fields, alt text, captions and rendered text. Code is exempt. (#8)
- `brief --repo` fetches the README (truncated at 40k characters), so install commands reach the agent. Campaign evidence that duplicates the project's shared evidence is skipped before fetching. (#8, #26)
- Maker self-review and preview instructions are added, review metadata is preserved and validated, and a missing review produces a warning. (#6)
- Writing, visual and motion standards are tailored to each platform pack. (#6)
- Captions are required only for videos with an audio stream, probed from the actual file. Agents can no longer write render outputs or audio metadata. (#27)
- Agent-written `asset.yml` is validated against the schema on write-back; invalid fields are sent back to the agent. (#31)
- Campaign locks are shared across CLI and dashboard. Dead-owner locks recover automatically, and cancel stops the whole process tree. (#12, #20)
- Feedback writes are serialized with a lock, so a note added during a revision isn't lost. (#9)
- API keys in the dashboard are write-only and are never returned to the browser. (#12)

### Fixes

- Revisions can edit video sources under `source/<aspect>/`, asset feedback can update the alt text of posts that use the asset, and feedback stays pending when the agent's edits are discarded or rendering fails. (#32)
- Fixed a dashboard freeze when a post contained an empty list item. (#9)
- Fixed fenced code blocks in previews closing on shorter fences or fences with trailing text. (#9)
- Fixed the media viewer's overflow icon in dark mode and the zoom control's accessibility. (#17)
- Fixed Apply being enabled during a running revision, and stale responses overwriting a newer campaign view or search. (#21)
- Fixed zip exports not being flagged as exported, and retained export history not counting as an export. (#19)
- Cancelling a job the system won't let you signal now reports that clearly instead of failing with a generic error. (#24)
- `sources check` writes its reports to the studio instead of the install directory. (#24)
