# Content Inputs Delta

## MODIFIED Requirements

### Requirement: Source ingestion
The system SHALL create a campaign brief from shared project evidence and any combination of campaign idea, note, URL, PR, commit, repository and Market Blaster brief inputs, fetching URLs as text and resolving PRs and commits through gh and git. Evidence from both sources SHALL receive unique anchored sections, preserve provenance and status, and remain untrusted when passed to agents. A campaign with shared evidence alone is valid.

#### Scenario: Shared and campaign evidence
- **WHEN** a project has shared README evidence and a campaign supplies a note and URL
- **THEN** its brief contains distinct anchored sections for all three with their provenance and statuses preserved

### Requirement: Resumable creation
The `new` command SHALL accept a `<project>/<campaign>` address, run brief, plan, make, render and review in sequence and stop at the first failure with a resume command using that address. `new --from <step>` SHALL resume that step and all subsequent steps without recreating the brief, and the dashboard SHALL offer equivalent resumption and `brief --force`.

#### Scenario: Step fails
- **WHEN** rendering fails during `new`
- **THEN** later steps do not run and the user receives a `new --from render` command that resumes rendering and continues through review without recreating the brief
