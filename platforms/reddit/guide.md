# Reddit

## Who reads it

[JUDGEMENT] Write for members of a named subreddit. Identify the actual reader and their situation, not a generic “everyone”.

## How distribution works

The Home Best feed uses machine-learning recommendations; different sorts and subreddits need not follow one formula. [Reddit](https://support.reddithelp.com/hc/en-us/articles/4402284777364-What-are-home-feed-recommendations). Text, links and media depend on the community's enabled formats. Repeated unsolicited mass engagement is spam; each subreddit controls its own rules. [Posting](https://support.reddithelp.com/hc/en-us/articles/360060422572-How-do-I-post-and-comment-on-Reddit), [spam](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam). A universal numeric self-promotion ratio or AI rule is **[UNVERIFIED]**. **[JUDGEMENT]** hand off an outline only and have the human write the submission after checking that community.

[JUDGEMENT] Treat distribution as context, not a formula. No hook or format guarantees reach.

## Formats that work here

[JUDGEMENT] Choose the smallest format that can carry the evidence:

- Outline a text submission as problem, environment, attempted steps, observed result and question; the human writes it.

- For a link or image post, confirm the subreddit enables that type and requires the selected flair.

- Limits are community-dependent or unknown; check the named subreddit and current composer.

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

## Visual and video recipes

[JUDGEMENT] Use visuals to make the actual lesson easier to understand, not as decorative proof.

- Image or diagram: label the subject and flow; keep mobile text legible and provide meaningful alt text.
- Carousel where supported: topic → context → one step per slide → observed result → concise takeaway.
- Video where supported: 0–3 s subject, 3–15 s demonstration, then the result and context; adapt timings to the material, not an alleged platform optimum.
- Captions: accurately transcribe speech, synchronize with audio and keep text clear of interface overlays.
- Inspect output, rights and the pack’s route-specific limits; do not infer unknown values.

## Anti-patterns

- Do not cross-post identical promotions, solicit votes or ignore subreddit flair.
- Do not invent metrics, testimonials, first-person experience or a guaranteed reach outcome.
- Avoid generic superlatives, duplicated points and context-free screenshots.

## AI and disclosure

Outline only; the human writes the submission after checking subreddit rules. Universal AI disclosure is unverified.

## Checklist

- [ ] The intended reader and supported takeaway are identifiable.
- [ ] Claims link to evidence; uncertainties and limitations remain visible.
- [ ] Actual route, account, community rules and pack limits were checked.
- [ ] Images have relevant alternatives and spoken media has accurate captions.
- [ ] Authorship, affiliation, rights and applicable disclosure were checked.

## Sources

- [algorithm / Home recommendations](https://support.reddithelp.com/hc/en-us/articles/4402284777364-What-are-home-feed-recommendations)
- [specs / community post types](https://support.reddithelp.com/hc/en-us/articles/360060422572-How-do-I-post-and-comment-on-Reddit)
- [community rules / spam](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam)
