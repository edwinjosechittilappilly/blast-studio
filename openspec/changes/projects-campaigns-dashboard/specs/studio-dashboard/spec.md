# Studio Dashboard Delta

## MODIFIED Requirements

### Requirement: Derived terminal views
The system SHALL derive status and searchable library views by scanning project and campaign files without a separate index, grouping campaigns under their project in both CLI and dashboard.

#### Scenario: Campaign changes on disk
- **WHEN** a campaign file changes before the next library query
- **THEN** the query reflects the current files under its project

### Requirement: Dashboard views
The dashboard SHALL show project-grouped campaigns, posts, verdicts, scores, media previews, spending versus caps, provider settings and updater status including failed sources and unverified packs. It SHALL expose CLI workflows except the explicitly CLI-only `install-skills`, `render-preview`, `sources propose`, and `review --calibrate`. Supported workflows include init and doctor, project and campaign creation with all brief inputs and `brief --force`, resumable `new --from`, scoped plan/make/render/review including `render --regen`, revise, accept with reason, rights confirmation, local export or export to an explicit or configured Market Blaster project including `--dir` and confirmed `--force`, mark with URL, budget set/show, sources check/verify, library search, status including `--verbose`, and job and history management. It SHALL show `auth list` key presence and source without values, and support write-only Keychain entry.

#### Scenario: Revision with owner feedback
- **WHEN** an owner supplies notes on a post or asset and starts revise
- **THEN** the notes are saved to the narrow feedback store and the CLI revision workflow consumes them

#### Scenario: Write-only key
- **WHEN** an owner saves a provider key
- **THEN** it is stored in Keychain and never returned or displayed by the dashboard

#### Scenario: Outline review
- **WHEN** a platform is scored with the outline rubric
- **THEN** the dashboard displays the same outline criteria and scores used by review, not the standard rubric

#### Scenario: Queued campaign-wide feedback
- **WHEN** an owner adds or removes a pending campaign-wide, post or asset note
- **THEN** the dashboard updates the feedback queue without invoking the agent and offers “Revise (N pending)” with an agent-spend warning and a save-and-apply action

#### Scenario: Scoped card action
- **WHEN** an owner selects re-make, re-render or re-review on a card
- **THEN** the operation targets that card's valid scope and displays any errors

## ADDED Requirements

### Requirement: Dashboard session and routes
`bstudio dashboard --open` SHALL open the launch URL in the browser and port-in-use errors SHALL suggest an action. Unauthenticated HTML navigation SHALL show a friendly 401 page instructing the user to run `bstudio dashboard` again, without weakening API authentication. Hash routes SHALL support `#/p/<project>/<campaign>/<platform>` and preserve the view through refresh and browser back/forward.

#### Scenario: Expired session
- **WHEN** a user opens a dashboard page without an authenticated session
- **THEN** the browser shows the re-authentication instruction instead of raw JSON

## MODIFIED Requirements

### Requirement: Restricted settings writes
The dashboard SHALL permit supported operations only through validated allowlisted CLI commands or the narrow feedback store; settings writes SHALL retain YAML comments. It SHALL NOT expose arbitrary content editing or arbitrary command execution.

#### Scenario: Arbitrary content write request
- **WHEN** a request attempts to write project content directly outside the feedback store
- **THEN** it is rejected
