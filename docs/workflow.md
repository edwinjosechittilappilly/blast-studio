# Workflow

A project lives at `<studio-root>/projects/<project>/`, with `project.yml` metadata, shared `evidence/`, and independent campaigns at `campaigns/<campaign>/`. Create a project with `bstudio project new acme` and list projects with `bstudio project list`. Campaign commands use the full `<project>/<campaign>` address, for example `acme/release-note`. Both components use lowercase letters, numbers, and single hyphens between components.

On startup, a legacy `projects/<slug>/brief.md` project is automatically migrated to `projects/<slug>/campaigns/<slug>/`, including unknown files. Stop running jobs and dashboard revisions, then back up the studio before upgrading. Migration records progress in `.bstudio-migration.json` and resumes after interruption. If a destination or metadata conflict is reported, preserve both copies, resolve the indicated paths manually, and retry; do not remove the journal while recovery is pending. Historical ledger entries remain attributed to the migrated `<slug>/<slug>` campaign for spending limits. See [migration and Market Blaster identity](configuration.md#project-storage-and-migration) before re-exporting.

The shortcut `bstudio new <project>/<campaign> <inputs>` runs `brief`, `plan`, `make`, `render`, and `review` in order, stopping at the first error and printing the command to resume. Run the stages separately when you want to inspect or edit the brief or plan before continuing.

## Collect evidence

```sh
bstudio project new acme --repo owner/repo --note "Product context"
bstudio brief acme/release-note --idea "Describe the release" \
  --note "The migration is optional" --url https://example.com/release-notes
bstudio plan acme/release-note
bstudio make acme/release-note
bstudio render acme/release-note
bstudio review acme/release-note
```

`brief` accepts `--idea`, repeatable `--note` and `--url`, `--pr` with `--repo owner/repo`, `--commit` with `--repo owner/repo` or `--repo local`, a standalone `--repo`, and `--mb-brief <path>`. GitHub inputs use `gh`; local commit and repository inputs use git in the current directory. Provide at least one campaign input or shared project evidence. Existing briefs are protected unless `--force` is supplied.

A standalone GitHub `--repo owner/repo` also collects the default-branch README as a separate untrusted evidence section, limited to 40,000 characters with a truncation notice. A missing README is allowed; other fetch failures are reported. PR and commit inputs remain focused on the specified change and do not fetch the README.

The command writes evidence sections such as `## [E1] Idea` to `brief.md`. Ideas, notes and URLs are claims; commits are marked shipped, and PRs are marked shipped if merged and planned otherwise. Imported Market Blaster evidence retains its status. Source text is fenced as untrusted. Add context and corrections to the brief, and check that planned work is described as planned.

Projects are stored in the studio root and copied into temporary agent workspaces as needed, but configured agents may send their contents to external model providers. Avoid including secrets or material you cannot share with those providers.

## Plan and make

`plan` asks the configured author agent to write `plan.yml` with a post type, angle, three hook options and asset list for each allowed platform. It validates the plan against platform policies and formats. Platforms with `ai: none` are excluded; `ai: outline` platforms get text-only plans for human-authored talking points.

`make` uses the brief, plan, brand settings, platform packs and bundled skills to write `posts/<platform>.md` and the planned asset sources and metadata. Authoring runs in a temporary workspace and only declared output paths are copied back. Inspect and edit the drafts and sources before rendering.

Scope reruns with `--platforms=bluesky` or `--assets=logo` (space forms also work). Unknown IDs fail before the agent runs. Agent-declared blockers appear after make and fail the specs gate; review prints failing gates, suggested fixes and the review file path.

Blockers are arrays of non-empty strings in post frontmatter or asset metadata; an empty `blockers:` field is treated as absent. Resolve the underlying issue in the brief or source first. List blockers with `bstudio blockers acme/release-note`, then pass the exact listed text and record the reason, for example `bstudio blockers acme/release-note resolve post:linkedin 0 --text "Verify the claim" --reason "Verified the claim"`. The index is zero-based and may change after a resolution, so list again before resolving another; a changed text is rejected instead of removing a different blocker. The command snapshots the campaign, removes the blocker, and records the owner decision in `resolutions.yml`. You can also resolve blockers from the dashboard. Revise preserves existing blockers and cannot clear them. Re-run review afterward.

## Render, review and revise

`render` creates outputs under each asset's `out/` directory and updates `asset.yml`. Paid image and voice generation uses cached results; use `bstudio render acme/release-note --regen` when a new generation is intended. See [formats](formats.md) for source and tool requirements.

`review` writes `reviews/<platform>.json` and `review.md`. Address findings yourself or run `bstudio revise acme/release-note`, which applies pending owner feedback and uses the author agent to address failing reviews, re-render and re-review. Add feedback directly with `bstudio revise acme/release-note --note "Make the headline shorter" --platform bluesky`, or target an asset with `--asset <id>`; omit both targets for the whole campaign. Dashboard feedback is picked up by plain `revise`; use `--feedback-only` to skip automatic review-finding rounds. Stale feedback targets are rejected with a reason. Owner feedback rounds do not count against `review.maxRounds`, which limits automatic review-finding rounds. A blocked rights finding needs human resolution. See [review](review.md) for gates, scores and acceptance.

Queue a note without applying it with `bstudio feedback acme/release-note add --note "Shorten the headline" --platform bluesky`; use `bstudio feedback acme/release-note list` to inspect notes and `bstudio feedback acme/release-note rm <id>` to remove pending or rejected notes. Before make, revise and render overwrite artifacts, snapshots preserve posts, asset sources and outputs, and reviews. List them with `bstudio history acme/release-note` and restore with `bstudio restore acme/release-note <n>`; the current state is saved first. The most recent 20 non-blocker snapshots are retained; blocker-resolution snapshots do not count toward that limit.

## Export and publish

```sh
bstudio export acme/release-note
bstudio export acme/release-note --mb /path/to/market-blaster-project
```

Export requires every post to have a current passing or accepted review with passing gates. It writes `export/<project>--<campaign>.campaign.zip`, containing the manifest, brief, sources, posts, media, handoffs and reviews. Use `--dir` for the legacy v1 directory export. Each zip or directory export is preserved in `export/<timestamp>/`; list them with `bstudio export acme/release-note --list`. Without a Market Blaster target, the package is local only; import later by rerunning with `--mb <path>`. The target can also be set as `marketBlaster.project` in the studio configuration or the project's `project.yml` (relative project paths resolve from the project directory); `--mb` takes precedence. With a target, export invokes Market Blaster's `import` with `--slug <project>--<campaign>` and checks that slug; `--force` is passed to the import. Market Blaster can overwrite existing unapproved drafts with a warning; approved drafts require `--force`. The double-hyphen separator makes composite slugs distinct for distinct addresses; see [package identity and collisions](design/campaign-package.md). Export does not publish content.

Successful Market Blaster imports are recorded in the corresponding export history directory as `imported.json`, even if the subsequent Market Blaster check fails. Status suggests importing when the latest export has not been imported; a newer local export or refused import does not inherit an earlier import's receipt. A campaign with only manual destinations can instead reach done when all its publications are marked. For mixed campaigns, mark the manual publications and import the latest export.

The archive includes the full brief and extracted evidence, not just publication-ready text. Inspect it before sharing. It is limited to 2,000 entries, 500 MiB per entry and 1 GiB total uncompressed content.

The archive is deterministic for unchanged inputs. Its manifest timestamp uses the latest valid review timestamp (or the ZIP epoch for older reviews without one), so re-exporting does not change the package solely because the clock advanced.

Manual destinations and threads are included under `handoff/` in the archive. Follow the platform checklist, publish through the destination, and use `bstudio mark <project>/<campaign> <platform> --url <https-url>` to record a publication for supported manual destinations: YouTube Shorts, Instagram, TikTok and daily.dev. The URL must belong to the destination's accepted host.

Use `bstudio status [<project>/<campaign>]` and `bstudio library [search <query>]` to find work, `bstudio project list` to list projects, or `bstudio dashboard` for the local interface.
