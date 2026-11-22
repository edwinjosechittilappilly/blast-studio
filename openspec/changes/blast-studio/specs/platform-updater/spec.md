# Platform Updater

## Purpose

Track authoritative platform and provider sources and make data changes reviewable and human-verifiable.

## ADDED Requirements

### Requirement: Source registry
The system SHALL maintain `platforms/sources.yml` entries identifying source, platform, scope, detector and governed pack fields, including pricing and tool-release sources.

#### Scenario: Registered source
- **WHEN** a source governs pack fields
- **THEN** the registry identifies those fields and its detector

### Requirement: Page detector
The system SHALL fetch, extract and normalize page text using any configured selector or extractor, hash it with SHA-256 and store snapshots.

#### Scenario: Page text changes
- **WHEN** a successful page check produces a different normalized hash
- **THEN** the source is reported changed and its snapshot is stored

### Requirement: Git path detector
The system SHALL detect changes to a configured repository path and branch using the latest path-specific commit.

#### Scenario: Git path advances
- **WHEN** the latest commit affecting the configured path changes
- **THEN** the source is reported changed

### Requirement: Failure classification
The system SHALL report redirects, 404s and fetch failures as failed, never changed.

#### Scenario: Source returns 404
- **WHEN** a registered source returns 404
- **THEN** the report marks it failed rather than changed

### Requirement: Check report
The system SHALL write a dated update report listing affected pack fields and exit with status 2 when any source changes.

#### Scenario: Changed source
- **WHEN** at least one source changes
- **THEN** check writes the report and exits 2

### Requirement: Evidence-backed proposals
The system SHALL propose pack edits on an updates branch using snapshot diffs, requiring each edit to quote text present in the new snapshot and pass pack schema validation.

#### Scenario: Unsupported proposed edit
- **WHEN** a proposed edit cites text absent from the new snapshot
- **THEN** the edit is rejected

### Requirement: Human verification
The system SHALL let a human verify source IDs and record `verified` and `lastVerified` on their governed pack fields.

#### Scenario: Source confirmed
- **WHEN** a person verifies a source
- **THEN** its governed fields receive verification metadata

### Requirement: Weekly monitoring
The system SHALL run weekly CI checks and open or update an issue for changes; when `MODEL_API_KEY` is configured it SHALL propose changes in a read-only job and open a reviewable PR limited to pack data and snapshots.

#### Scenario: Change with model key
- **WHEN** weekly CI detects a change and the model key is configured
- **THEN** an issue and a restricted pack-data-and-snapshot PR are opened or updated without automatic merge
