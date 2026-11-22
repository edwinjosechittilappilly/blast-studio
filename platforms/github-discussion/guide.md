# GitHub: README, Discussions and Releases

## Who reads it

[JUDGEMENT] Write for repository contributors joining a project discussion. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

Explore may show popular or relevant projects personalized from activity; an exact Trending formula is **[UNVERIFIED]**. [Discovery](https://docs.github.com/en/get-started/exploring-projects-on-github/discovering-projects-on-github). README is the durable project entry point, Discussions are community conversations, and Releases describe versions; GitHub supports Markdown. Project-related promotion in a README is allowed when advertising is not its primary focus; bulk promotional activity and artificial stars/follows are prohibited. [Acceptable use](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies). Universal AI disclosure rule **[UNVERIFIED]**.

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Discussion: choose the correct category; state the context, proposal or question, evidence and alternatives.

- Link relevant issues, commits or documentation and name the specific decision or feedback sought.

- Embedded media limits are unknown; describe diagrams and do not substitute social-preview rules for discussion limits.

Check `pack.yml` for sourced limits and explicit unknowns; verify the live route and account.

## Hooks

[JUDGEMENT] The examples are hypothetical hook patterns, not claims; use them only when supported by actual evidence.

- **Problem first:** identify the recurring problem and who it affects.
  Hypothetical example: “A stale CI cache kept our release pipeline failing after the lockfile changed.”

- **Unexpected constraint:** lead with the specific constraint uncovered during a proposed configuration change.
  Hypothetical example: “Our migration had to run while both old and new application versions were live.”

- **Before and after:** lead with the observed state before and after a proposed configuration change, if supported.
  Hypothetical example: “The test failed with the old schema; after the migration it passed against the new one.”

- **Decision tradeoff:** lead with the alternative considered during a proposed configuration change and its cost.
  Hypothetical example: “We chose a reversible database migration over a shorter but irreversible script.”

- **Reproduction:** lead with the smallest reproducible input behind a proposed configuration change.
  Hypothetical example: “This five-line test reproduces the timeout when the connection pool has one slot.”

- **Practical lesson:** lead with the action another developer can take after a proposed configuration change.
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

- Do not post bulk promotions, request artificial stars or put a proposal in an unrelated category.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

Check applicable project and community rules; a universal AI disclosure requirement is unverified.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [algorithm / Explore](https://docs.github.com/en/get-started/exploring-projects-on-github/discovering-projects-on-github)
- [specs / social preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)
- [community rules / promotion and manipulation](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies)
