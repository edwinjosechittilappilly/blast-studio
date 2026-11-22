# Content Inputs

## Purpose

Create evidence-grounded briefs from diverse inputs while keeping unpublished work and untrusted sources isolated.

## ADDED Requirements

### Requirement: Source ingestion
The system SHALL create a brief from any combination of idea, note, URL, PR, commit, repository and Market Blaster brief inputs, fetching URLs as text and resolving PRs and commits through gh and git.

#### Scenario: Multiple sources
- **WHEN** a user supplies several supported inputs
- **THEN** the brief contains a separate anchored section for each source

### Requirement: Evidence status
Brief sections SHALL use `## [E<n>] <title>` anchors and preserve `shipped`, `planned` or `claim` status when provided.

#### Scenario: Planned evidence
- **WHEN** a source is marked planned
- **THEN** its anchored brief section retains that status

### Requirement: Untrusted source boundaries
The system SHALL fence external source content as untrusted when presenting it to agents.

#### Scenario: Hostile fetched content
- **WHEN** a fetched page contains instructions to the agent
- **THEN** those instructions remain inside an untrusted content fence

### Requirement: Private studio root
The system SHALL default project storage to `~/BlastStudio` outside the code repository and allow override through `studio.root` or `BSTUDIO_HOME`.

#### Scenario: Default storage
- **WHEN** a project is created with no root override
- **THEN** its files are stored under the default studio root

### Requirement: Resumable creation
The `new` command SHALL run brief, plan, make, render and review in sequence and stop at the first failure with a resume command.

#### Scenario: Step fails
- **WHEN** rendering fails during `new`
- **THEN** later steps do not run and the user receives the command to resume
