# Export Handoff

## Purpose

Deliver reviewed content and media to Market Blaster or a human publisher through explicit, verifiable handoffs.

## ADDED Requirements

### Requirement: Reviewed export
The system SHALL export only posts with `pass` or `accepted` verdicts and passing gates.

#### Scenario: Unreviewed post
- **WHEN** an export includes a post without a passing or accepted review
- **THEN** export is refused

### Requirement: Manifest contract
The system SHALL write a schema-validated version 1 export manifest and referenced assets, including `studio.reviewHash` for each post.

#### Scenario: Manifest produced
- **WHEN** eligible posts are exported
- **THEN** the manifest validates as version 1 and includes their review hashes

### Requirement: Market Blaster handoff
The system SHALL invoke `mblast import` on the export and run `mblast check` for a requested Market Blaster project, propagating failures.

#### Scenario: Import fails
- **WHEN** Market Blaster rejects an import
- **THEN** the handoff reports failure rather than success

### Requirement: Manual destinations
The system SHALL put content for platforms without a Market Blaster destination under `exports/<platform>/` and support `mark` to record the published permalink.

#### Scenario: Manual publication
- **WHEN** a user marks a manually published platform with its URL
- **THEN** the project records that permalink

### Requirement: Platform-specific handoffs
The system SHALL make LinkedIn carousel PDFs and thread files manual handoffs, preserving the files needed for attachment.

#### Scenario: LinkedIn PDF
- **WHEN** a LinkedIn carousel is exported
- **THEN** its PDF is included in a manual handoff
