# Dashboard

Run `bstudio dashboard` and open the printed URL. In a source checkout, run `npm install` and `npm run build:ui` first. The default port is 4848; use `bstudio dashboard --port 5000` to choose another. The server binds to `127.0.0.1` only. Stop the process to close it.

The printed URL contains a one-use token. Opening it exchanges the token for an HttpOnly, SameSite=Strict session cookie and redirects to the dashboard. Keep the URL private. Sessions last 12 hours with activity extending the expiry and survive server restarts. The signing key is stored in `<studio root>/.dashboard-key` with owner-only permissions. To invalidate existing sessions, stop all dashboard instances, delete the key, and restart the dashboard.

Use **New** in the header to create a project with shared evidence. Select a project in the library and choose **New campaign** to create its brief or run the full pipeline. The library supports search and sorting. Campaign tabs show the overview, destination posts and reviews, assets, actions, and export. Asset blockers appear on the overview and Assets tab. Use View for media previews and copy controls for post text, hooks, alt text and commands.

The Actions tab starts campaign steps, review decisions, feedback operations and history or restore jobs. Paid steps request confirmation with the available budget information. The Export tab supports local export, a Market Blaster path, confirmed force re-import, and export history downloads. Long-running jobs show status and logs; running jobs can be cancelled. The header jobs panel lists jobs across campaigns. Operations requiring an interactive terminal offer a copyable command instead of starting a dashboard job.

Campaign details compare the independent review, weighted rubric, gates and hook checks with the maker's self-review. Add feedback to a post or asset with **Your feedback**; its pending, applied and rejected history stays in the campaign's `feedback.yml`. **Apply feedback** starts a registered `bstudio revise <project>/<campaign> --feedback-only` job. Jobs for the same campaign share a lock with CLI operations. The CLI and dashboard automatically recover job locks whose owners have stopped; active jobs continue to hold their locks.

**Budget & providers** displays spend and manages caps, providers, upload consent and write-only provider keys in macOS Keychain. **Source updates** checks and verifies guidance; **Health check** runs the local doctor. Configuration settings are saved to `studio.yml`.

## Dashboard API

Requests require the dashboard session cookie. Writes also require an `Origin` matching the dashboard's exact host and port and `X-Requested-With: bstudio`.

- `GET /api/operations?campaign=project%2Fcampaign` returns an object keyed by operation name. Each entry has `fields` (argument schemas with `kind`, `required`, `positional`, `flag`, and `multiple` where applicable), `campaign`, `paid`, `step`, and `requiresTTY`. Supply a campaign to include its illustration assets in the terminal policy; without one, campaign-specific requirements are not reported. With the omp image provider, `make`, `render`, and `revise` require a terminal when the campaign plan contains an illustration; a missing plan has no existing illustration assets. `new` always requires a terminal with omp because it creates its plan during the job.
- `POST /api/jobs` accepts `{ "op": "revise", "campaign": "project/campaign", "args": { "feedbackOnly": true } }`; omit `campaign` for global operations. It returns the job record with status 202. Operations requiring a terminal return 422 with a `command` instead.
- `GET /api/jobs?campaign=project%2Fcampaign` returns job records, optionally filtered by campaign. `GET /api/jobs/:id` returns one record.
- `GET /api/jobs/:id/log?tail=100` returns `{ "log": "..." }`; `tail` optionally limits the number of lines.
- `POST /api/jobs/:id/cancel` requests cancellation and returns the job record.

Job records include `id`, `operation`, optional `campaign`, `state`, timestamps, `command`, and process or exit information when available. A campaign lock conflict returns 409; unknown jobs return 404.

`GET /api/library` returns campaign entries including `updatedAt`, `pendingFeedback`, `exported`, and `published`. `GET /api/project/:campaign` returns campaign details; `platforms` is keyed by platform ID and contains `name`, `textLimit`, `titleLimit`, and `threadItemLimit`. Limits are sourced values or `unknown`.
 
For dashboard development, run `npm run build:ui` to build the local Carbon assets, or run `npm run dev:ui` alongside the dashboard to rebuild them on changes.

The dashboard serves project media from the studio root and checks resolved paths to prevent traversal outside the project. Video supports byte ranges. It is a local interface, not a publishing service; see the [CLI reference](commands.md) for command details.
