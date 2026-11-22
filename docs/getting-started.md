# Getting started

Blast Studio prepares platform-specific drafts and media for review and handoff. Publishing is a separate step, through Market Blaster or a platform's own interface.

## Install

Use Node.js 22.18 or later. Install from npm:

```sh
npm install -g blast-studio
npx playwright install chromium
```

Alternatively, from a checkout:

```sh
npm install
npx playwright install chromium
npm link
```

Then initialize and check the studio:

```sh
bstudio init
bstudio doctor
```

`init` creates `~/.config/blast-studio/studio.yml` if it does not already exist, and creates the studio root and its `projects` directory. It preserves an existing configuration. The default root is `~/BlastStudio`; set `studio.root` in the configuration or `BSTUDIO_HOME` to choose another location. `BSTUDIO_CONFIG` selects a different configuration file. Keep unpublished projects and credentials private.

`doctor` reports available tools and configuration problems. Its checks require Chromium and Mermaid; Mermaid and HyperFrames are optional npm dependencies installed by default unless optional dependencies are omitted. FFmpeg, HyperFrames, VHS, D2 and Market Blaster support particular media or handoff workflows. Install the tools needed for your formats. The default author and reviewer commands use `omp`; configure `agent.command` and `reviewer.command` if you use other commands. Use a different reviewer model: identical commands or explicitly identical `--model`/`-m` values are rejected. `bstudio install-skills` links the bundled skills into `~/.agents/skills` and `~/.claude/skills`; add `--with-hyperframes` to install HyperFrames skills too.

## Configure the studio

Edit the generated configuration to describe your brand and choose platforms. The initial list is `devto`, `linkedin`, `x`, `bluesky`, `mastodon`, `hn`, `reddit`, and `github-discussion`. Platform packs determine which destinations allow drafts or only outlines; destinations that prohibit generated text are excluded from plans.

Image and voice providers default to `none`. The default zero monthly budget disables reserved API calls, but does not cap separately billed agent subscriptions or interactive OMP image generation. For API generation, configure the provider, supply its credentials privately (for example in the studio root's `.env`), and set a monthly cap with `bstudio budget set 10`. `bstudio budget set-project 5` sets an optional lifetime per-project cap; zero means no per-project cap. Check `bstudio budget show` before generation, and check provider invoices: logged totals can omit separately billed usage.

Selected API providers receive image prompts or voice text. `providers.allowUpload` defaults to `false`, but is not a general network or privacy switch; reference-image uploads are currently unsupported even when it is enabled. Authoring and review agents can also send project content to their model providers. Agents run without OS sandbox restrictions by default; see [configuration](configuration.md#agent-isolation) before processing sensitive or untrusted material.

## Make a first campaign

```sh
bstudio project new acme
bstudio new acme/launch-note --idea "Explain the new release" --note "It is available today."
```

Project and campaign slugs use lowercase letters, numbers and single hyphens. `new` runs brief, plan, make, render and review in order; if a stage fails, it prints a command for resuming. Inspect the resulting files under `~/BlastStudio/projects/acme/campaigns/launch-note/`, or under your configured root. Review the evidence, drafts, media and findings before export. See [workflow](workflow.md), [formats](formats.md), and [review](review.md) for the individual stages and their limits.
