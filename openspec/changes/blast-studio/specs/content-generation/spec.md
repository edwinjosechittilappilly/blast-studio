# Content Generation

## Purpose

Turn grounded briefs into editable, platform-native content and reproducible rendered media.

## ADDED Requirements

### Requirement: Platform plan
The system SHALL produce a plan per platform with post type, three hook options, angle and required assets.

#### Scenario: Planning a platform
- **WHEN** a user plans a project
- **THEN** each selected platform has those four plan fields

### Requirement: Isolated maker
The maker SHALL run in a temporary workspace with an allowlisted environment and free offline `render-preview`, copying back only declared files. Agents and rendering tools SHALL run as the current user by default; `agent.sandbox: on` SHALL enable the available OS sandbox for both.

#### Scenario: Agent creates an undeclared file
- **WHEN** the maker finishes with an undeclared file in its workspace
- **THEN** that file is not copied into the project

#### Scenario: Sandbox opt-in
- **WHEN** the user enables `agent.sandbox: on`
- **THEN** maker, reviewer and render tool processes use the available OS sandbox

#### Scenario: Default local execution
- **WHEN** the user does not enable the sandbox
- **THEN** those processes run as the current user with their environment allowlists still applied

### Requirement: Still rendering
The system SHALL render editable HTML cards, quotes, code cards, posters and thumbnails to PNG, and carousel slides to individual PNGs and a PDF.

#### Scenario: Carousel rendering
- **WHEN** a carousel is rendered
- **THEN** each slide has a PNG and the carousel has a PDF for manual handoff

### Requirement: Logo rendering
The system SHALL render editable SVG logos as SVG, PNG at 32, 180 and 512 pixels, and a favicon.

#### Scenario: Logo output
- **WHEN** a logo is rendered
- **THEN** the source and all specified output sizes are retained

### Requirement: Diagram rendering
The system SHALL render Mermaid and D2 diagram sources to SVG and PNG, with optional arch-diagram support.

#### Scenario: Diagram source
- **WHEN** a supported diagram source is rendered
- **THEN** SVG and PNG outputs are produced

### Requirement: Render metrics
The system SHALL record per-text-node minimum font size, WCAG contrast and safe-zone overflow for rendered stills.

#### Scenario: Text exceeds safe zone
- **WHEN** a rendered text node overflows the safe zone
- **THEN** its render metrics record the overflow for review

### Requirement: Motion rendering
The system SHALL render separate HyperFrames compositions for 9:16, 1:1 and 16:9 and render VHS terminal tapes to MP4 or GIF.

#### Scenario: Multiple aspect ratios
- **WHEN** motion is requested for multiple aspect ratios
- **THEN** each ratio uses its own composition rather than a crop

### Requirement: Captions
The system SHALL produce VTT captions for video and support burned-in captions on request.

#### Scenario: Burned captions requested
- **WHEN** the user requests burned-in captions
- **THEN** the rendered video includes them and a VTT file is available

### Requirement: Media providers
The system SHALL support `gemini`, `openai`, `omp` and `none` image providers and `openai` and `none` voice providers, subject to provider and budget policy.

#### Scenario: Voice generation
- **WHEN** enabled OpenAI voice generation is requested within budget
- **THEN** the system produces audio for mixing into the video

### Requirement: Generation cache
The system SHALL cache paid generation by prompt hash and rerun a cached generation only when `--regen` is specified.

#### Scenario: Cached prompt
- **WHEN** the same paid prompt is rendered again without `--regen`
- **THEN** the cached output is reused without a paid call

### Requirement: Thread handoff
The system SHALL export X, Bluesky and Threads threads as handoff files rather than automatically publishing them.

#### Scenario: Thread generated
- **WHEN** a thread is exported
- **THEN** the user receives a handoff file containing its ordered posts

### Requirement: Renderer availability
The system SHALL fail a render when its renderer is missing and provide the installation guidance from doctor.

#### Scenario: Missing tool
- **WHEN** a required renderer is unavailable
- **THEN** rendering fails with an actionable installation command
