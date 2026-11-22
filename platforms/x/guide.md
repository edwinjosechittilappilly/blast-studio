# X

## Who reads it

[JUDGEMENT] Write for developers following technical conversations. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

The [current xAI repository](https://github.com/xai-org/x-algorithm) describes in-network, Phoenix, SimClusters and popular-post candidate sources, personalized predicted actions, weighted scoring and visibility filtering; model weights apply to predicted probabilities, not raw engagement counts. It documents experiments and omitted components, so no static repository proves a live setting. The earlier [Twitter algorithm release](https://github.com/twitter/the-algorithm) is historical, not the current system. Short text, images, videos, links and threads are supported. A universal link penalty, media bonus, or seven-word hook is **[UNVERIFIED]**; **[JUDGEMENT]** prioritize a concrete first sentence, not an arbitrary word count. [X posting](https://help.x.com/en/using-x/how-to-post).

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Text: state one proposition, add evidence and stop; standard accounts have 280 weighted characters.

- Thread: make the first post standalone, then one claim or example per reply; check each post independently.

- Image/video: add a useful diagram or demonstration rather than repeating the text; check account-specific video limits.

Check `pack.yml` for sourced limits and explicit unknowns; verify the live route and account.

## Hooks

[JUDGEMENT] The examples are hypothetical hook patterns, not claims; use them only when supported by actual evidence.

- **Problem first:** identify the recurring problem and who it affects.
  Hypothetical example: “A stale CI cache kept our release pipeline failing after the lockfile changed.”

- **Unexpected constraint:** lead with the specific constraint uncovered during a flaky deployment.
  Hypothetical example: “Our migration had to run while both old and new application versions were live.”

- **Before and after:** lead with the observed state before and after a flaky deployment, if supported.
  Hypothetical example: “The test failed with the old schema; after the migration it passed against the new one.”

- **Decision tradeoff:** lead with the alternative considered during a flaky deployment and its cost.
  Hypothetical example: “We chose a reversible database migration over a shorter but irreversible script.”

- **Reproduction:** lead with the smallest reproducible input behind a flaky deployment.
  Hypothetical example: “This five-line test reproduces the timeout when the connection pool has one slot.”

- **Practical lesson:** lead with the action another developer can take after a flaky deployment.
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

- Do not solicit artificial engagement or invent a universal algorithm advantage.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

A universal AI disclosure mandate is unverified; check current partnership policy and avoid artificial amplification.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [algorithm / current open-source For You](https://github.com/xai-org/x-algorithm)
- [specs / text](https://help.x.com/en/using-x/how-to-post)
- [specs / video](https://help.x.com/en/using-x/premium-longer-videos)
- [community rules / manipulation](https://help.x.com/en/rules-and-policies/authenticity)
- [community rules / partnerships; access unverified](https://help.x.com/rules-and-policies/paid-partnerships-policy)
