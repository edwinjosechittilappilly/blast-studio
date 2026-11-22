# Review

Run `bstudio review <project>/<campaign>` after making and rendering a campaign. It writes a JSON review for each post in `reviews/` and an editorial summary in `review.md`. Scores are editorial judgments, not predictions of reach.

## Gates

Deterministic gates run before a post can pass:

- Policy checks generated text against the pack's AI policy, including bullet-only outlines where required.
- Disclosure checks require the disclosure fields specified by the pack for applicable text, AI-generated media and voice.
- Specification checks compare text, title and media metadata with known pack limits. They also reject placeholder markers (`[PLACEHOLDER]`, `TODO`, `TBD`, `lorem ipsum`, `{{ }}`, `<your-…>`, `REPLACE_ME`, `xxx`) in post titles, bodies, threads, alt text, VTT captions and measured rendered text, naming the affected field or file and the matched marker. Code in backticks or fenced blocks is exempt, and uppercase `TODO`/`TBD` match only as whole words, so ordinary prose and snippets pass.
- Accessibility checks include image alt text, video captions and available rendered text size, contrast and overflow metrics.
- Fabricated-metrics checks compare numeric claims with the brief and configured `grounding.waive` entries. Ungrounded metrics fail; other ungrounded numbers produce warnings.
- Rights checks include provider licenses, embedded asset metadata and the trademark-search flag for logos.

Unknown or stale platform information can produce warnings. Reviewers should verify platform rules and inspect the content and media themselves; a passing automated gate is not a guarantee of compliance or factual accuracy.

## Scores and verdicts

The configured reviewer evaluates the platform rubric with scores of 0, 1, 2 or N/A, plus evidence and a suggested fix. The total is the weighted percentage of available points for applicable, scored criteria. The default pass threshold is 75, configurable as `review.threshold`. With multiple hooks, the reviewer assesses both hook orders and retains the lower score per criterion.

**Use a different model for the reviewer.** Review refuses to run when `reviewer.command` is identical to
`agent.command`. It can't resolve aliases, though: `omp -p` and `omp -p --model @review` count as different even if
your `review` role points at the same model as your default. Check `omp config get modelRoles` and make sure the
review role names a different model (ideally from another vendor) than the one that writes the posts.

A post is `pass` when gates pass and its score meets the threshold. A failed gate, missing total or low score yields `revise`. A rights failure marked unfixable, such as a missing generated-asset license, yields `blocked`. If `reviewer.command` is set to `null`, review prints a manual rubric checklist and does not produce a score, so the verdict is `revise` unless a gate blocks it.

## Fix or accept

Edit the post or asset sources, then render and review again. `bstudio revise <project>/<campaign>` asks the author agent to address findings, renders and reviews again for up to `review.maxRounds` rounds (two by default). It stops on blocked reviews for human resolution; reaching the round limit does not imply a pass.

A human can override a score after inspecting the content:

```sh
bstudio accept acme/release-note linkedin --reason "Reviewed the draft and accepted the editorial tradeoff"
```

Acceptance requires a current review and passing gates. The command recalculates gates and refuses to override a failure. It records the reason in the review JSON. Changes to the title, body, media filenames, alt text or media file contents make the review stale; run review again before acceptance or export.

`bstudio review --calibrate` runs the reviewer against the bundled labeled fixtures and reports exact agreement per criterion. Calibration requires a configured reviewer.
