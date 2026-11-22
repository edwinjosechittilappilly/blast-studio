# DEV

## Who reads it

[JUDGEMENT] Write for developers looking for practical tutorials. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

Markdown articles, tags, cover images, scheduling and cross-posts with canonical URL are supported; high-quality cross-posts may be featured. [Writing help](https://dev.to/help/writing-editing-scheduling). DEV's [AI disclosure tiers](https://dev.to/devteam/introducing-ai-disclosure-on-dev-tools-for-nuance-clarity-and-better-feeds-34mk) include Hand Written, AI-Assisted and Fully Autonomous; authors remain responsible for accuracy. Exact feed weights **[UNVERIFIED]**. Ensure substantial developer value and check [community rules](https://dev.to/code-of-conduct).

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Article: lead with the outcome, list prerequisites, show runnable steps and expected output, then explain tradeoffs.

- Cross-post: set the original canonical URL and use relevant tags; article length and media limits are unknown in the pack.

- Cover image: illustrate the actual tutorial and provide an alternative rather than a decorative wall of text.

Check `pack.yml` for sourced limits and explicit unknowns; verify the live route and account.

## Hooks

[JUDGEMENT] The examples are hypothetical hook patterns, not claims; use them only when supported by actual evidence.

- **Problem first:** identify the recurring problem and who it affects.
  Hypothetical example: “A stale CI cache kept our release pipeline failing after the lockfile changed.”

- **Unexpected constraint:** lead with the specific constraint uncovered during a failing CI pipeline.
  Hypothetical example: “Our migration had to run while both old and new application versions were live.”

- **Before and after:** lead with the observed state before and after a failing CI pipeline, if supported.
  Hypothetical example: “The test failed with the old schema; after the migration it passed against the new one.”

- **Decision tradeoff:** lead with the alternative considered during a failing CI pipeline and its cost.
  Hypothetical example: “We chose a reversible database migration over a shorter but irreversible script.”

- **Reproduction:** lead with the smallest reproducible input behind a failing CI pipeline.
  Hypothetical example: “This five-line test reproduces the timeout when the connection pool has one slot.”

- **Practical lesson:** lead with the action another developer can take after a failing CI pipeline.
  Hypothetical example: “Before changing a cache key, include the dependency lockfile in the key inputs.”

Banned patterns: clickbait that withholds the subject, fake urgency, and engagement bait asking for votes or empty replies.

## Structure template

[JUDGEMENT] Fill in only details supported by the source material:

- Audience and situation: [who encounters the problem, where]
- Specific problem or observation: [what happened]
- Evidence: [primary link, reproduction or verified example]
- Action and result: [what changed and what was observed]
- Takeaway or open question: [useful implication, without hype]
- Required affiliation, rights and disclosure: [checks]

## Visual and video recipes

[JUDGEMENT] Use visuals to make the actual lesson easier to understand, not as decorative proof.

- Image or diagram: label the subject and flow; keep mobile text legible and provide meaningful alt text.
- Carousel where supported: topic → context → one step per slide → observed result → concise takeaway.
- Video where supported: 0–3 s subject, 3–15 s demonstration, then the result and context; adapt timings to the material, not an alleged platform optimum.
- Captions: accurately transcribe speech, synchronize with audio and keep text clear of interface overlays.
- Inspect output, rights and the pack’s route-specific limits; do not infer unknown values.

## Anti-patterns

- Do not omit the canonical URL on a cross-post or misstate the AI disclosure tier.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

Use the applicable Hand Written, AI-Assisted or Fully Autonomous tier and verify accuracy.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [specs / editor and canonical](https://dev.to/help/writing-editing-scheduling)
- [specs / article API](https://developers.forem.com/api/v1)
- [AI policy / disclosure tiers](https://dev.to/devteam/introducing-ai-disclosure-on-dev-tools-for-nuance-clarity-and-better-feeds-34mk)
- [community rules](https://dev.to/code-of-conduct)
