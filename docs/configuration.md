# Configuration

`bstudio init` creates `~/.config/blast-studio/studio.yml` without overwriting an existing file. `BSTUDIO_CONFIG` overrides that path. `studio.root` defaults to `~/BlastStudio`; `BSTUDIO_HOME` overrides it. Relative paths resolve against the current working directory. The root contains projects, the spend ledger, and an optional `.env` file. Keep unpublished work and credentials private.

| Key | Default | Purpose |
| --- | --- | --- |
| `studio.root` | `~/BlastStudio` | Private studio directory. |
| `brand.name` | `My brand` | Brand name passed to the authoring agent. |
| `brand.pitch`, `brand.audience` | empty strings in initial config | Brand context. |
| `brand.voice` | `[]` | Voice guidance. |
| `brand.colors` | ink `#1a1a1a`, paper `#ffffff`, accent `#315efb`, accent2 `#ed7458` | Brand colors. |
| `brand.fonts` | display and text `sans-serif`, mono `monospace` | Brand fonts. |
| `brand.links` | `{}` | Brand links. |
| `platforms` | `devto`, `linkedin`, `x`, `bluesky`, `mastodon`, `hn`, `reddit`, `github-discussion` | Enabled platform IDs; see [packs](platforms.md). |
| `agent.command` | `[omp, -p]` | Authoring command and arguments. |
| `agent.timeoutSeconds` | `900` | Authoring timeout. |
| `agent.passEnv` | `[]` | Extra environment variable names passed to the agent (a warning is printed). `OPENAI_API_KEY` and `GEMINI_API_KEY` are allowed only for a role with `billing: api`; publishing keys, `GITHUB_TOKEN` and `GH_TOKEN` are always refused. |
| `agent.sandbox` | `off` | Set to `on` to isolate agents and render tools with the OS sandbox (`sandbox-exec` on macOS, `bwrap` on Linux when usable); `off` runs them locally as your user. |
| `agent.billing` | `subscription` | `subscription` (the CLI's own login; runs are logged at $0) or `api` (each run reserves `maxUsdPerRun` from the budget and settles reported usage). |
| `agent.maxUsdPerRun` | unset | Required when `billing: api`; the per-run reservation. |
| `reviewer.command` | `[omp, -p, --model, '@review']` | Reviewer command and arguments; `null` disables the agent reviewer. Use a different model than the maker ([review](review.md)). |
| `reviewer.timeoutSeconds` | `900` | Reviewer timeout. |
| `reviewer.billing`, `reviewer.maxUsdPerRun` | `subscription`, unset | Same as the agent settings. |
| `review.threshold` | `75` | Editorial passing score from 0 to 100. |
| `review.maxRounds` | `2` | Maximum revision rounds. |
| `images.provider` | `none` | `none`, `gemini`, `openai`, or `omp`. |
| `images.model` | provider default | Optional image model. |
| `voice.provider` | `none` | `none` or `openai`. |
| `voice.model`, `voice.voice` | provider defaults | Optional speech model and voice. |
| `budget.monthlyUsd` | `0` | Monthly cap; zero disables paid calls. |
| `budget.perProjectUsd` | `0` | Per-project cap; zero means no additional project limit. |
| `providers.allowUpload` | `false` | Consent to uploads to external providers. |
| `grounding.waive` | `[]` | Evidence grounding waivers as strings. |
| `marketBlaster.command` | `[mblast]` | Market Blaster executable and arguments. |
| `marketBlaster.project` | unset | Default Market Blaster project directory for import. |

Commands must be nonempty arrays of strings. Numeric settings must be finite and non-negative; the review threshold cannot exceed 100. `agent.passEnv` entries must be valid environment variable names.

Provider credentials can be set in the shell or `<studio.root>/.env`; a nonempty shell value takes precedence. On macOS, the keychain is also consulted for `GEMINI_API_KEY` and `OPENAI_API_KEY` if neither is set. Provider selection, consent, and a positive monthly budget are separate settings. See [budget](budget.md).

## Agent isolation

The maker and reviewer use temporary workspaces and an allowlisted environment with the real `HOME`, whether or not the sandbox is enabled. By default, `agent.sandbox: off` runs agents and render tools as your user without OS filesystem or network restrictions. Agent-written tapes and scripts execute as you, and prompt-injected inputs can access credentials and other files available to your account. Enable `agent.sandbox: on` to add the boundaries below.

With the sandbox on, it denies reading the studio root and other home files by default. It permits reads of `~/.omp`, `~/.claude`, `~/.codex`, `~/.config/omp`, `~/.local/bin`, `~/.local/share`, `~/.nvm` and `~/.npm-global`, as well as files outside the home directory. On macOS, home file metadata remains visible for path resolution.

Writes are limited to the workspace and temporary directory, device streams `/dev/null`, `/dev/tty` and `/dev/fd/*`, plus `~/.omp/agent/sessions` and the OMP agent, history, models and skill-descriptions SQLite database files (including WAL and shared-memory files). OMP settings, hooks, instructions and skills, Claude and Codex configuration, and browser caches are not writable.

With the sandbox on, VHS, HyperFrames, Mermaid, D2 and the Python diagram tool use a separate sandbox denying external IP network access. They always use a minimal environment, including when the sandbox is off. On macOS, Unix sockets remain available, and VHS and HyperFrames may use loopback because they run local terminal and preview servers; an untrusted tape could contact other local services. VHS may also write to `/dev/ptmx` and `/dev/ttys[0-9]*` for its pseudoterminal. On Linux, bubblewrap provides loopback in a separate network namespace. The asset output and temporary directories (including Chromium's temporary socket directories) are writable. The studio root is hidden except for the asset being rendered. Rendering can read the installed Blast Studio package, its ancestor `package.json` files, and the local Playwright Chromium installation.

HyperFrames can read its managed cache (`~/.cache/hyperframes`, or `HYPERFRAMES_CACHE_DIR`) and `~/.cache/puppeteer` to find an installed browser. With sandboxing on, browser files are read-only; the managed cache's `locks` directory remains writable so concurrent renders can coordinate.

- **Keychain stays reachable.** The sandbox blocks file paths, not macOS Keychain services, because agent CLIs authenticate through it. A Keychain item you allow for "always" (including the `blast-studio` service) can be read by any process running as you. Click "Allow" (once) rather than "Always Allow" for Blast Studio items if that matters to you.
- **Agent network access remains enabled** for model API calls. Files outside the home directory are not generally hidden.
- **Linux without usable `bwrap`** runs with a warning and only the workspace and environment boundaries; rendering tools then also lack OS network isolation.
