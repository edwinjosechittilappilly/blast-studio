# Configuration

`bstudio init` creates `~/.config/blast-studio/studio.yml` without overwriting an existing file. `BSTUDIO_CONFIG` overrides that path. `studio.root` defaults to `~/BlastStudio`; `BSTUDIO_HOME` overrides it. Relative paths resolve against the current working directory; `~` expansion applies to the studio root, not `BSTUDIO_CONFIG`. The root contains projects, provider caches, the spend ledger, and an optional `.env` file. Keep unpublished work and credentials private.

## Project storage and migration

Projects live at `projects/<project>/`, with `project.yml` metadata, shared `evidence/`, and independent campaigns under `campaigns/<campaign>/`. Use `bstudio project new acme --repo owner/repo --url https://example.com --note "Context"` to collect reusable evidence, and `bstudio project list` to list projects. Campaign commands use addresses such as `acme/launch`.

On startup, a legacy `projects/<slug>/brief.md` project is migrated to `projects/<slug>/campaigns/<slug>/`, including unknown files. Back up the studio before upgrading. Migration records its progress in `.bstudio-migration.json` and resumes on the next run after an interruption. If a destination or metadata conflict is reported, preserve both copies, resolve the indicated paths manually, and retry; do not remove the journal while recovery is pending.

Historical ledger entries remain attributed to the migrated `<slug>/<slug>` campaign for spending limits; newly recorded costs use the full campaign address.

| Key | Default | Purpose |
| --- | --- | --- |
| `studio.root` | `~/BlastStudio` | Private studio directory. |
| `brand.name` | `My brand` | Brand name passed to the authoring agent. |
| `brand.pitch`, `brand.audience` | empty strings in generated config | Brand context; omitted if absent from the file. |
| `brand.voice` | `[]` in generated config | Voice guidance. |
| `brand.colors` | ink `#1a1a1a`, paper `#ffffff`, accent `#315efb`, accent2 `#ed7458` in generated config | Brand colors. |
| `brand.fonts` | display and text `sans-serif`, mono `monospace` in generated config | Brand fonts. |
| `brand.links` | `{}` in generated config | Brand links. |
| `platforms` | `devto`, `linkedin`, `x`, `bluesky`, `mastodon`, `hn`, `reddit`, `github-discussion` | Enabled platform IDs; see [packs](platforms.md). |
| `agent.command` | `[omp, -p]` | Authoring command and arguments. |
| `agent.timeoutSeconds` | `900` | Authoring timeout. |
| `agent.passEnv` | `[]` | Extra shell environment variable names passed to the maker and reviewer (a warning is printed for values passed). `OPENAI_API_KEY` and `GEMINI_API_KEY` are allowed only for a role with `billing: api`; publishing keys, `GITHUB_TOKEN`, `GH_TOKEN`, `PATH`, `HOME` and `TMPDIR` are refused. |
| `agent.sandbox` | `off` | `on` or `off`. `on` uses the OS sandbox (`sandbox-exec` on macOS, `bwrap` on Linux when usable); `off` runs agents and render tools locally as your user. |
| `agent.billing` | `subscription` | `subscription` records agent runs with unknown cost; `api` reserves `maxUsdPerRun` and settles reported usage, retaining the reservation amount when no cost is reported. |
| `agent.maxUsdPerRun` | unset | A finite positive USD amount, required when `billing: api`; the per-run reservation. |
| `reviewer.command` | `[omp, -p, --model, '@review']` | Reviewer command and arguments; `null` disables the agent reviewer. Use a different model than the maker ([review](review.md)). |
| `reviewer.timeoutSeconds` | `900` | Reviewer timeout. |
| `reviewer.billing`, `reviewer.maxUsdPerRun` | `subscription`, unset | Same as the agent settings. |
| `review.threshold` | `75` | Editorial passing score from 0 to 100. |
| `review.maxRounds` | `2` | Maximum revision rounds. |
| `images.provider` | `none` | `none`, `gemini`, `openai`, or `omp`. |
| `images.model` | `gemini-nano-banana-2.1` for Gemini, `gpt-image-2` for OpenAI, `omp` for OMP | Optional model; API models need a matching image price in `providers/prices.yml`. |
| `voice.provider` | `none` | `none` or `openai`. |
| `voice.model`, `voice.voice` | `tts-1`, `alloy` | Optional speech model and voice; the model needs a matching voice price in `providers/prices.yml`. |
| `budget.monthlyUsd` | `0` | Monthly cap for reserved API calls; zero disables them, not separately billed subscription or OMP usage. |
| `budget.perProjectUsd` | `0` | Lifetime per-project cap; zero means no additional project limit. |
| `providers.allowUpload` | `false` | Reference-image upload consent flag. Reference-image uploads are not supported by the current adapter even when enabled; this flag does not prevent text prompts being sent to selected providers. |
| `grounding.waive` | `[]` | Strings whose numeric metrics are waived from the fabricated-metrics grounding check. |
| `marketBlaster.command` | `[mblast]` | Market Blaster executable and arguments. |
| `marketBlaster.project` | unset | Default Market Blaster project directory for import. |

Commands must be nonempty arrays of nonempty strings, except that `reviewer.command` also accepts `null`. Numeric settings must be finite and non-negative, except `maxUsdPerRun`, which must be positive when specified; the review threshold cannot exceed 100. `agent.passEnv` entries must be valid environment variable names. Brand fields other than `name` are populated by the generated configuration, not supplied as load-time defaults if removed.

Provider credentials can be set in the shell or `<studio.root>/.env`; a nonempty shell value takes precedence. On macOS, the keychain is also consulted for `GEMINI_API_KEY` and `OPENAI_API_KEY` if neither is set. API image and voice generation sends prompts or text to the selected provider and requires a positive monthly budget and a priced model. OMP image generation requires an interactive terminal outside CI and asks for the path to an image generated separately; it is not constrained by the API budget. See [budget](budget.md).

## Agent isolation

The maker and reviewer use temporary workspaces and an allowlisted environment with the real `HOME`, whether or not the sandbox is enabled. By default, `agent.sandbox: off` runs agents and render tools as your user without OS filesystem or network restrictions. Agent-written tapes and scripts execute as you, and prompt-injected inputs can access credentials and other files available to your account. Enable `agent.sandbox: on` to add the boundaries below.

With the sandbox on, it denies reading the studio root and other home files by default. It permits reads of `~/.omp`, `~/.claude`, `~/.codex`, `~/.config/omp`, `~/.local/bin`, `~/.local/share`, `~/.nvm` and `~/.npm-global`, as well as files outside the home directory. On macOS, home file metadata remains visible for path resolution.

Writes are limited to the workspace and temporary directory, device streams `/dev/null`, `/dev/tty` and `/dev/fd/*`, plus `~/.omp/agent/sessions` and the OMP agent, history, models and skill-descriptions SQLite database files (including WAL and shared-memory files). OMP settings, hooks, instructions and skills, Claude and Codex configuration, and browser caches are not writable.

With the sandbox on, VHS, HyperFrames, Mermaid, D2 and the Python diagram tool use a separate sandbox denying external IP network access. They always use a minimal environment, including when the sandbox is off. On macOS, Unix sockets remain available, and VHS and HyperFrames may use loopback because they run local terminal and preview servers; an untrusted tape could contact other local services. VHS may also write to `/dev/ptmx` and `/dev/ttys[0-9]*` for its pseudoterminal. On Linux, bubblewrap provides loopback in a separate network namespace. The asset output and temporary directories (including Chromium's temporary socket directories) are writable. The studio root is hidden except for the asset being rendered. Rendering can read the installed Blast Studio package, its ancestor `package.json` files, and the local Playwright Chromium installation.

HyperFrames can read its managed cache (`~/.cache/hyperframes`, or `HYPERFRAMES_CACHE_DIR`) and `~/.cache/puppeteer` to find an installed browser. With sandboxing on, browser files are read-only; the managed cache's `locks` directory remains writable so concurrent renders can coordinate. On Linux with bubblewrap, the managed cache is mounted under a private sandbox root so HyperFrames can validate the browser without relying on unmapped host-root owners.

- **Keychain stays reachable.** The sandbox blocks file paths, not macOS Keychain services, because agent CLIs authenticate through it. A Keychain item you allow for "always" (including the `blast-studio` service) can be read by any process running as you. Click "Allow" (once) rather than "Always Allow" for Blast Studio items if that matters to you.
- **Agent network access remains enabled** for model API calls. Files outside the home directory are not generally hidden.
- **Linux without usable `bwrap`** runs with a warning and only the workspace and environment boundaries; rendering tools then also lack OS network isolation.
