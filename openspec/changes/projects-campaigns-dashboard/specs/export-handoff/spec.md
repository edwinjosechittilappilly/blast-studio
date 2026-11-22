# Export Handoff Delta

## MODIFIED Requirements

### Requirement: Manifest contract
The system SHALL write schema-validated export manifests and referenced assets, including `studio.reviewHash` for each post and explicit `project` and `campaign` identity fields. The campaign zip SHALL be named `<project>-<campaign>.campaign.zip`; its compatibility slug SHALL be `<project>-<campaign>`. Existing reviewed-export gates remain in force.

#### Scenario: Campaign package produced
- **WHEN** eligible campaign `acme/launch` is exported
- **THEN** the package is `acme-launch.campaign.zip` and its validated manifest identifies project `acme`, campaign `launch`, and slug `acme-launch`

### Requirement: Market Blaster handoff
The system SHALL invoke `mblast import` on the export using slug `<project>-<campaign>` and run `mblast check` for the requested Market Blaster project, propagating failures. The package and invocation SHALL remain compatible with Market Blaster without changing Market Blaster.

#### Scenario: Import fails
- **WHEN** Market Blaster rejects an import
- **THEN** the handoff reports failure rather than success
