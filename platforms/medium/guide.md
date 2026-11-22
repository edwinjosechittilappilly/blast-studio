# Medium

## Who reads it

[JUDGEMENT] Write for readers seeking an original long-form explanation. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

Network distribution and personalized recommendations differ; stories can be restricted to Network Only and exceptional stories selected for human-curated Boost. [Distribution](https://help.medium.com/hc/en-us/articles/360018677974-What-happens-to-your-story-when-you-publish-on-Medium). Long-form articles and imported stories are supported; format favoritism, link penalty and exact weights **[UNVERIFIED]**. AI-generated text and images have specific disclosure rules, below. [AI policy](https://help.medium.com/hc/en-us/articles/22576852947223-Artificial-Intelligence-AI-content-policy).

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Article: open with the reader question, develop an original argument with sources, and close with implications.

- Import: preserve the canonical source where applicable and check the current import flow.

- Images: describe the image and caption generated images; size limits are unknown in the pack.

Check `pack.yml` for sourced limits and explicit unknowns; verify the live route and account.

## Hooks

[JUDGEMENT] The examples are hypothetical hook patterns, not claims; use them only when supported by actual evidence.

- **Problem first:** identify the recurring problem and who it affects.
  Hypothetical example: “A stale CI cache kept our release pipeline failing after the lockfile changed.”

- **Unexpected constraint:** lead with the specific constraint uncovered during an engineering tradeoff.
  Hypothetical example: “Our migration had to run while both old and new application versions were live.”

- **Before and after:** lead with the observed state before and after an engineering tradeoff, if supported.
  Hypothetical example: “The test failed with the old schema; after the migration it passed against the new one.”

- **Decision tradeoff:** lead with the alternative considered during an engineering tradeoff and its cost.
  Hypothetical example: “We chose a reversible database migration over a shorter but irreversible script.”

- **Reproduction:** lead with the smallest reproducible input behind an engineering tradeoff.
  Hypothetical example: “This five-line test reproduces the timeout when the connection pool has one slot.”

- **Practical lesson:** lead with the action another developer can take after an engineering tradeoff.
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

- Do not omit required AI disclosures or imply disclosure alone makes generated writing paywall-eligible.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

Disclose generated text and caption generated images; check exceptions and Partner Program paywall eligibility.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [algorithm / distribution and Boost](https://help.medium.com/hc/en-us/articles/360018677974-What-happens-to-your-story-when-you-publish-on-Medium)
- [specs / import](https://help.medium.com/hc/en-us/articles/213480228-API-Importing)
- [AI policy / disclosure and paywall](https://help.medium.com/hc/en-us/articles/22576852947223-Artificial-Intelligence-AI-content-policy)
