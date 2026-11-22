# Hashnode

## Who reads it

[JUDGEMENT] Write for developers reading technical tutorials and syndicated articles. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

A [historical feed description](https://townhall.hashnode.com/revamped-personalized-feed) cites followed tags/authors, engagement and quality signals; it does not establish today's weights. Articles support Markdown and syndicated original URLs. [Syndication](https://townhall.hashnode.com/why-you-should-republish-your-devblog-posts-and-how-to-do-it). [Terms](https://hashnode.com/terms) require review/edit/approval of AI-generated editor suggestions and prohibit unsolicited promotion and generation intended to manipulate search or engagement. General disclosure mandate **[UNVERIFIED]**.

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Article: state the problem, environment, reproducible steps, outcome and limitations.

- Syndication: set the original URL and review the imported text; article length is unknown.

- Cover image: use a relevant illustration and alt text; the sourced 8 MB limit is specific to the upload API.

Check `pack.yml` for sourced limits and explicit unknowns; verify the live route and account.

## Hooks

[JUDGEMENT] The examples are hypothetical hook patterns, not claims; use them only when supported by actual evidence.

- **Problem first:** identify the recurring problem and who it affects.
  Hypothetical example: “A stale CI cache kept our release pipeline failing after the lockfile changed.”

- **Unexpected constraint:** lead with the specific constraint uncovered during a database migration.
  Hypothetical example: “Our migration had to run while both old and new application versions were live.”

- **Before and after:** lead with the observed state before and after a database migration, if supported.
  Hypothetical example: “The test failed with the old schema; after the migration it passed against the new one.”

- **Decision tradeoff:** lead with the alternative considered during a database migration and its cost.
  Hypothetical example: “We chose a reversible database migration over a shorter but irreversible script.”

- **Reproduction:** lead with the smallest reproducible input behind a database migration.
  Hypothetical example: “This five-line test reproduces the timeout when the connection pool has one slot.”

- **Practical lesson:** lead with the action another developer can take after a database migration.
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

- Do not submit unreviewed AI editor suggestions or manipulative promotion.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

Review, edit and approve AI editor suggestions. A general disclosure mandate is unverified.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [algorithm / historical feed](https://townhall.hashnode.com/revamped-personalized-feed)
- [specs / syndication](https://townhall.hashnode.com/why-you-should-republish-your-devblog-posts-and-how-to-do-it)
- [specs / image upload API](https://github.com/Hashnode/gql-skill/blob/main/skills/gql-api/references/mutations.md)
- [AI policy / community rules](https://hashnode.com/terms)
