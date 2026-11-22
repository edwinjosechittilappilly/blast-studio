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
CLI and dashboard SHALL acquire the same atomic per-campaign lock; at most one job per campaign SHALL be active across processes. A concurrent dashboard request SHALL return HTTP 409, while a CLI conflict reports the active job. Different campaigns MAY run concurrently.

#### Scenario: Concurrent mutation
- **WHEN** a second job is submitted for a campaign with an active job
- **THEN** the request returns 409 without launching it

#### Scenario: Poll job
- **WHEN** an authorized client polls a job
- **THEN** it receives current status and output, including terminal success, failure or cancellation

#### Scenario: CLI and dashboard contention
- **WHEN** a CLI campaign job remains active across a dashboard restart
- **THEN** its state and log remain visible and a dashboard attempt to run another job on that campaign returns 409

### Requirement: Durable jobs and CLI controls
Long operations SHALL run as durable jobs with identifiers, state, exit outcome and pollable output. Campaign logs SHALL reside under `logs/` and job state and logs SHALL survive dashboard restart. The CLI SHALL offer `bstudio jobs list`, `bstudio jobs cancel <id>` and `bstudio jobs log <id>`.

#### Scenario: Inspect a durable job
- **WHEN** a user runs `bstudio jobs log <id>` after a dashboard restart
- **THEN** the persisted job output is available without restarting the job

### Requirement: Streamed agent progress
The agent runner SHALL stream output while the agent runs to the CLI and durable job log. CLI and dashboard SHALL show the current step, elapsed time and an estimated usual duration derived from prior ledger timings when available; otherwise they SHALL indicate the estimate is unavailable. Ledger entries SHALL record the step and elapsed milliseconds; `--quiet` SHALL suppress live progress without disabling logging.

#### Scenario: Long agent step
- **WHEN** an agent emits output before it exits
- **THEN** the job log and dashboard live tail show it promptly along with step, elapsed time and any available estimate

### Requirement: Terminal-dependent operations
The operation registry SHALL declare `requiresTTY` for operations that need a terminal. The dashboard SHALL disable such operations when no TTY is available, explain why, and provide a copyable equivalent CLI command rather than starting a guaranteed-to-fail job.

#### Scenario: TTY-only image provider
- **WHEN** the selected image provider requires a TTY and the dashboard has none
- **THEN** the operation is disabled with a reason and copyable CLI command

### Requirement: Cancellation and request security
An authorized client SHALL be able to cancel a running job and see its final cancelled outcome after its process and children are stopped; the campaign lock SHALL then be released. Job and feedback endpoints SHALL enforce the existing loopback, Host, session and request protections and validate Origin for state-changing requests. Secrets SHALL NOT appear in job arguments, logs, status, responses or error messages.

#### Scenario: Cancel a running job
- **WHEN** a user cancels an active campaign job
- **THEN** its process tree stops, the job becomes cancelled and another campaign job can start

#### Scenario: Cross-origin request
- **WHEN** a state-changing job request has an untrusted Origin
- **THEN** it is rejected without starting a job
