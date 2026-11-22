# YouTube Shorts

## Who reads it

[JUDGEMENT] Write for viewers deciding whether to watch a short developer demonstration. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

Recommendation signals include whether viewers choose to watch, average watch duration and percentage, likes and surveys; topic interest, competition and seasonality matter. YouTube states no minimum posting cadence is required. [YouTube](https://support.google.com/youtube/answer/11914225?co=YOUTUBE._YTVideoType%3Dshorts&hl=en). Square or vertical videos up to three minutes qualify under the current Shorts rules; a Short over one minute with an active Content ID claim is globally blocked. [Shorts](https://support.google.com/youtube/answer/15424877?hl=en). No universal retention percentage or optimal duration is established.

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Short video: use a square or vertical demonstration and check the sourced maximum duration in the pack.

- Show the command or interface, then the observable result; captions and rights checks are essential.

- A Short over one minute with an active Content ID claim is blocked; check the current source before posting.

Check `pack.yml` for sourced limits and explicit unknowns; verify the live route and account.

## Hooks

[JUDGEMENT] The examples are hypothetical hook patterns, not claims; use them only when supported by actual evidence.

- **Problem first:** identify the recurring problem and who it affects.
  Hypothetical example: “A stale CI cache kept our release pipeline failing after the lockfile changed.”

- **Unexpected constraint:** lead with the specific constraint uncovered during a command-line fix.
  Hypothetical example: “Our migration had to run while both old and new application versions were live.”

- **Before and after:** lead with the observed state before and after a command-line fix, if supported.
  Hypothetical example: “The test failed with the old schema; after the migration it passed against the new one.”

- **Decision tradeoff:** lead with the alternative considered during a command-line fix and its cost.
  Hypothetical example: “We chose a reversible database migration over a shorter but irreversible script.”

- **Reproduction:** lead with the smallest reproducible input behind a command-line fix.
  Hypothetical example: “This five-line test reproduces the timeout when the connection pool has one slot.”

- **Practical lesson:** lead with the action another developer can take after a command-line fix.
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

- Do not use unlicensed footage or present a scripted result as a real demonstration.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

Disclose realistic meaningfully altered or synthetic scenes, people or events, subject to the platform’s exceptions.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [algorithm / recommendation signals](https://support.google.com/youtube/answer/11914225?co=YOUTUBE._YTVideoType%3Dshorts&hl=en)
- [specs / Shorts eligibility and copyright](https://support.google.com/youtube/answer/15424877?hl=en)
- [AI policy / disclosure](https://support.google.com/youtube/answer/14328491?hl=en)
