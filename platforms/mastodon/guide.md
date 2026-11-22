# Mastodon

## Who reads it

[JUDGEMENT] Write for people in a chosen federated instance or community. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

Home and live timelines are chronological, not a single centrally ranked feed; Explore/discovery is a separate surface, so do not claim that all Mastodon discovery has no ranking. Follows, boosts, hashtags, visibility settings and server federation affect exposure; federated feeds only include posts known to the server. [Network](https://docs.joinmastodon.org/user/network/), [posting](https://docs.joinmastodon.org/user/posting/). Rules differ per instance. **[JUDGEMENT]** Use relevant CamelCase hashtags for readability, not a promised ranking boost; no evidence establishes a universal external-link penalty.

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Text: state the point without relying on a link; use relevant readable CamelCase hashtags if useful.

- Image/video: explain the media and add alt text; use the target instance’s settings rather than assuming defaults.

- Community context: select visibility and a content warning appropriate to the instance and material.

Check `pack.yml` for sourced limits and explicit unknowns; verify the live route and account.

## Hooks

[JUDGEMENT] The examples are hypothetical hook patterns, not claims; use them only when supported by actual evidence.

- **Problem first:** identify the recurring problem and who it affects.
  Hypothetical example: “A stale CI cache kept our release pipeline failing after the lockfile changed.”

- **Unexpected constraint:** lead with the specific constraint uncovered during a self-hosting migration.
  Hypothetical example: “Our migration had to run while both old and new application versions were live.”

- **Before and after:** lead with the observed state before and after a self-hosting migration, if supported.
  Hypothetical example: “The test failed with the old schema; after the migration it passed against the new one.”

- **Decision tradeoff:** lead with the alternative considered during a self-hosting migration and its cost.
  Hypothetical example: “We chose a reversible database migration over a shorter but irreversible script.”

- **Reproduction:** lead with the smallest reproducible input behind a self-hosting migration.
  Hypothetical example: “This five-line test reproduces the timeout when the connection pool has one slot.”

- **Practical lesson:** lead with the action another developer can take after a self-hosting migration.
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

- Do not assume instance rules, visibility or media settings are universal.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

Check home and receiving server rules; a network-wide AI disclosure mandate is unverified.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [algorithm / federation and discovery](https://docs.joinmastodon.org/user/network/)
- [specs / posting and visibility](https://docs.joinmastodon.org/user/posting/)
- [specs / instance configuration](https://docs.joinmastodon.org/entities/Instance/)
