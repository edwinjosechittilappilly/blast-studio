# Command reference

Run `bstudio help`, `bstudio --help`, or `bstudio -h` for the command list; `bstudio --version` prints the installed version. Project and campaign slugs contain lowercase letters, numbers, and single hyphens between components. Campaign commands take a full `<project>/<campaign>` address; below, `<address>` means that address.

## Setup

- `bstudio init` creates the configuration and private studio directories, retaining an existing configuration.
- `bstudio doctor` checks the runtime, tools, selected provider credentials and budget. Some tools are optional.
- `bstudio install-skills [--with-hyperframes]` links the bundled skills into `~/.agents/skills` and `~/.claude/skills`. It skips existing real files and directories; `--with-hyperframes` also invokes the external HyperFrames skill installer.
- `bstudio auth set <KEY> [--stdin]` stores `GEMINI_API_KEY` or `OPENAI_API_KEY` in macOS Keychain. Use `--stdin` to read the value from standard input. On other platforms, use the studio root's `.env` instead.
- `bstudio auth list` shows credential sources without displaying their values.

## Projects

- `bstudio project new <project> [--repo owner/repo] [--url URL]... [--note text]...` creates a project and collects optional shared evidence. URLs and notes can be repeated; an existing project is not overwritten.
- `bstudio project list` lists projects with their campaign counts and last update times.
- `bstudio project rename <project> <new-project>` moves a project and its campaigns to a new slug.
- `bstudio campaign rename <project>/<campaign> <new-project>/<new-campaign>` moves a campaign within or between existing projects. Both rename commands preserve campaign records and spending attribution and refuse active jobs or an existing destination.

Projects contain shared evidence and independent campaigns. Legacy flat projects are migrated automatically on startup; see [workflow](workflow.md) for storage and recovery.

## Create and review

`bstudio new` runs brief, plan, make, render, and review in order, stopping on an error and printing a resume command. Create the project first; the campaign address is required and the command accepts the same input options as `brief`:

```text
bstudio new <project>/<campaign> [--idea text] [--note text] [--url URL] [--pr number] [--commit sha] [--repo owner/repo|local] [--mb-brief path] [--force] [-h|--help]
bstudio brief <project>/<campaign> [--idea text] [--note text] [--url URL] [--pr number] [--commit sha] [--repo owner/repo|local] [--mb-brief path] [--force] [-h|--help]
```

On failure, the pipeline prints `Resume with: bstudio <step> <address>`, for example `Resume with: bstudio render acme/launch`. This command runs only the indicated step, not subsequent steps. Run a command with `--help` for its options and examples; valued options accept both `--option=value` and `--option value`.

At least one input or shared project evidence is required. `--note` and `--url` can be repeated. `--repo` alone collects repository information; PRs require a GitHub repository and commits can use `local`. `--mb-brief` imports evidence sections from a Market Blaster brief. `--force` overwrites an existing brief. Shared and campaign inputs are stored as evidence in `brief.md`.

Examples (either command accepts these inputs):

```sh
bstudio brief acme/launch --idea 'Announcing launch' --note 'Available today'
bstudio brief acme/launch --pr 12 --repo acme/app
bstudio brief acme/launch --commit abcd1234 --repo local --mb-brief brief.md
```

- `bstudio plan <address> [--platforms=id,...] [--assets=id,...]` asks the agent for a plan for enabled destinations permitted by their AI policies. Scoped planning retains unselected entries.
- `bstudio make <address> [--platforms=id,...] [--assets=id,...]` writes selected posts and asset sources using the agent. Both commands also accept `--platforms id,...` and `--assets id,...`.
- `bstudio render <address> [--regen] [--assets=id,...] [--platforms=id,...]` renders planned assets. `--regen` requests regeneration of provider-generated assets rather than using cached outputs. `--assets` selects assets to render; `--platforms` limits which posts are updated with rendered media.
- `bstudio review [<address>] [--calibrate] [--platforms=id,...]` runs deterministic gates and, when configured, the reviewer. An address is required for review; `--platforms` limits the reviewed posts. `--calibrate`, alone or after an address, measures reviewer agreement against the bundled fixtures instead of reviewing the campaign.
- `bstudio revise <address> [--note <text>] [--asset <id>] [--platform <id>] [--feedback-only]` applies pending owner feedback and review findings. A note can target an asset, a platform's post, or the whole campaign when neither is specified. Use `--feedback-only` to skip automatic review-finding rounds. Owner feedback rounds do not count against `review.maxRounds`. Stale targets are rejected with a reason; concurrent revision is prevented by a campaign lock. Blocked rights need human resolution.
- `bstudio blockers <address> [list]` lists agent-declared blockers with a target, zero-based index and text. `bstudio blockers <address> resolve <target> <index> --text <blocker-text> --reason <reason>` removes one after recording an owner-provided reason and saving a history snapshot. Supply the exact text from the list; if it has changed, list again before resolving. Targets identify a post (`post:linkedin`) or asset (`asset:launch-poster`). For values beginning with `-`, use `--text=<blocker-text>` or `--reason=<reason>`. Resolve the underlying issue first, then re-run review.
- `bstudio feedback <address> list|add --note <text> [--asset <id>|--platform <id>]|rm <id>` lists, queues, or removes pending/rejected feedback without applying it. Run `revise` to apply queued feedback.
- `bstudio history <address>` lists snapshots; `bstudio restore <address> <n>` restores one after saving the current state. Up to 20 non-blocker snapshots and 50 blocker-resolution snapshots are retained separately in `history/<n>-<step>-<timestamp>/`.
- `bstudio accept <address> <platform> --reason <reason>` records a human score override. The review must be current and all gates must pass, including a fresh gate evaluation.
- `bstudio confirm <address> <asset-id> [--trademark-checked] [--license <license>]` records a human trademark check and/or the asset's license after verifying them.
- `bstudio render-preview <file.html|.svg|.mmd|.d2> --size WxH --out <path>` renders one source offline. HTML can produce PDF when the output ends in `.pdf`.

## Handoff and records

- `bstudio export <address> [--mb <project>] [--force] [--dir]` writes `export/<project>--<campaign>.campaign.zip` with reviewed content and handoffs. Each export is also preserved under `export/<timestamp>/`; `bstudio export <address> --list` lists zip and directory exports with their sizes and times. Without a Market Blaster project, the package is local only; import later by rerunning with `--mb <project>`. The target is selected from `--mb`, then `marketBlaster.project` in the project's `project.yml`, then the studio configuration. Relative project metadata paths are resolved from the project's directory; `--mb` and studio configuration paths are resolved from the current working directory. When a target is configured, export imports and checks it under the composite `<project>--<campaign>` slug. `--dir` writes the legacy v1 directory instead; `--force` is passed to the import. Market Blaster warns before overwriting unapproved drafts; approved drafts require `--force`. See [package identity and collisions](design/campaign-package.md).
  Use `--local` to skip Market Blaster import even when a project is configured; it cannot be combined with `--mb` or `--force`.
- `bstudio mark <address> <platform> --url <https-url>` records a publication URL for `youtube-shorts`, `instagram`, `tiktok`, or `dailydev`. The URL host must match the destination and the post must exist.
- `bstudio status [<address>] [--verbose]` shows campaign verdicts, monthly spend, and source health. `--verbose` lists unverified pack fields.
- `bstudio library [search <query>]` lists campaigns or searches the library.
- `bstudio jobs list`, `bstudio jobs log <id>`, and `bstudio jobs cancel <id>` inspect, read the persisted output of, or cancel a durable job. Campaign jobs share a lock across CLI and dashboard processes.
- `bstudio dashboard [--port <port>]` starts the [local dashboard](dashboard.md), defaulting to port 4848.

## Budget and platform sources

- `bstudio budget [show]` displays spend and caps. `bstudio budget set <usd>` sets the monthly cap; `bstudio budget set-project <usd>` sets the per-project cap. See [budget](budget.md).
- `bstudio sources check [--only id,...] [--write]` checks monitored sources and stores reports in the studio root. `--write` updates snapshots; in a source checkout it writes snapshots and reports there for review. See [source updates](updater.md).
- `bstudio sources propose [--branch]` proposes pack updates from the latest report, optionally creating an update branch.
- `bstudio sources verify <id>...` stamps cited pack fields with today's verification date after human review. See [source updates](updater.md).
