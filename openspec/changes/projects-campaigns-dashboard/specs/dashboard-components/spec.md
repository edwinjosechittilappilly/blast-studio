# Dashboard Components

## Purpose

Provide consistent, accessible and offline-capable dashboard controls for campaign workflows and review.

## ADDED Requirements

### Requirement: Local Carbon component layer
The dashboard SHALL bundle Apache-2.0 `@carbon/web-components` locally at build time with esbuild, without runtime CDN or network dependency. A reusable layer using Carbon design tokens SHALL provide a score meter against its threshold, verdict tag, gate list, rubric table with evidence and fix, hook comparison, self-review panel, media viewer including captions, job log and command forms. The component inventory and usage SHALL be documented.

#### Scenario: Offline dashboard
- **WHEN** the installed dashboard is opened without network access
- **THEN** its bundled components, styles and local workflow interface load without external requests

### Requirement: Accessible responsive controls
The dashboard SHALL meet WCAG 2.1 AA and remain usable at 375 CSS pixels, including keyboard operation, visible focus, accessible labels and status announcements, adequate contrast, and captions for video when provided. Review information SHALL NOT rely on color alone.

#### Scenario: Narrow keyboard review
- **WHEN** an owner uses only a keyboard at 375 pixels to inspect a review and start a job
- **THEN** controls and review details remain accessible without clipped essential content and job status is announced
