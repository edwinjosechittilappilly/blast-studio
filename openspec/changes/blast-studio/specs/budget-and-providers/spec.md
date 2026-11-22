# Budget and Providers

## Purpose

Keep provider usage explicit, auditable and within configurable project and monthly spending limits.

## ADDED Requirements

### Requirement: Editable caps
The system SHALL support CLI and dashboard editing of monthly and per-project USD caps, defaulting the monthly cap to zero.

#### Scenario: Zero cap
- **WHEN** the monthly cap is zero
- **THEN** paid calls are disabled

### Requirement: Reserve and settle
The system SHALL lock the ledger and reserve a priced upper bound before a paid call, rejecting reservations that exceed the UTC month or project cap, then append actual settlement after the call.

#### Scenario: Concurrent paid calls
- **WHEN** simultaneous calls would together exceed a cap
- **THEN** locking and reservation prevent the excess call from starting

#### Scenario: Interrupted call
- **WHEN** a process crashes after reserving and before settling
- **THEN** its reservation remains counted

### Requirement: Price table
The system SHALL use a dated price table with upper-bound costs and refuse paid calls for unknown models.

#### Scenario: Unknown model
- **WHEN** a paid call has no priced model entry
- **THEN** the call is refused

### Requirement: Upload policy
The system SHALL default `providers.allowUpload` to false and SHALL NOT upload reference images unless it is enabled.

#### Scenario: Reference upload disabled
- **WHEN** a provider request includes a reference image while uploads are disabled
- **THEN** the reference image is not uploaded

### Requirement: Agent accounting
The system SHALL record plan, make, review and revise agent runs with model, duration and reported tokens or units; subscription-backed runs have null USD and only API-billed runs count toward caps.

#### Scenario: Subscription-backed run
- **WHEN** a subscription-backed agent run finishes
- **THEN** its ledger entry records null USD without charging the cap

### Requirement: Interactive omp provider
The system SHALL refuse the interactive-only `omp` image provider in CI and record its usage as units with null USD.

#### Scenario: CI requests omp
- **WHEN** CI requests an `omp` image generation
- **THEN** the request is refused
