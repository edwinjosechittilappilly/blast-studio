# Command reference

Run `bstudio help`, `bstudio --help`, or `bstudio -h` for the command list. Project slugs contain lowercase letters, numbers, and single hyphens between components.

## Setup

- `bstudio init` creates the configuration and private studio directories, retaining an existing configuration.
- `bstudio doctor` checks the runtime, tools, selected provider credentials and budget. Some tools are optional.
- `bstudio install-skills [--with-hyperframes]` links the bundled skills into `~/.agents/skills` and `~/.claude/skills`. It skips existing real files and directories; `--with-hyperframes` also invokes the external HyperFrames skill installer.
- `bstudio auth set <KEY> [--stdin]` stores `GEMINI_API_KEY` or `OPENAI_API_KEY` in macOS Keychain. Use `--stdin` to read the value from standard input. On other platforms, use the studio root's `.env` instead.
- `bstudio auth list` shows credential sources without displaying their values.

## Create and review

`bstudio new` runs brief, plan, make, render, and review in order, stopping on an error and printing a resume command. It requires the slug first and accepts the same input options as `brief`:

```text
bstudio new <slug> [--idea text] [--note text] [--url url] [--pr number]
  [--commit sha] [--repo owner/repo|local] [--mb-brief path] [--force]
bstudio brief <slug> [--idea text] [--note text] [--url url] [--pr number]
  [--commit sha] [--repo owner/repo|local] [--mb-brief path] [--force]
```

At least one input is required. `--note` and `--url` can be repeated. `--repo` alone collects repository information; PRs require a GitHub repository and commits can use `local`. `--mb-brief` imports evidence sections from a Market Blaster brief. `--force` overwrites an existing brief. Inputs are stored as evidence in `brief.md`.

- `bstudio plan <slug>` asks the agent for a plan for enabled destinations permitted by their AI policies.
- `bstudio make <slug>` writes planned posts and asset sources using the agent.
- `bstudio render <slug> [--regen] [--assets=id,...] [--platforms=id,...]` renders planned assets. `--regen` requests regeneration of provider-generated assets rather than using cached outputs. `--assets` selects assets to render; `--platforms` limits which posts are updated with rendered media.
- `bstudio review [<slug>] [--calibrate] [--platforms=id,...]` runs deterministic gates and, when configured, the reviewer. A slug is required for review; `--platforms` limits the reviewed posts. `--calibrate`, alone or after a slug, measures reviewer agreement against the bundled fixtures instead of reviewing the project.
- `bstudio revise <slug> [--note <text>] [--asset <id>] [--platform <id>] [--feedback-only]` applies pending owner feedback and review findings. A note can target an asset, a platform's post, or the whole project when neither is specified. Use `--feedback-only` to skip automatic review-finding rounds. Owner feedback rounds do not count against `review.maxRounds`. Stale targets are rejected with a reason; concurrent revision is prevented by a project lock. Blocked rights need human resolution.
- `bstudio accept <slug> <platform> --reason <reason>` records a human score override. The review must be current and all gates must pass, including a fresh gate evaluation.
- `bstudio confirm <slug> <asset-id> [--trademark-checked] [--license <license>]` records a human trademark check and/or the asset's license after verifying them.
- `bstudio render-preview <file.html|.svg|.mmd|.d2> --size WxH --out <path>` renders one source offline. HTML can produce PDF when the output ends in `.pdf`.

## Handoff and records

- `bstudio export <slug> [--mb <project>] [--force] [--dir]` writes `export/<slug>.campaign.zip` with reviewed content and handoffs, then imports and checks it if `--mb` or `marketBlaster.project` identifies a Market Blaster project. `--dir` writes the legacy v1 directory instead; `--force` is passed to the import.
- `bstudio mark <slug> <platform> --url <https-url>` records a publication URL for `youtube-shorts`, `instagram`, `tiktok`, or `dailydev`. The URL host must match the destination and the post must exist.
- `bstudio status [<slug>] [--verbose]` shows project verdicts, monthly spend, and source health. `--verbose` lists unverified pack fields.
- `bstudio library [search <query>]` lists projects or searches the library.
- `bstudio dashboard [--port <port>]` starts the [local dashboard](dashboard.md), defaulting to port 4848.

## Budget and platform sources

- `bstudio budget [show]` displays spend and caps. `bstudio budget set <usd>` sets the monthly cap; `bstudio budget set-project <usd>` sets the per-project cap. See [budget](budget.md).
- `bstudio sources check [--only id,...] [--write]` checks monitored sources. `--write` is accepted but snapshots are written by default.
- `bstudio sources propose [--branch]` proposes pack updates from the latest report, optionally creating an update branch.
- `bstudio sources verify <id>...` stamps cited pack fields with today's verification date after human review. See [source updates](updater.md).
