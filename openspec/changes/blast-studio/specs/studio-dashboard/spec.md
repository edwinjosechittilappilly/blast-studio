# Studio Dashboard

## Purpose

Expose current projects, reviews, spend and source health through derived terminal and secure local dashboard views.

## ADDED Requirements

### Requirement: Derived terminal views
The system SHALL derive status and searchable library views by scanning project files without maintaining a separate index.

#### Scenario: Project changes on disk
- **WHEN** a project file changes before the next library query
- **THEN** the query reflects the current files

### Requirement: Loopback and host validation
The dashboard SHALL bind to `127.0.0.1` and reject requests whose Host is neither `127.0.0.1:<port>` nor `localhost:<port>`.

#### Scenario: Unexpected Host
- **WHEN** a dashboard request has a different Host
- **THEN** the server rejects it

### Requirement: Dashboard authentication
The dashboard SHALL exchange a one-time launch token for an HttpOnly SameSite=Strict cookie and redirect; all other routes SHALL require the cookie.

#### Scenario: Token reuse
- **WHEN** an already exchanged token is presented again
- **THEN** it cannot establish another session

### Requirement: Media containment
The dashboard SHALL resolve media paths with realpath and serve only files contained under the studio `projects/` directory.

#### Scenario: Symlink escape
- **WHEN** a media path resolves outside projects through a symlink
- **THEN** the server refuses to serve it

### Requirement: Dashboard views
The dashboard SHALL show projects, posts, verdicts, scores, media previews, spending versus caps, provider settings and updater status including failed sources and unverified packs.

#### Scenario: Updater status
- **WHEN** the user opens the updater view
- **THEN** the last check and changed, failed and unverified sources are visible

### Requirement: Restricted settings writes
The dashboard SHALL limit writes to budget and provider fields, preserving YAML comments through the YAML Document API, and SHALL NOT offer content editing or command execution.

#### Scenario: Content write request
- **WHEN** a request attempts to edit project content through the dashboard
- **THEN** it is rejected
