# Content Review

## Purpose

Apply deterministic safety gates and evidence-backed editorial assessment before content can be exported.

## ADDED Requirements

### Requirement: Policy gate
The system SHALL enforce each destination's draft, outline or none policy before scoring, and SHALL NOT generate HN posts.

#### Scenario: Outline-only destination
- **WHEN** a destination permits only outlines
- **THEN** generated prose is not treated as a permitted draft

### Requirement: Disclosure gate
The system SHALL evaluate text, media and voice disclosure rules against post disclosure metadata, including AI-generated status inherited by composites from embedded assets.

#### Scenario: Generated embedded media
- **WHEN** a composite embeds AI-generated media and disclosure is required
- **THEN** the composite is treated as AI-generated for disclosure

### Requirement: Specification gate
The system SHALL check known platform specifications and warn with the source to verify when a specification is unknown.

#### Scenario: Unknown limit
- **WHEN** a relevant pack value is unknown
- **THEN** review emits a warning naming its source instead of inventing a limit

### Requirement: Accessibility gate
The system SHALL gate images on alt text and rendered text metrics, and video on captions, using pack thresholds for font size and contrast where known.

#### Scenario: Missing captions
- **WHEN** a video has no captions
- **THEN** the accessibility gate fails

### Requirement: Grounding gate
The system SHALL block ungrounded numbers with units, percentages or multipliers unless listed in `grounding.waive`, while ungrounded versions and identifiers SHALL warn.

#### Scenario: Unsupported metric
- **WHEN** a post claims an unwaived percentage absent from the brief
- **THEN** the grounding gate blocks export

### Requirement: Rights gate
The system SHALL block provider assets without a recorded license and logos without a checked trademark-search field.

#### Scenario: Missing license
- **WHEN** a provider asset lacks license metadata
- **THEN** the rights gate blocks export

### Requirement: Editorial rubric
The system SHALL score hook, audience fit, simplicity, anti-slop, platform fit, visual quality and value as 0, 1, 2 or N/A, with evidence and a fix for each criterion; N/A SHALL be excluded from numerator and denominator.

#### Scenario: Inapplicable visual quality
- **WHEN** visual quality is N/A for a text-only post
- **THEN** it does not affect the score denominator

### Requirement: Outline rubric
The system SHALL review outline-only destinations with a separate rubric covering coverage, evidence and community rules.

#### Scenario: Outline reviewed
- **WHEN** the destination is outline-only
- **THEN** the outline rubric is used instead of the standard rubric

### Requirement: Review verdict
The system SHALL record `pass` only when all gates pass and the score meets the threshold, `revise` for a below-threshold score, `blocked` for a blocking gate failure, and `accepted` for a valid human override.

#### Scenario: Low score without gate failures
- **WHEN** all gates pass but the score is below the default 75% threshold
- **THEN** the verdict is `revise`

### Requirement: Human acceptance
The `accept` command SHALL record a reasoned human override of scores only and SHALL NOT override a failed gate.

#### Scenario: Gate failure
- **WHEN** a user attempts to accept content with a failed rights gate
- **THEN** acceptance is refused

### Requirement: Reviewer validation
The system SHALL run the reviewer with a model different from the maker, fence its inputs as untrusted, validate output against the review JSON schema, and retry invalid output once before failing.

#### Scenario: Repeated invalid JSON
- **WHEN** both reviewer responses fail schema validation
- **THEN** review fails without recording a valid verdict

### Requirement: Calibration and bias
The system SHALL report per-criterion agreement against approximately 20 owner-labelled fixtures with `review --calibrate`, and compare hook alternatives in both orders when present, using at most two reviewer calls per post.

#### Scenario: Calibration requested
- **WHEN** the user runs review calibration
- **THEN** per-criterion agreement is reported

### Requirement: Pack freshness
The system SHALL warn during review when policy fields have not been verified for more than 90 days.

#### Scenario: Stale policy
- **WHEN** a policy field was last verified over 90 days ago
- **THEN** the review contains a freshness warning

### Requirement: Bounded revision
The `revise` command SHALL apply findings, rerender and rereview up to `review.maxRounds`, defaulting to two rounds.

#### Scenario: Revision limit reached
- **WHEN** the maximum revision rounds have run without a pass
- **THEN** the loop stops and preserves the resulting review

### Requirement: Editorial honesty
The system SHALL identify review scores as editorial judgments rather than reach predictions.

#### Scenario: Review displayed
- **WHEN** a review score is presented
- **THEN** it is not represented as a reach prediction
