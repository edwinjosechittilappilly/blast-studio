# daily.dev

## Who reads it

[JUDGEMENT] Write for developers seeking educational content. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

Wider feed reach depends on reader response; educational, non-misleading developer content is favored in published guidance. Link previews use page title, description and image. [Feed guidance](https://docs.daily.dev/what-the-feed-recommends/). [Guidelines](https://docs.daily.dev/content-guidelines/) reject generated content, predominantly promotional material, paid placements outside official programs and affiliate links; personal and company blogs cannot become indexed sources, though direct posts and Squads are available. AI editing is described separately as permissible when substance and voice remain the author's; generated article submission is not. [Featuring](https://docs.daily.dev/how-to-get-featured/).

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Outline a developer lesson as problem, genuine experience, evidence and takeaway; the human authors the substance.

- Check the final page title and preview image; this is not permission to submit generated prose.

- Direct-post and Squad rules vary; text and image limits are unknown in the pack.

Check `pack.yml` for sourced limits and explicit unknowns; verify the live route and account.

## Hooks

[JUDGEMENT] These are human-author prompts with hypothetical example evidence, not copy-ready submission text.

- **Problem first:** identify the recurring problem and who it affects.
  Example evidence: a CI log showing a stale cache after a lockfile change.

- **Unexpected constraint:** lead with the specific constraint uncovered during a debugging lesson.
  Example evidence: a migration plan requiring old and new versions to coexist.

- **Before and after:** lead with the observed state before and after a debugging lesson, if supported.
  Example evidence: a test result before and after a schema migration.

- **Decision tradeoff:** lead with the alternative considered during a debugging lesson and its cost.
  Example evidence: a decision record comparing reversible and irreversible migrations.

- **Reproduction:** lead with the smallest reproducible input behind a debugging lesson.
  Example evidence: a five-line test reproducing a pool timeout.

- **Practical lesson:** lead with the action another developer can take after a debugging lesson.
  Example evidence: documentation showing the lockfile as a cache-key input.

Banned patterns: clickbait that withholds the subject, fake urgency, and engagement bait asking for votes or empty replies.

## Structure template

[JUDGEMENT] Talking-point skeleton for the human author; do not copy it as the final post:

- Audience and situation: [who encounters the problem, where]
- Specific problem or observation: [what happened]
- Evidence: [primary link, reproduction or verified example]
- Action and result: [what changed and what was observed]
- Takeaway or open question: [useful implication, without hype]
- Required affiliation, rights and disclosure: [checks]

## Anti-patterns

- Do not submit generated articles, affiliate links or predominantly promotional content.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

Outline only; the human authors substance and voice. Generated article submissions are prohibited; separate guidance permits AI editing.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [algorithm / feed guidance and AI editing](https://docs.daily.dev/what-the-feed-recommends/)
- [AI policy / source and promotion rules](https://docs.daily.dev/content-guidelines/)
- [specs / submissions](https://docs.daily.dev/how-to-get-featured/)
