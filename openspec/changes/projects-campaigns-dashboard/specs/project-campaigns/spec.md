# Project Campaigns

## Purpose

Organize related campaigns under a project with reusable evidence and safe migration from the legacy layout.

## ADDED Requirements

### Requirement: Project and campaign storage
The system SHALL store each project in `projects/<project>/` with `project.yml` containing name, optional brand overrides and links, shared evidence in `evidence/`, and each campaign in `campaigns/<campaign>/` containing its brief, plan, posts, assets, reviews, feedback.yml, logs and export as applicable. Project and campaign names SHALL each obey the existing slug rules and paths SHALL remain contained under the studio root.

#### Scenario: Independent campaigns
- **WHEN** two campaigns are created in one project
- **THEN** they share project evidence but retain separate campaign files and reviews

### Requirement: Project commands and campaign addresses
The CLI SHALL provide `bstudio project new <project> [--repo/--url/--note …]` to record project metadata and shared evidence and `bstudio project list` to enumerate projects. Every CLI argument that previously identified a campaign by slug SHALL use `<project>/<campaign>`; invalid or ambiguous addresses SHALL be rejected.

#### Scenario: Addressing a campaign
- **WHEN** a command receives `acme/launch`
- **THEN** it operates on campaign `launch` in project `acme`, not another project or campaign

### Requirement: Automatic lossless migration
On first run the system SHALL automatically migrate each legacy `projects/<slug>/brief.md` campaign to `projects/<slug>/campaigns/<slug>/`, print a notice, and retain all campaign files including unknown files. Migration SHALL be idempotent and recoverable after interruption; existing destination content SHALL never be overwritten or deleted on collision and the conflict SHALL be reported.

#### Scenario: Legacy migration
- **WHEN** a legacy project containing a brief, assets and an unknown file is encountered
- **THEN** the campaign and all its files are preserved under the nested campaign and a migration notice is printed

#### Scenario: Interrupted or conflicting migration
- **WHEN** migration is interrupted or its destination contains a conflicting file
- **THEN** subsequent runs preserve both sides, report unresolved conflicts and do not claim successful migration until safe completion

### Requirement: Consistent command arguments and help
CLI commands SHALL use `parseArgs`, accept both `--option=value` and `--option value` for valued options, provide per-command `--help` with examples, and expose `bstudio --version`. Existing supported options SHALL remain available with campaign addresses.

#### Scenario: Command help and option spelling
- **WHEN** a user requests `bstudio render --help` or uses either spelling of a valued render option
- **THEN** help shows examples or the equivalent option value is accepted without treating help as a campaign address

### Requirement: Scoped campaign operations
`plan` and `make` SHALL accept `--platforms` and `--assets` to scope work; `render` and `review` SHALL preserve their supported scope options. All scoped operations SHALL reject unknown platform or asset IDs rather than silently skipping them, and only the requested scope SHALL be changed.

#### Scenario: Mistyped scope
- **WHEN** a user supplies an unknown asset or platform ID to a scoped operation
- **THEN** the command fails with the unknown ID and does not report success

### Requirement: Campaign snapshots and restoration
Before `make`, `revise` or `render` overwrites campaign posts, sources, output or reviews, the system SHALL save a recoverable snapshot in `history/<n>/`. `bstudio history <project>/<campaign>` SHALL list snapshots and `bstudio restore <project>/<campaign> <n>` SHALL restore a selected snapshot without losing the current state; the dashboard SHALL show version lists per post or asset and support restoration.

#### Scenario: Restore previous output
- **WHEN** a user restores an earlier snapshot after a rerun
- **THEN** the selected posts, sources, outputs and reviews are restored and the pre-restore state remains recoverable

### Requirement: Actionable review and blockers
Agent-declared asset `blockers` SHALL be surfaced by `make`, SHALL fail the specs gate, and SHALL be displayed on the relevant dashboard card. `review` SHALL print failing gates, top fixes and the `review.md` path; status SHALL show a next-step hint. Rights errors SHALL name the asset and an exact copyable `bstudio confirm` command.

#### Scenario: Missing install command blocker
- **WHEN** an asset declares a blocker for missing evidence
- **THEN** make and the dashboard show its text, the specs gate fails, and review identifies the corrective next action

### Requirement: Feedback queue management
`bstudio feedback <project>/<campaign> list|add --note <text> [--asset <id>|--platform <id>]|rm <id>` SHALL list, queue and remove notes without invoking an agent; an untargeted note applies campaign-wide. During revision, entries targeting removed plan items SHALL be marked stale and warned about, without blocking valid feedback or the revision.

#### Scenario: Stale feedback
- **WHEN** a queued note targets an asset removed from the current plan
- **THEN** revise warns and marks the note stale while applying valid pending notes
