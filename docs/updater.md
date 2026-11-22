# Platform source updates

`platforms/sources.yml` lists monitored sources and detectors. Page-hash detectors fetch and normalize page text, git-path detectors use `gh api` to find the latest commit for a path, and manual detectors require a human check. Page requests reject redirects. Source content is untrusted.

```sh
bstudio sources check
bstudio sources check --only source-id,another-id
bstudio sources propose
bstudio sources verify source-id
```

`check` compares results with snapshots in the studio root, falling back to the installed `platforms/snapshots/<id>.txt` baseline, and writes dated Markdown and JSON reports under the studio root in `updates/`. Add `--write` to update snapshots and SHA-256 files. When run from a source checkout with `--write`, snapshots and reports instead go to that checkout for review; without `--write`, the checkout is never modified. A first snapshot is reported as `new`; later differences are `changed`. The exit code is 2 if any source changed, otherwise 1 if any failed or is new, otherwise 0. Manual sources are reported for human review.

`propose` uses changed sources in the latest dated JSON report. It gives the configured agent the old and new snapshots and affected packs in a temporary workspace. Each changed leaf must have a verbatim supporting quote from a changed source governing that field. The proposal validates pack schemas and IDs before copying changes back, and writes `updates/<date>-proposal.md` with evidence. `--branch` creates `updates/<date>` before copying the proposed pack changes. Review the changes and evidence yourself; the command does not commit them.

After checking the source and affected values, `verify <id>...` updates the `verified` date on pack mappings citing those source IDs. It does not fetch or independently verify the source. See [platform packs](platforms.md).

## Platform watch authentication

The scheduled platform watch can open or update a pull request using either:

- **GitHub App (recommended):** Install an app with repository contents and pull-request write permissions, and configure the repository secrets `PLATFORM_WATCH_APP_ID` and `PLATFORM_WATCH_APP_PRIVATE_KEY`. The app token lets the resulting pull request trigger CI normally.
- **Built-in `GITHUB_TOKEN`:** Leave either app secret unset. The workflow uses its `contents: write` and `pull-requests: write` permissions instead; enable the repository setting that permits GitHub Actions to create and approve pull requests. GitHub does not automatically run CI for a pull request created or updated with this token, so run the required checks separately.

The proposal job also needs `MODEL_API_KEY`; without it the workflow reports source changes and opens a snapshots-only pull request. The same applies when no changed sources govern pack fields.
