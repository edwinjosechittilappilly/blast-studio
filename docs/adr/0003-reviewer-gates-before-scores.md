# 3. Reviewer gates before scores

Status: accepted

## Context

A strong editorial score cannot establish compliance with a platform policy, accessibility requirements or rights checks. Reviews also need to distinguish editorial judgment from a prediction of reach.

## Decision

Run deterministic gates for policy, disclosure, specifications, accessibility, ungrounded metrics and rights. A passing verdict requires all gates to pass and a score at or above the configured threshold. A missing score or a failed gate produces `revise`, except an unfixable gate failure produces `blocked`. Scores are weighted over applicable, non-null criteria; the reviewer can return `N/A` for a criterion.

A person may accept a review with a reason despite its score, but cannot override a failed gate. Acceptance checks both the recorded gates and current gates and rejects a stale post hash. Export requires a `pass` or `accepted` verdict, passing recorded gates and the same hash.

## Consequences

Without a configured reviewer command, the review supplies a checklist and no numeric score, so a person must accept it after the gates pass before export. Unknown or stale specifications can produce warnings and still require human verification. The hash covers title, body, media basenames and alt text, not media bytes; rerun review after changing content or media. See [`src/review/gates.ts`](https://github.com/edwinjosechittilappilly/blast-studio/blob/main/src/review/gates.ts), [`src/review/score.ts`](https://github.com/edwinjosechittilappilly/blast-studio/blob/main/src/review/score.ts) and [`src/commands/accept.ts`](https://github.com/edwinjosechittilappilly/blast-studio/blob/main/src/commands/accept.ts).
