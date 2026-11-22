# Dashboard Jobs

## Purpose

Run authorized dashboard operations as observable, cancellable local jobs without exposing arbitrary command execution.

## ADDED Requirements

### Requirement: Allowlisted execution
The dashboard SHALL launch only explicitly allowlisted CLI commands with validated, typed arguments as an argument vector, never through a shell. It SHALL reject unknown commands, flags, malformed campaign addresses and path escapes. Content writes SHALL occur only through CLI commands or the narrow feedback store.

#### Scenario: Shell injection attempt
- **WHEN** a request submits a command or argument outside the allowed schema, including a shell command in place of an operation
- **THEN** the server rejects the request and launches nothing

### Requirement: Campaign job exclusivity and logs
Long operations SHALL run as jobs with an identifier, state, exit outcome and pollable output. At most one job per campaign SHALL be active at a time; a concurrent request for that campaign SHALL return HTTP 409. Each campaign job SHALL write its log under that campaign's `logs/`; jobs for different campaigns MAY run concurrently.

#### Scenario: Concurrent mutation
- **WHEN** a second job is submitted for a campaign with an active job
- **THEN** the request returns 409 without launching it

#### Scenario: Poll job
- **WHEN** an authorized client polls a job
- **THEN** it receives current status and output, including terminal success, failure or cancellation

### Requirement: Cancellation and request security
An authorized client SHALL be able to cancel a running job and see its final cancelled outcome after its process and children are stopped; the campaign lock SHALL then be released. Job and feedback endpoints SHALL enforce the existing loopback, Host, session and request protections and validate Origin for state-changing requests. Secrets SHALL NOT appear in job arguments, logs, status, responses or error messages.

#### Scenario: Cancel a running job
- **WHEN** a user cancels an active campaign job
- **THEN** its process tree stops, the job becomes cancelled and another campaign job can start

#### Scenario: Cross-origin request
- **WHEN** a state-changing job request has an untrusted Origin
- **THEN** it is rejected without starting a job
