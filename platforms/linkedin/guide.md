# LinkedIn

## Who reads it

[JUDGEMENT] Write for developer leads and founders sharing a professional lesson. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

Feed recommendations consider professional relevance and quality, viewer relationships and activity, context and potential engagement; overly promotional or incoherent content may have limited reach. [LinkedIn](https://www.linkedin.com/help/linkedin/answer/a1499047). Text, images, documents/PDF, links and video are format options; no primary evidence reviewed proves a universal native-format preference, external-link penalty, ideal hashtag count, or that links belong in comments. **[JUDGEMENT]** A specific opening in the first two lines helps a human skimming; the exact truncation point varies by surface and is not a fixed platform specification. AI and paid partnership requirements are in the disclosure table.

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Text: start with the professional problem; show one action and example; end with the lesson rather than a pitch.

- Document/carousel: one proposition per page, then a concrete example and takeaway; export a legible PDF.

- Video: show the problem, the action and the result; check the pack’s video duration and byte limits.

Check `pack.yml` for sourced limits and explicit unknowns; verify the live route and account.

## Hooks

[JUDGEMENT] The examples are hypothetical hook patterns, not claims; use them only when supported by actual evidence.

- **Problem first:** identify the recurring problem and who it affects.
  Hypothetical example: “A stale CI cache kept our release pipeline failing after the lockfile changed.”

- **Unexpected constraint:** lead with the specific constraint uncovered during a deployment incident.
  Hypothetical example: “Our migration had to run while both old and new application versions were live.”

- **Before and after:** lead with the observed state before and after a deployment incident, if supported.
  Hypothetical example: “The test failed with the old schema; after the migration it passed against the new one.”

- **Decision tradeoff:** lead with the alternative considered during a deployment incident and its cost.
  Hypothetical example: “We chose a reversible database migration over a shorter but irreversible script.”

- **Reproduction:** lead with the smallest reproducible input behind a deployment incident.
  Hypothetical example: “This five-line test reproduces the timeout when the connection pool has one slot.”

- **Practical lesson:** lead with the action another developer can take after a deployment incident.
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

- Do not make a partnership invisible or replace the lesson with a product pitch.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

LinkedIn recommends disclosing substantial non-obvious AI use. Paid brand relationships require the partnership label.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [algorithm / feed recommendations](https://www.linkedin.com/help/linkedin/answer/a1499047)
- [specs / organic video](https://www.linkedin.com/help/linkedin/answer/a7494039)
- [AI policy](https://www.linkedin.com/help/linkedin/answer/a1481496)
- [community rules / branded content](https://www.linkedin.com/help/linkedin/answer/a1627083)
