# TikTok

## Who reads it

[JUDGEMENT] Write for mobile viewers watching an original demonstration. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

Recommendations use interactions such as full watches, skips, likes, shares and comments, alongside content information and search relevance. [TikTok](https://support.tiktok.com/en/using-tiktok/exploring-videos/how-tiktok-recommends-content). Unoriginal reused media without creative changes can be ineligible for For You; realistic synthetic or significantly edited people/scenes require labeling. [Integrity policy](https://www.tiktok.com/community-guidelines/en/integrity-authenticity). A magic duration or hashtag set is **[UNVERIFIED]**.

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Video: show the technical subject immediately, demonstrate a single action and show the result.

- Trim dead time without concealing the steps; caption speech accurately and label applicable realistic synthetic media.

- The pack’s video limits describe the Content Posting API route, not necessarily the app.

Check `pack.yml` for sourced limits and explicit unknowns; verify the live route and account.

## Hooks

[JUDGEMENT] The examples are hypothetical hook patterns, not claims; use them only when supported by actual evidence.

- **Problem first:** identify the recurring problem and who it affects.
  Hypothetical example: “A stale CI cache kept our release pipeline failing after the lockfile changed.”

- **Unexpected constraint:** lead with the specific constraint uncovered during a terminal debugging step.
  Hypothetical example: “Our migration had to run while both old and new application versions were live.”

- **Before and after:** lead with the observed state before and after a terminal debugging step, if supported.
  Hypothetical example: “The test failed with the old schema; after the migration it passed against the new one.”

- **Decision tradeoff:** lead with the alternative considered during a terminal debugging step and its cost.
  Hypothetical example: “We chose a reversible database migration over a shorter but irreversible script.”

- **Reproduction:** lead with the smallest reproducible input behind a terminal debugging step.
  Hypothetical example: “This five-line test reproduces the timeout when the connection pool has one slot.”

- **Practical lesson:** lead with the action another developer can take after a terminal debugging step.
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

- Do not reuse unoriginal media without creative changes or omit required synthetic-media labels.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

Label realistic-looking AI-generated or significantly edited people or scenes and check commercial disclosure.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [algorithm / recommendations](https://support.tiktok.com/en/using-tiktok/exploring-videos/how-tiktok-recommends-content)
- [specs / API video](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)
- [AI policy / unoriginal media](https://www.tiktok.com/community-guidelines/en/integrity-authenticity)
