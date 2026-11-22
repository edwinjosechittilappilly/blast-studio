# Studio Dashboard Delta

## MODIFIED Requirements

### Requirement: Derived terminal views
The system SHALL derive status and searchable library views by scanning project and campaign files without a separate index, grouping campaigns under their project in both CLI and dashboard.

#### Scenario: Campaign changes on disk
- **WHEN** a campaign file changes before the next library query
- **THEN** the query reflects the current files under its project

### Requirement: Dashboard views
The dashboard SHALL show project-grouped campaigns, posts, verdicts, scores, media previews, spending versus caps, provider settings and updater status including failed sources and unverified packs. It SHALL expose every CLI command through an appropriate dashboard workflow, including project and campaign creation with all brief inputs, plan, make, render, review, revise with owner notes per post or asset, accept with reason, confirm rights, export to a configured Market Blaster project, mark with URL, budget set/show, sources check/verify, doctor, library search and status. It SHALL support provider key entry via Keychain without ever displaying stored keys.

#### Scenario: Revision with owner feedback
- **WHEN** an owner supplies notes on a post or asset and starts revise
- **THEN** the notes are saved to the narrow feedback store and the CLI revision workflow consumes them

#### Scenario: Write-only key
- **WHEN** an owner saves a provider key
- **THEN** it is stored in Keychain and never returned or displayed by the dashboard

### Requirement: Restricted settings writes
The dashboard SHALL permit supported operations only through validated allowlisted CLI commands or the narrow feedback store; settings writes SHALL retain YAML comments. It SHALL NOT expose arbitrary content editing or arbitrary command execution.

#### Scenario: Arbitrary content write request
- **WHEN** a request attempts to write project content directly outside the feedback store
- **THEN** it is rejected
