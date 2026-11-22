# Design review 1 (anthropic/claude-opus-5-5 via slipway run review)

## Correctness against the research

1. **blocker: the disclosure gate only covers synthetic media, and it overstates LinkedIn.**
   - Lines 23 and 150 limit disclosure to "realistic synthetic media".
   - Text disclosure is also required. DEV has three AI disclosure tiers (`platform-virality.md:155`). Medium requires AI-text disclosure plus captions on generated images (`:157`). Buttondown also bans machine-generated images (`:163`).
   - DEV is Market Blaster's canonical home, and every draft there is AI-written, so the most common path skips the rule.
   - LinkedIn only *recommends* disclosure (`:148`). Meta's self-disclosure scope is `[UNVERIFIED]` (`:152`).
   - **Fix:**
     - Each pack gets `disclosure: {text, media, voice}`, each value being a rule, `recommended` or `unknown`.
     - Posts get `disclosure:` frontmatter (DEV tier, Medium line, Threads `is_made_with_ai`).
     - Export carries this field, and Market Blaster's `approve` and handoffs print it.
     - Reword line 23.

2. **concern: the updater's `git-commit` detector watches the wrong thing.**
   - Line 184 compares the default-branch HEAD. The research says to watch the repository *path* (`platform-virality.md:167`).
   - Repo-wide HEAD on `bluesky-social/atproto` changes daily, which means an alert every week.
   - The registry URL `…/atproto/blob/main/lexicons/app/bsky/feed/post.json` already returns **404**. The lexicons moved to `packages/api/lexicons/…`.
   - **Fix:**
     - Detect with `gh api repos/{o}/{r}/commits?path=<path>&per_page=1`.
     - Treat a 404 as `failed`.
     - Update the registry row.
     - Drop `twitter/the-algorithm`, which is historical.

3. **concern: Bluesky facts are stale, and they matter for Market Blaster.**
   - `app.bsky.embed.images` now allows up to **2 MB** per image.
   - A new `app.bsky.embed.gallery` type exists (schema maximum 20).
   - `embed.video` allows 300 MB, with `alt` and up to 20 VTT `captions`.
   - A post's `embed` is a single union. Images and an `external` link card can't both be attached, but `bluesky.ts` always adds the external card when the post has a URL.
   - **Fix:**
     - Line 214 should say: images *replace* the link card.
     - Upload the VTT as captions instead of only burning them in.
     - The pack takes these limits from the lexicon source.

4. **concern: rendering one master and reframing with FFmpeg contradicts the research.**
   - Line 121 renders once, then runs "FFmpeg per aspect ratio". The research says "a crop is not equivalent to re-layout" (`media-stack.md:79`).
   - **Fix:** use one HyperFrames composition per aspect ratio, with responsive layout. FFmpeg only encodes and muxes.

5. **concern: LinkedIn carousels are promised but can't be sent through the API.**
   - Goal 2 promises a LinkedIn carousel PDF.
   - Crosspost's `LinkedInStrategy` only calls `rest/images?action=initializeUpload` (image and multi-image). It has no document upload, and the research marks document support `[UNVERIFIED]` (`media-stack.md:31`).
   - Market Blaster's `crosspost.ts` `create()` passes text only.
   - **Fix:**
     - State that the PDF goes out as a manual handoff.
     - In Market Blaster, pass `images: [{data, alt}]` through to Crosspost.

6. **concern: the score scale conflicts between the two research docs, and the design drops N/A.**
   - `existing-skills.md:91` says 1–5 anchored scales plus a human-agreement audit. `platform-virality.md:10` says 0–2 plus `N/A`.
   - The design (line 154) picks 0–2 with no `N/A`, so a hook criterion on a Gist or an unused visual criterion drags the percentage down.
   - **Fix:** record the 0–2 choice explicitly. Add `N/A`, excluded from both numerator and denominator.

7. **nit: "resvg via Playwright" (line 119) mixes up two renderers.**
   - resvg is a standalone renderer (`@resvg/resvg-js`). Chromium renders SVG on its own.
   - **Fix:** pick one. ICO needs a converter such as ImageMagick (`media-stack.md:60`).

8. **nit: the Remotion rejection gives a weak reason and skips the owner's decision.**
   - The research's default was Remotion (`media-stack.md:11`). The owner chose HyperFrames (bead `v3l.5`, comment 2026-11-22).
   - "Doesn't fit an Apache-2.0 repo" is imprecise. The real issue is that reusers with more than 3 people need their own license.
   - **Fix:** cite `v3l.5` and state that reason.

9. **nit: three smaller wording errors.**
   - The registry has 65 rows, not "about 60" (line 29).
   - Motion Canvas has community skills (VideoZero, Apache-2.0), not none.
   - The captions gate says "every video". The research scopes captions to relevant audio (`platform-virality.md:16`). Silent motion graphics need a text description instead.

## Market Blaster integration

10. **blocker: export writes Market Blaster's internal files without a contract.**
    - `checkCampaign` raises `missing draft` for **every** enabled destination with no draft (`check.ts`). A partial export therefore fails `check`, and `approve` refuses.
    - Brief anchor numbering, `needsTitle`, DEV tag rules, `{{url:<dest>}}` links, `skip:` and `ai: none` deletion are all Market Blaster rules. Studio would have to copy them.
    - `existing-skills.md:92` asks for a portable manifest validated against the receiving CLI.
    - **Fix:**
      - Market Blaster adds `mblast import <dir>` taking a versioned manifest.
      - It writes `skip: not planned in studio` for enabled destinations that weren't exported.
      - It runs `check` and refuses to overwrite approved drafts unless `--force`.
      - Studio never writes Market Blaster files directly.

11. **blocker: threads can't be represented in Market Blaster.**
    - Goal 2 promises "text and threads".
    - Market Blaster drafts are one body per destination, checked at 280/300/500.
    - Posting a thread is a reply chain, and a half-posted chain breaks the `unknown`/idempotency model.
    - **Fix:** either drop threads from v1 export (keep them as a handoff text file), or scope thread support in Market Blaster with a per-item status in the state.

12. **concern: the platform-to-destination mapping is undefined.**
    - `DESTINATION_IDS` has no `dailydev`, `youtube`, `instagram` or `tiktok`.
    - X is an intent link by owner decision (`auth-and-reach.md:54`), so X media is always manual.
    - **Fix:** add a mapping table in the design: platform → Market Blaster id → api or handoff → media path.

13. **concern: media adapters have unstated feasibility gaps.**
    - The DEV `main_image` needs a hosted URL (line 216), and nothing hosts one.
    - The Gist API takes text `content` only (`gist.ts`), so binary images can't be attached.
    - Mastodon video uploads are async (202, then poll), and limits come from `/api/v2/instance` `media_attachments`.
    - Media uploads are writes that happen before the post, so they need their own preflight.
    - **Fix:**
      - DEV: a cover-image URL in config, or a handoff.
      - Gist: SVG/text only.
      - Mastodon: read media limits during preflight.
      - Market Blaster's `approve` lists media paths and alt text, and opens them with `qlmanage -p`.

14. **concern: this is a Market Blaster behaviour change against its own non-goal.**
    - Market Blaster's design lists "image upload" as a v1 non-goal (`market-blaster.md:35`, `openspec/changes/market-blaster/design.md:22`).
    - Line 254 says "tracked as linked beads".
    - **Fix:** open an OpenSpec change in Market Blaster that amends the non-goal. Make it a dependency of Goal 5.

15. **concern: the review result goes stale after export.**
    - Market Blaster expects people to edit drafts. After an edit, the Studio review no longer applies, and nothing records that.
    - Two length checks can also disagree: Market Blaster counts links at a worst case of 100 characters (`links.ts`) and reads the real Mastodon limit at preflight.
    - **Fix:** export writes `studio: {reviewHash, verdict}`. Market Blaster's `check` warns when the draft hash changes. Export's final step is `mblast check`, which settles the limits.

## Missing alternatives

16. **concern: no phased-scope alternative.** Weigh a text + cards + carousel v1 against everything at once (see 21).

17. **concern: no real-footage path.**
    - Human narration and screen recording with Whisper captions are the research's default (`media-stack.md:91,95-96`). The design only offers TTS.
    - **Fix:** add a `--footage` input kind plus local Whisper for captions, and mark TTS as optional.

18. **nit: still renderers aren't compared.**
    - Satori + resvg and Takumi are missing (`media-stack.md:7`).
    - Puppeteer for stills is also missing. HyperFrames' engine already depends on `puppeteer ~25.13`, and `mmdc` bundles another Chromium, so the stack ships three browsers.
    - **Fix:** pick one driver, or record the reason for two.

19. **nit: no skills-only alternative.** Skills, packs and a few scripts with no CLI would be the cheapest option; reject it explicitly.

20. **nit: no human-checklist reviewer alternative.** Weigh a deterministic-gates-plus-human-checklist reviewer against the LLM rubric.

## Solo-developer design flaws and over-engineering

21. **blocker: no milestones.**
    - The design covers about 16 platform packs, 9 formats, 7 skills, 4 diagram engines, video, TTS, budget, library, dashboard, a local updater and a CI agent PR. Line 253 lists no phases.
    - **Fix:**
      - v1: text, HTML cards and carousels, gates plus reviewer, `mblast import` for Bluesky, Mastodon, DEV, LinkedIn and X (handoff), and `sources check`.
      - v2: HyperFrames, VHS and images under the cap.
      - v3: dashboard, CI propose, short-video platforms.

22. **concern: too many diagram engines.**
    - Line 120 lists mmdc, d2, excalidraw and arch-diagram. arch-diagram's license is `[UNVERIFIED]` for redistribution (`existing-skills.md:53`).
    - **Fix:** v1 uses Mermaid, plus arch-diagram as a local optional, and drops the `studio-diagram` wrapper.

23. **concern: `library.json` and `library search` duplicate the filesystem.**
    - **Fix:** derive the index on each request by scanning `projects/*/`, and use `rg` for search. That removes a rebuild step and a source of stale data.

24. **nit: cut low-value pieces.**
    - Drop WebP, the 16–1024 px favicon ladder and TTS from v1.
    - Merge `studio-strategist` into `studio-writer`. Seven skills is seven things to keep in sync with packs.

25. **nit: pairwise hook comparison is expensive.**
    - Three hooks compared pairwise in both orders is 6 reviewer calls per platform.
    - **Fix:** rank the full list twice with shuffled order, or let the owner pick from `plan.yml`.

26. **concern: `make` can't see its own renders.**
    - It writes HTML and HyperFrames sources without rendering (line 100), so visual defects only show up at review. With `maxRounds: 2`, that wastes rounds.
    - **Fix:** expose a sandboxed `render-preview` command (local, no network, no keys) inside the workspace.

27. **concern: re-rendering re-bills.**
    - `render` calls paid providers (line 123), so a rerun or revise spends again. The research says regenerate only on explicit request (`media-stack.md:8`).
    - **Fix:** cache by hash of the `prompt.json` content, and require `--regen`.

## Risks not covered

28. **concern: unreleased content can leak.** The design doesn't say where the studio root lives. If `projects/` is in this public repo, drafts leak; Market Blaster listed this risk, the Studio design does not. **Fix:** a global studio dir outside git (for example `~/blast-studio`) plus `.gitignore` for `projects/`, `ledger.jsonl` and `out/`.

29. **concern: anti-slop scoring can turn into AI-detection evasion.** The revise loop tunes text against detector signals, and humanizer forbids disguising machine authorship (`existing-skills.md:31`). **Fix:** for destinations with `ai: none` or `outline`, never produce prose; the gate keys on provenance, not detectability. State this in `studio-reviewer`.

30. **concern: shipped and planned claims aren't separated.** Grounding is token-level only. `existing-skills.md:86` asks for claim-to-source records marking shipped, planned and unsupported. **Fix:** brief sections carry `status: shipped|planned`, and the reviewer gate flags planned facts stated as shipped.

31. **concern: the AI-generated flag is lost in composites.** An AI illustration screenshotted inside an HTML card loses C2PA metadata (`media-stack.md:54`). **Fix:** composites inherit `aiGenerated` from every asset they embed, and the disclosure gate reads that inherited flag.

32. **concern: font licensing.** "Templates embed fonts" (line 241) means redistributing font files in an Apache-2.0 repo. **Fix:** OFL-only fonts with license files, and the brand-kit fonts stay user-local.

33. **concern: the toolchain is unpinned.** `npx hyperframes` and `npx skills add` run unpinned, possibly from an agent workspace with network access. **Fix:** pin in `package.json` or the lockfile, and install only through `doctor`.

34. **concern: golden renders will flake.** Fonts and Chromium differ between macOS and Linux. **Fix:** run goldens only in a pinned Playwright Docker image with a perceptual diff threshold. Video goldens compare 3 extracted frames, not bytes.

35. **nit: logos need a trademark caveat.** Add a "human trademark search" checkbox to logo review (`media-stack.md:9,60`).

36. **nit: text-heavy Reels.** Instagram says predominantly-text Reels can be less visible (`platform-virality.md:92`). Kinetic-type video should get a pack warning for Reels.

## Reviewer and scoring

37. **concern: grounding as a hard gate will block legitimate posts.** Market Blaster keeps this check at `warning` because of false positives ("3 steps", years, `v1`). An `--idea`-only brief will fail almost everything. **Fix:** allow `grounding.waive: [{token, reason}]` in post frontmatter, recorded in `review.json`. Run the check over the HTML text, captions, VTT and alt text, not just the post body.

38. **concern: spec gates rely on unknown values.** Most matrix cells are `U` (`platform-virality.md:122`). Mastodon and X limits depend on the instance or account. **Fix:** pack values are `{value, source, verified}` or `unknown`. Unknown values produce warnings, never gates. Account values come from the Market Blaster config at export.

39. **concern: the reviewer's input and output are unspecified.**
    - Visual quality needs images, and it's unverified whether `omp -p` accepts image attachments.
    - Text-node size and contrast are measurable during rendering.
    - **Fix:**
      - The reviewer workspace contains `brief.md`, the posts, PNGs and 3 FFmpeg-extracted frames per video, all fenced as untrusted (posts can contain injected text addressed to the reviewer).
      - Output must follow a JSON schema; invalid output gets 1 retry, then the review errors.
      - Playwright records the minimum font size in px, WCAG contrast and safe-zone overflow per text node. These become deterministic checks, not LLM judgement.

40. **concern: no calibration metric.** `test/fixtures/reviews` has no acceptance criterion, but the research asks for agreement against held-out human labels. **Fix:** `bstudio review --calibrate` reports per-criterion agreement against about 20 owner-labelled posts. Until agreement meets a stated bar, the threshold is advisory.

41. **concern: what can be exported is undefined.**
    - The design doesn't say whether a post still at `revise` can be exported, or how "a person decides".
    - Outline destinations (Reddit, Product Hunt, Lemmy, newsletter) get scored on hook and anti-slop, though only talking points ship.
    - **Fix:**
      - `bstudio accept <slug> <platform> --reason` records an override of rubric scores, never of gates.
      - Export needs `pass` or `accepted`.
      - Outline posts use a separate rubric (coverage, evidence, rules checked).

42. **nit: the `blocked` verdict for HN text can't happen.** Plan never creates HN posts (`ai: none`), so the "HN text" example at line 163 is unreachable. **Fix:** pick a real example of an unfixable gate, such as missing rights for a provider asset.

## Updater

43. **concern: no snapshot store.** `propose` reads "the old snapshot" (line 188), but `check` only stores a hash. **Fix:** commit normalized text to `sources/snapshots/<id>.txt` so CI can diff. Add a per-source CSS selector or extractor. Mark pages that block bots or need JS as `detector: manual` with a reminder date.

44. **concern: the CI agent PR is an injection path into skills.** Fetched pages are untrusted, and the agent edits skills that future agents read as instructions. **Fix:**
    - CI may edit pack data fields only, never skills.
    - Run the agent with `contents: read`. A separate step opens the PR limited to paths under `platforms/`.
    - Schema-validate the edits.
    - Every edit cites a quote that must exist in the new snapshot.

45. **concern: no way to record human verification, and pack values don't cite sources.** **Fix:** add `bstudio sources verify <id>…` to set `lastVerified`. Each pack value carries its `source` id so `check` can name the affected fields. Policy fields more than 90 days unverified block export of draft-policy posts on that platform.

46. **nit: coverage gaps.** Provider pricing pages (OpenAI, Gemini) and tool releases (HyperFrames, Playwright) aren't watched. **Fix:** add pricing pages to the registry and let Renovate track tool versions.

## Budget

47. **concern: pre-call cost isn't the real cost, and the ledger isn't crash-safe.**
    - OpenAI and Gemini also bill input tokens, so the true cost is known only after the call (`media-stack.md:39-40`).
    - Two concurrent processes can both pass the cap check.
    - A crash between the call and the ledger write loses the spend.
    - **Fix:**
      - Hold a lock using Market Blaster's `withStateLock` pattern.
      - Append a `reserved` line with the upper-bound estimate, then a `settled` line with actual usage.
      - Refuse any model missing from a dated price table.
      - Count months in UTC.

48. **concern: the cap excludes LLM spend.** The plan, make, review and revise agents and the CI `MODEL_API_KEY` run are the likely largest costs, and none of them count. **Fix:** ledger the agent runs (tokens or subscription units, USD when API-billed). Give CI its own cap, or require a provider-side spend limit on that key.

49. **concern: owner decisions from the research are missing.** `media-stack.md:101` asks for a per-job budget plus a policy on sending prompts and reference images to hosted providers. **Fix:** add `budget.perProjectUsd` and `providers.allowUpload: false|true`.

50. **concern: the `omp` provider is unverified.** It's feature-gated (`generate_image.enabled`, default false), billed by subscription, and its cost is unknown. It's unclear how a non-agent CLI step calls an agent tool. **Fix:** run a spike first. Ledger the units with `usd: null`, and have `doctor` check the flag.

51. **nit: line 250 is wrong about rebuilding the ledger.** It says "the ledger and library rebuild from files", but the ledger is the primary record. Only the library can be rebuilt.

## Dashboard

52. **concern: reads are open.**
    - Only writes need the token, so a DNS-rebinding page can read briefs and unreleased media from `127.0.0.1`.
    - The media endpoint invites path traversal.
    - A token in the URL ends up in browser history.
    - **Fix:**
      - Reject any `Host` other than `127.0.0.1:<port>` or `localhost:<port>`.
      - Require the token on every route: swap the URL token for an `HttpOnly` `SameSite=Strict` cookie, then redirect.
      - Resolve media with `realpath` and only serve files under `projects/`.

53. **nit: read-only first.** The owner asked for a dashboard (bead `v3l.5`), but v1 could be a generated `projects/<slug>/report.html` with no server. Server writes can come after the CLI is stable. If server writes stay, edit `studio.yml` with the `yaml` Document API so comments survive.

54. **nit: smaller doc mismatches.**
    - Goal 1's flags don't match the `brief` row (`--note`, `--repo`, `--mb-brief`).
    - `install-skills` is missing from the commands table.
    - Shorts, Reels and TikTok exports go to `exports/` with no publish status, so the dashboard can't show them. Add `bstudio mark <slug> <platform> --url`.
