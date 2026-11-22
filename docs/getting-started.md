# Getting started

Blast Studio prepares platform-specific drafts and media for review and handoff. Publishing is a separate step, through Market Blaster or a platform's own interface.

## Install

From a checkout, use Node.js 22.18 or later:

```sh
npm install
npx playwright install chromium
npm link
bstudio init
bstudio doctor
```

`npm link` puts `bstudio` on your path. `init` creates `~/.config/blast-studio/studio.yml` if it does not already exist, and creates the studio root and its `projects` directory. It preserves an existing configuration. The default root is `~/BlastStudio`; set `studio.root` in the configuration or `BSTUDIO_HOME` to choose another location. `BSTUDIO_CONFIG` selects a different configuration file. Keep unpublished projects and credentials private.

`doctor` reports available tools and configuration problems. Chromium and Mermaid are required by its checks; FFmpeg, HyperFrames, VHS, D2 and Market Blaster support particular media or handoff workflows. Install the tools needed for your formats. The default author and reviewer commands use `omp`; configure `agent.command` and `reviewer.command` if you use other commands. The reviewer must be distinct from the author. `bstudio install-skills` links the bundled skills into `~/.agents/skills` and `~/.claude/skills`; add `--with-hyperframes` to install HyperFrames skills too.

## Configure the studio

Edit the generated configuration to describe your brand and choose platforms. The initial list is `devto`, `linkedin`, `x`, `bluesky`, `mastodon`, `hn`, `reddit`, and `github-discussion`. Platform packs determine which destinations allow drafts or only outlines; destinations that prohibit generated text are excluded from plans.

Image and voice providers default to `none`. Paid calls are disabled by the default zero monthly budget. If you choose a paid provider, supply its credentials privately, for example in the studio root's `.env`, and set a monthly cap with `bstudio budget set 10`. `bstudio budget set-project 5` sets an optional per-project cap; zero means no per-project cap. Uploads to external providers default to disabled. Check `bstudio budget show` before generation.

## Make a first project

```sh
bstudio new launch-note --idea "Explain the new release" --note "It is available today."
```

The slug uses lowercase letters, numbers and single hyphens. `new` runs brief, plan, make, render and review in order; if a stage fails, it prints a command for resuming. Inspect the resulting files under `~/BlastStudio/projects/launch-note/`, or under your configured root. Review the evidence, drafts, media and findings before export. See [workflow](workflow.md), [formats](formats.md), and [review](review.md) for the individual stages and their limits.
