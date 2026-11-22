# Newsletters

## Who reads it

[JUDGEMENT] Write for subscribers to a specific author or publication. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

There is no single platform or feed algorithm for newsletters; distribution may be direct email or an independent editor's selection. [Gmail sender requirements](https://support.google.com/mail/answer/81126?hl=en) address authentication, spam rate and bulk unsubscribe, not guaranteed inbox placement. [Buttondown](https://buttondown.com/legal/acceptable-use-policy) requires double opt-in and rejects primarily machine-generated prose/images. [Substack](https://support.substack.com/hc/en-us/articles/50891130623508-How-can-I-detect-AI-on-Substack) offers estimated AI detection on eligible web posts, not proof or a rule covering all email. Publication-specific submissions and AI rules **[UNVERIFIED]**; choose the actual editor. See [Cooperpress](https://cooperpress.com/submit/) and [Changelog News](https://changelog.com/news/submit) for distinct editorial routes.

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Article: address a specific reader question with an example, source and practical implication.

- Email: choose a subject that accurately reflects the article; follow the selected publication’s requirements.

- Image and text limits are publication-specific or unknown; describe visuals and check provider rules.

Check `pack.yml` for sourced limits and explicit unknowns; verify the live route and account.

## Hooks

[JUDGEMENT] The examples are hypothetical hook patterns, not claims; use them only when supported by actual evidence.

- **Problem first:** identify the recurring problem and who it affects.
  Hypothetical example: “A stale CI cache kept our release pipeline failing after the lockfile changed.”

- **Unexpected constraint:** lead with the specific constraint uncovered during a production incident lesson.
  Hypothetical example: “Our migration had to run while both old and new application versions were live.”

- **Before and after:** lead with the observed state before and after a production incident lesson, if supported.
  Hypothetical example: “The test failed with the old schema; after the migration it passed against the new one.”

- **Decision tradeoff:** lead with the alternative considered during a production incident lesson and its cost.
  Hypothetical example: “We chose a reversible database migration over a shorter but irreversible script.”

- **Reproduction:** lead with the smallest reproducible input behind a production incident lesson.
  Hypothetical example: “This five-line test reproduces the timeout when the connection pool has one slot.”

- **Practical lesson:** lead with the action another developer can take after a production incident lesson.
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

- Do not treat an AI detector estimate as proof of authorship or an email-wide rule.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

Check the specific publication and provider policy; Substack’s detector is an estimate for eligible web posts, not an email-wide ban.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [AI policy / opt-in](https://buttondown.com/legal/acceptable-use-policy)
- [AI policy / detector scope](https://support.substack.com/hc/en-us/articles/50891130623508-How-can-I-detect-AI-on-Substack)
- [delivery / authentication and unsubscribe](https://support.google.com/mail/answer/81126?hl=en)
- [community rules / editorial submission](https://cooperpress.com/submit/)
- [community rules / editorial submission](https://changelog.com/news/submit)
