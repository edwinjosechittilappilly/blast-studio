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
