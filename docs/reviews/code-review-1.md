# Code review 1 (anthropic/claude-opus-5-5 via slipway run review)

## Blockers

1. **blocker** `src/render/stills.ts:28`: the Playwright route lets any `file:` URL through. **Checked:** an `<iframe src="file:///etc/hosts">` came out readable in the PNG. HTML written by the agent, possibly steered by injected content from a fetched page, can put `~/BlastStudio/.env` or `~/.ssh/*` into a card that gets published. Text inside an iframe is also missed by `measureText`, so no gate sees it.
   - **Fix:** only allow `file:` URLs whose realpath is under the asset directory, `templates/` or the temporary input file. Abort everything else, including frames.

2. **blocker** `src/workspace.ts:34,38`: the maker does not run "without credentials" as the spec requires.
   - It gets the real `HOME` and `XDG_*`, and the agent CLI has a full shell.
   - From there it can read `<root>/.env`, which holds provider keys (`env.ts:18`), plus `~/.config/gh` and the Keychain through `security`.
   - It can also write straight into `<root>/projects/<slug>/`, which skips the `allowOut` copy-back check entirely.
   - **Fix:** run the agent inside an OS sandbox (`sandbox-exec` on macOS, `bwrap` on Linux) that denies reads of the studio root and writes outside the workspace. Alternatively, set `HOME` to the workspace and pass in only the agent's own auth directory.

3. **blocker** `src/render/ffmpeg.ts:14`: `runTool` passes the full `io.env` to `vhs` and `hyperframes`. A `demo.tape` written by the agent can run `Type "env"` and record `OPENAI_API_KEY`, `GH_TOKEN` and other secrets into a GIF or MP4 that gets exported. Today the code only prints a warning.
   - **Fix:** give these tools a minimal environment: `PATH`, `LANG`, `TERM`, and a temporary `HOME`.

4. **blocker** `src/render/stills.ts:71`: Mermaid PNGs come out with no labels.
   - **Checked:** for `A[Alpha label] --> B[Beta label]` the SVG has 2 `<foreignObject>` elements and 0 `<text>` elements. resvg drops foreignObject, so the PNG is empty boxes.
   - **Fix:** let `mmdc -o x.png` produce the PNG, or pass `htmlLabels:false` in the Mermaid config.
   - The test at `test/render.test.ts:220` only asserts `png.length > 100`, so it passes on the broken output.

5. **blocker** `src/review/reviewer.ts:23`: the reviewer runs with `HOME` set to a temporary directory. This is the same breakage 45ff6cd fixed for the maker: `omp`/`claude` cannot find their login, so every real `review` errors and no post can reach `pass`. Not run against a real CLI.
   - **Fix:** use the same environment policy as the maker, and apply the sandbox from finding 2.

6. **blocker** `src/review/gates.ts:55-60`: the grounding gate is unreliable in both directions.
   - It never scans text inside graphics (cards, carousels, posters), alt text or captions. A carousel slide saying "10x faster" passes.
   - `evidence.includes(token)` is a substring match, so `5%` counts as grounded if the brief contains `15%` or `0.5%`, and `2x` if it contains `12x`. That fails the spec scenario.
   - `$500`, `10X`, `3×` and `50 percent` only produce warnings.
   - **Fix:** tokenize the brief with the same regex and compare normalized token sets. Add `$`, `×`, case-insensitive `x` and `percent`. Feed the rendered text nodes (which `measureText` already collects) and the alt text into the gate.

7. **blocker** `src/commands/render.ts:55` and `src/render/video.ts:63`: AI voiceover never reaches the video.
   - A `voiceover` asset renders to `assets/<vo>/out/voiceover.wav`, but the video only reads `assets/<video>/source/voiceover.wav`, and the agent cannot create a WAV offline.
   - `ffmpeg.ts:38` (`-map 1:a:0`) replaces the composition's audio rather than mixing it.
   - The voice disclosure gate never sees a voice track embedded in a video.
   - **Fix:** add `voiceover: <asset-id>` to the video's `asset.yml`, render voiceover assets first, mix with `amix`, and add the voiceover id to `embeds`.

8. **blocker** `.github/workflows/platform-watch.yml:30-34,53-56`: the snapshot baseline lives only in `actions/cache`.
   - GitHub evicts cache entries not read for 7 days, and a weekly cron with normal schedule delay will often cross that line. After eviction, every source reports `new`, the check exits 0, and changes are never reported.
   - The spec says the PR carries "pack data and snapshots", but snapshots are never committed.
   - **Fix:** commit `platforms/snapshots/**`, allow those paths in the PR job, and read the baseline from git.

## Concerns: CI and updater

9. **concern** `platform-watch.yml:88`: `claude -p` with no `--permission-mode acceptEdits` / `--allowedTools Edit,Write`. In headless mode Claude Code cannot edit files, so `propose` should come back with no edits (inference, not run). **Fix:** add the permission flags and deny `Bash`.

10. **concern** `platform-watch.yml:91`: `git diff -- 'platforms/*/pack.yml'` picks up any change in the checkout. If the propose agent finds the repo checkout through its real `HOME` (finding 2) and edits it directly, those edits skip `propose()`'s quote and schema checks.
    - **Fix:** build the patch only from files that `propose()` validated, and re-validate packs in the PR job.
    - Also set `persist-credentials: false` on the checkout at line 72.

11. **concern** `src/updater/propose.ts:62`: two ways to slip edits through.
    - A one-character quote is enough to justify any edit.
    - Leaves under governed fields, including `verified`, can be changed, so the agent can mark its own edits as verified.
    - **Fix:** reject changes to `verified` and `lastVerified`, set a minimum quote length, and require the new value to appear in the quote.

12. **concern** `platform-watch.yml`:
    - `:38` exposes `MODEL_API_KEY` to the check step, which parses untrusted pages. Compute `key_available` without exporting the secret.
    - `:120-125` creates a new dated branch and PR each run. The spec says "open or update".
    - A PR created with `GITHUB_TOKEN` does not trigger `ci.yml`, so the bot's pack PR is never schema-checked. Use one fixed branch, `gh pr edit`, and a GitHub App token. Put the proposal evidence sidecar in the PR body.

13. **concern** `src/updater/check.ts:61-63`: `redirect: 'follow'` follows same-host redirects, so a page that redirects is hashed instead of reported `failed` as the spec requires. **Fix:** use `redirect: 'manual'` and treat any 3xx as failed.

14. **concern** Pack freshness and verification.
    - `propose.ts:79` sets only `verified`. The spec requires both `verified` and `lastVerified`.
    - `gates.ts:6` adds a fixed "verification date unavailable" warning to every review.
    - `gates.ts:26` warns only when `verified` exists, and 0 of the 20 packs have it, so never-verified fields never warn.
    - `ai` and `disclosure` have no provenance, so policy freshness is never checked.
    - **Fix:** add provenance to the policy fields, warn when `lastVerified` is missing or older than 90 days, and remove the fixed warning.

## Concerns: review gates and verdicts

15. **concern** `src/commands/review.ts:65`: re-reviewing rewrites every review, which wipes human `accepted` verdicts even when the post is unchanged. `revise.ts:30` lets the agent rewrite posts that already pass.
    - **Fix:** keep `accepted` when `postHash` and the gates are unchanged, and only hand failing posts to `revise`.

16. **concern** `review.ts:63`: `postHash` covers only basename and alt text. A re-render that changes an image's pixels under the same filename keeps the old `pass`, so unreviewed pixels get exported.
    - **Fix:** add a Studio-only `contentHash` built from the media files' SHA-256s, checked at accept and export. Leave the shared MB `reviewHash` alone.

17. **concern** Studio passes things Market Blaster's check rejects, so export succeeds and then `mblast import` exits 1.
    - Evidence anchors are never checked against the brief (MB `check.ts:83-84`).
    - `gif` and `document` on Bluesky/Mastodon, and video on LinkedIn API, are errors in MB (`check.ts:35,43,48`) but only a warning in Studio (`gates.ts:31`).
    - MB's `needsTitle` destinations are not checked for a title.
    - **Fix:** fail the specs gate when a media kind is not in `pack.media`, and add gates for evidence ⊆ brief anchors and required titles.

18. **concern** `gates.ts:28`: the text limit uses `post.body.length` (UTF-16 units). That miscounts X's weighted length and t.co links, and Bluesky's graphemes. Thread items are never measured. **Fix:** measure each item per platform, reusing MB's `limits.ts` rules.

19. **concern** `gates.ts:34-35`: if a media file does not match any asset output, the byte, duration and size checks skip silently. A post can reference any project file, such as `source.html` as an image. **Fix:** fail the specs gate unless `media.file` is one of its asset's declared outputs.

20. **concern** Accessibility thresholds.
    - `gates.ts:48-50` hardcodes 24px at 1080 width and a 4.5 contrast ratio. The spec wants pack thresholds, and the pack schema has no fields for them.
    - Applying 4.5 to large text, where WCAG requires 3:1, flags headlines that pass WCAG.
    - `render.ts:47` (`minFontPx ?? 0`) makes stills with no text fail "Text too small".
    - `gates.ts:40` checks alt text only for images, not gifs or documents.

21. **concern** Disclosure gate.
    - `gates.ts:20` accepts any non-empty string.
    - `platforms/linkedin/pack.yml:30` stores a paid-partnership rule under `disclosure.text`, so every LinkedIn post needs a text disclosure. That is a false positive.
    - DEV's three disclosure tiers are not enforced.
    - **Fix:** list accepted values per rule, and keep AI disclosure separate from sponsorship disclosure.

22. **concern** AI-generated inheritance relies on `embeds` that the agent declares. A card that embeds `../illus/out/illustration.png` without declaring it is treated as not AI-generated. **Fix:** record the `file:` requests made during the render (alongside the allowlist in finding 1) and derive `embeds` from them.

23. **concern** `gates.ts:15`: the outline gate accepts any prose as long as it is bulleted, and fails outlines that use headings. **Fix:** cap words per bullet and allow headings.

24. **concern** Reviewer hook comparison and retries.
    - `reviewer.ts:55-58` scores the post twice and takes the minimum. No hook preference is recorded, and N/A from either run removes the criterion, which inflates the score. Use a dedicated hook-compare result, and only drop a criterion when both runs say N/A.
    - `reviewer.ts:39`: the retry shares the two-call cap, so one bad response while hooks exist fails the whole review.

25. **concern** `test/fixtures/reviews/calibration.json` has 12 fixtures, not about 20, and none include hooks.

## Concerns: budget and ledger

26. **concern** `src/budget/ledger.ts:13`: one torn line from a crash mid-append makes `JSON.parse` throw a non-`UserError`. Every later paid call and `budget show` then crashes. That contradicts the "crash-safe ledger" claim. **Fix:** tolerate or flag an unparsable trailing line.

27. **concern** `ledger.ts:42`: the stale-lock recovery can let two processes in at once.
    1. Waiters A and B both read a dead PID.
    2. A unlinks the stale lock and takes a new one.
    3. B then unlinks A's live lock and takes its own.

    Both are now inside the critical section, so the cap can be exceeded. **Fix:** break stale locks with an atomic rename, then retry the `wx` open.

28. **concern** `src/workspace.ts:49`: agent runs are always logged with `usd: null` and no token counts. That includes API-billed runs such as the CI `propose` job using `ANTHROPIC_API_KEY`. **Fix:** add `agent.billing: subscription|api`, parse usage from the CLI's JSON output, and charge API runs against the cap.

29. **concern** `src/providers/images.ts:61`: a 4xx failure keeps the reservation forever, and there is no way to release it, so caps shrink over time. **Fix:** settle at 0 for non-billable 4xx responses.

## Concerns: rendering

30. **concern** `render.ts:65`: carousel slides sort as strings, so `10.html` comes before `2.html`. The skill tells the agent to name them `<number>.html` (`skills/studio-visual/SKILL.md:10`). **Fix:** use a numeric `localeCompare`.

31. **concern** `render.ts:66,72`: the carousel PDF does not match the PNGs.
    - Every slide's `<style>` goes into one document, so later slides override earlier ones.
    - Each body is wrapped in another `.slide`, which doubles the 100vh height, padding and page breaks.
    - `<head>` `<link>` stylesheets are dropped.
    - **Fix:** print each slide on its own and concatenate the PDFs.

32. **concern** `src/render/video.ts:90`: VHS ignores `captions.burn` without saying so. The spec requires burned captions on request. **Fix:** burn captions into VHS MP4s, or reject the request.

33. **concern** `ffmpeg.ts:14`: a fixed 120-second timeout applies to `hyperframes` and `vhs`. A 1080×1920 render with `--workers 1` will often exceed it. Video is also encoded twice (CRF 16, then libx264's default of 23), losing quality. **Fix:** make the timeout configurable, and use `-c:v copy` when there are no captions or voiceover.

34. **concern** `render.ts:47`: render metrics keep only the aggregate per output and drop per-node data, which the spec asks for. Reviewers and `revise` cannot tell which text node failed. The safe zone is a fixed 5% (`metrics.ts:7`) and ignores platform UI overlays.

## Concerns: export and auth

35. **concern** `src/campaign-zip.ts:71`: `canonicalHome` is hardcoded to `'devto'` even when there is no DEV post. MB accepts `null`. **Fix:** use `devto` only when it is a destination, otherwise `null`, and update the schema.

36. **concern** `src/campaign-zip.ts:48`: media for manual platforms is written twice, under top-level `media/` and under `handoff/<p>/media/`. That doubles video size against MB's 1 GiB and 500 MiB limits.

37. **concern** `src/commands/auth.ts:50`: `auth set` stores `passEnv` keys in the Keychain and `auth list` reports them as "keychain", but `workspace.ts:41` never reads the Keychain. The keys are stored and never used.

## Tests that would not catch real bugs

38. **concern**
    - `test/make.test.ts`, "agent receives no credentials": checks the environment only. It does not cover `.env` being readable through the real `HOME`, or the agent writing directly into the project.
    - `test/review.test.ts:30-31`: the same assertion appears twice. Nothing tests grounding substrings, `$`, thread length, hooks, or accept's re-run gates and stale-hash path.
    - `export.ts:53` accepts any non-empty gate list, and the export fixtures contain only `policy`. **Fix:** require all six gate ids.
    - `test/export.test.ts:87-101` runs the MB import only on `--dir` (v1). The default zip (v2) is never imported by MB.
    - The updater redirect test covers only cross-host redirects.
    - The voice test passes with `{}` as the "WAV" because `voice.ts:33` does not check for a RIFF header.
    - There is no test for a torn ledger line or the stale lock.

## Nits

39. **nit** `review.ts:63` and `accept.ts:21` reimplement the hash in `review-hash.ts`. Call `reviewHash()` instead.
40. **nit** `reviewer.ts:42` requires bare JSON. CLIs often wrap output in a ```json fence, which uses up the only retry.
41. **nit** `reviewer.ts:18`: the "different model" check only compares `--model` strings. `omp -p` and `@review` may resolve to the same model.
42. **nit** `workspace.ts:14`: the denylist misses `GH_TOKEN`, `MODEL_API_KEY` and `AWS_*`. Use an allowlist or name patterns.
43. **nit** `render.ts:59`: a non-square logo SVG is recorded as size×size.
44. **nit** Optional arch-diagram support from the spec is missing; only `.mmd` and `.d2` are handled.
45. **nit** `src/library.ts:34`: the dashboard's "unverified" list shows manual and new sources, not unverified packs as the spec says.
46. **nit** `campaign-zip.ts:28`: sections with no status are exported as `claim`. Emit `null`.
47. **nit** `images.ts:34`: I could not confirm `gemini-nano-banana-2.1` and `gpt-image-2.5-sunburst` are real API model ids. A wrong id fails after the reservation, which then stays counted.
48. **nit** `src/commands/export.ts:19`: when MB `import` fails, the error surfaces as a stack trace rather than a `UserError`.

**Counts:** 8 blockers, 30 concerns, 10 nits.
