# Bluesky

## Who reads it

[JUDGEMENT] Write for developers and communities choosing their own feeds. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

Users select custom feeds, so there is no single Bluesky ranking; Discover is one evolving feed. [Custom feeds](https://bsky.social/about/blog/7-27-2023-custom-feeds), [product update](https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky). Posts support text, images, video and external cards; links in comments versus posts and hashtag boosts are **[UNVERIFIED]**. Sponsored content must be identified and artificial engagement is prohibited. [Community guidelines](https://bsky.social/about/support/community-guidelines).

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Text: make one complete point with its evidence link; the pack text limit is graphemes and the record also has a byte limit.

- Thread: make the first post standalone, then number or sequence only when it improves comprehension.

- Image/video: use up to the sourced image count or sourced video duration in the pack, with alternatives or captions.

Check `pack.yml` for sourced limits and explicit unknowns; verify the live route and account.

## Hooks

[JUDGEMENT] The examples are hypothetical hook patterns, not claims; use them only when supported by actual evidence.

- **Problem first:** identify the recurring problem and who it affects.
  Hypothetical example: “A stale CI cache kept our release pipeline failing after the lockfile changed.”

- **Unexpected constraint:** lead with the specific constraint uncovered during a reproducible build failure.
  Hypothetical example: “Our migration had to run while both old and new application versions were live.”

- **Before and after:** lead with the observed state before and after a reproducible build failure, if supported.
  Hypothetical example: “The test failed with the old schema; after the migration it passed against the new one.”

- **Decision tradeoff:** lead with the alternative considered during a reproducible build failure and its cost.
  Hypothetical example: “We chose a reversible database migration over a shorter but irreversible script.”

- **Reproduction:** lead with the smallest reproducible input behind a reproducible build failure.
  Hypothetical example: “This five-line test reproduces the timeout when the connection pool has one slot.”

- **Practical lesson:** lead with the action another developer can take after a reproducible build failure.
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

- Do not hide commercial content or assume every custom feed ranks alike.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

Clearly identify commercial content; a blanket AI disclosure requirement is unverified.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [algorithm / custom feeds](https://bsky.social/about/blog/7-27-2023-custom-feeds)
- [specs / video and images; product update](https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky)
- [specs / post record](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/feed/post.json)
- [specs / video](https://bsky.network/docs/about-bluesky-content/video)
- [AI policy / community rules](https://bsky.social/about/support/community-guidelines)
