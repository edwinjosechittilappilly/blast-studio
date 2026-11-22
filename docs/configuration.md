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
| `agent.passEnv` | `[]` | Additional environment variable names passed to the agent. |
| `reviewer.command` | `[omp, -p, --model, '@review']` | Reviewer command and arguments; `null` disables the agent reviewer. |
| `reviewer.timeoutSeconds` | `900` | Reviewer timeout. |
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
