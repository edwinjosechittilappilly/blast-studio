# Workflow

A project lives at `<studio-root>/projects/<slug>/`. The shortcut `bstudio new <slug> <inputs>` runs `brief`, `plan`, `make`, `render`, and `review` in order, stopping at the first error and printing the command to resume. Run the stages separately when you want to inspect or edit the brief or plan before continuing.

## Collect evidence

```sh
bstudio brief release-note --idea "Describe the release" \
  --note "The migration is optional" --url https://example.com/release-notes
bstudio plan release-note
bstudio make release-note
bstudio render release-note
bstudio review release-note
```

`brief` accepts `--idea`, repeatable `--note` and `--url`, `--pr` with `--repo owner/repo`, `--commit` with `--repo owner/repo` or `--repo local`, a standalone `--repo`, and `--mb-brief <path>`. GitHub inputs use `gh`; local commit and repository inputs use git in the current directory. Provide at least one input. Existing briefs are protected unless `--force` is supplied.

A standalone GitHub `--repo owner/repo` also collects the default-branch README as a separate untrusted evidence section, limited to 40,000 characters with a truncation notice. A missing README is allowed; other fetch failures are reported. PR and commit inputs remain focused on the specified change and do not fetch the README.

The command writes evidence sections such as `## [E1] Idea` to `brief.md`. Ideas, notes and URLs are claims; commits are marked shipped, and PRs are marked shipped if merged and planned otherwise. Imported Market Blaster evidence retains its status. Source text is fenced as untrusted. Add context and corrections to the brief, and check that planned work is described as planned.

Projects are stored in the studio root and copied into temporary agent workspaces as needed, but configured agents may send their contents to external model providers. Avoid including secrets or material you cannot share with those providers.

## Plan and make

`plan` asks the configured author agent to write `plan.yml` with a post type, angle, three hook options and asset list for each allowed platform. It validates the plan against platform policies and formats. Platforms with `ai: none` are excluded; `ai: outline` platforms get text-only plans for human-authored talking points.

`make` uses the brief, plan, brand settings, platform packs and bundled skills to write `posts/<platform>.md` and the planned asset sources and metadata. Authoring runs in a temporary workspace and only declared output paths are copied back. Inspect and edit the drafts and sources before rendering.

## Render, review and revise

`render` creates outputs under each asset's `out/` directory and updates `asset.yml`. Paid image and voice generation uses cached results; use `bstudio render release-note --regen` when a new generation is intended. See [formats](formats.md) for source and tool requirements.

`review` writes `reviews/<platform>.json` and `review.md`. Address findings yourself or run `bstudio revise release-note`, which applies pending owner feedback and uses the author agent to address failing reviews, re-render and re-review. Add feedback directly with `bstudio revise release-note --note "Make the headline shorter" --platform bluesky`, or target an asset with `--asset <id>`; omit both targets for the whole project. Dashboard feedback is picked up by plain `revise`. Owner feedback rounds do not count against `review.maxRounds`, which limits automatic review-finding rounds. A blocked rights finding needs human resolution. See [review](review.md) for gates, scores and acceptance.

## Export and publish

```sh
bstudio export release-note
bstudio export release-note --mb /path/to/market-blaster-project
```

Export requires every post to have a current passing or accepted review with passing gates. It writes `export/<slug>.campaign.zip`, containing the manifest, brief, sources, posts, media, handoffs and reviews. Use `--dir` for the legacy v1 directory export. With `--mb`, or a configured `marketBlaster.project`, it also invokes Market Blaster's `import` and `check`; `--force` is passed to the import. Export does not publish content.

The archive includes the full brief and extracted evidence, not just publication-ready text. Inspect it before sharing. It is limited to 2,000 entries, 500 MiB per entry and 1 GiB total uncompressed content.

The archive is deterministic for unchanged inputs. Its manifest timestamp uses the latest valid review timestamp (or the ZIP epoch for older reviews without one), so re-exporting does not change the package solely because the clock advanced.

Manual destinations and threads are included under `handoff/` in the archive. Follow the platform checklist, publish through the destination, and use `bstudio mark <slug> <platform> --url <https-url>` to record a publication for supported manual destinations: YouTube Shorts, Instagram, TikTok and daily.dev. The URL must belong to the destination's accepted host.

Use `bstudio status [<slug>]` and `bstudio library [search <query>]` to find work, or `bstudio dashboard` for the local interface.
