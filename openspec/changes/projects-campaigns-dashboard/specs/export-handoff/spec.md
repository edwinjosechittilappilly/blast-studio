# Export Handoff Delta

## MODIFIED Requirements

### Requirement: Manifest contract
The system SHALL write schema-validated export manifests and referenced assets, including `studio.reviewHash` for each post and explicit `project` and `campaign` identity fields. The campaign zip SHALL be named `<project>--<campaign>.campaign.zip`; its compatibility slug SHALL be `<project>--<campaign>`. Existing reviewed-export gates remain in force.

#### Scenario: Campaign package produced
- **WHEN** eligible campaign `acme/launch` is exported
- **THEN** the package is `acme--launch.campaign.zip` and its validated manifest identifies project `acme`, campaign `launch`, and slug `acme--launch`

### Requirement: Market Blaster handoff
When an import target is requested, the system SHALL invoke `mblast import` on the export using slug `<project>--<campaign>` and run `mblast check` for that Market Blaster project, propagating failures and surfacing warnings. Export SHALL also work without a configured Market Blaster project, producing a local package without importing. The dashboard SHALL support a validated explicit `--mb <path>`, `--dir` and confirmed `--force` as well as an optional project-level `marketBlaster.project`. Approved-draft overwrite failures SHALL suggest the appropriate `--force` command. The package and invocation SHALL remain compatible with Market Blaster without changing its behavior.

#### Scenario: Import fails
- **WHEN** Market Blaster rejects an import
- **THEN** the handoff reports failure rather than success

#### Scenario: Local export without target
- **WHEN** no Market Blaster project is configured or requested
- **THEN** export succeeds locally without attempting import and the dashboard offers the resulting zip for download

## ADDED Requirements

### Requirement: Export history and derived status
Each export SHALL preserve its package and associated artifacts in a timestamped `export/<timestamp>/` history without overwriting prior exports. Library and status SHALL identify successful zip and directory exports correctly. The dashboard SHALL list history and allow downloading a campaign zip.

#### Scenario: Repeated zip export
- **WHEN** a campaign is exported twice as a zip
- **THEN** both exports remain available and the library reports the campaign as exported
