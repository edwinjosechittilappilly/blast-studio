# Dashboard

Run `bstudio dashboard` and open the printed URL. In a source checkout, run `npm install` and `npm run build:ui` first. The default port is 4848; use `bstudio dashboard --port 5000` to choose another. The server binds to `127.0.0.1` only. Stop the process to close it.

The printed URL contains a one-use token. Opening it exchanges the token for an HttpOnly, SameSite=Strict session cookie and redirects to the dashboard. Keep the URL private. Sessions last 12 hours with activity extending the expiry and survive server restarts. The signing key is stored in `<studio root>/.dashboard-key` with owner-only permissions. To invalidate existing sessions, stop all dashboard instances, delete the key, and restart the dashboard.

The projects view searches the library and opens tabbed project details. The Overview summarizes review and publishing status; destination tabs show posts, media and review comparisons; Assets collects the project's files. Use View for full-size image or video previews, or open a PDF in a new tab; all media can be downloaded. Copy post text, individual thread posts, titles, hooks and alt text for manual posting. The settings view shows month-to-date and provider spend and lets you change budget caps and image and voice provider selections. The sources view shows the latest reported changes, failures, and unverified sources. These settings are saved to `studio.yml`; other configuration remains a file edit.

Campaign details compare the independent review, weighted rubric, gates and hook checks with the maker's self-review. Add feedback to a post or asset with **Your feedback**; its pending, applied and rejected history stays in the campaign's `feedback.yml`. **Apply feedback** starts a registered `bstudio revise <project>/<campaign> --feedback-only` job. Jobs for the same campaign share a lock with CLI operations. If a lock is stale, confirm that its owner and children have stopped before removing `.bstudio-job.lock` from the campaign directory.

## Dashboard API

Requests require the dashboard session cookie. Writes also require an `Origin` matching the dashboard's exact host and port and `X-Requested-With: bstudio`.

- `GET /api/operations` returns an object keyed by operation name. Each entry has `fields` (argument schemas with `kind`, `required`, `positional`, `flag`, and `multiple` where applicable), `campaign`, `paid`, `step`, and `requiresTTY`.
- `POST /api/jobs` accepts `{ "op": "revise", "campaign": "project/campaign", "args": { "feedbackOnly": true } }`; omit `campaign` for global operations. It returns the job record with status 202. Operations requiring a terminal return 422 with a `command` instead.
- `GET /api/jobs?campaign=project%2Fcampaign` returns job records, optionally filtered by campaign. `GET /api/jobs/:id` returns one record.
- `GET /api/jobs/:id/log?tail=100` returns `{ "log": "..." }`; `tail` optionally limits the number of lines.
- `POST /api/jobs/:id/cancel` requests cancellation and returns the job record.

Job records include `id`, `operation`, optional `campaign`, `state`, timestamps, `command`, and process or exit information when available. A campaign lock conflict returns 409; unknown jobs return 404.

`GET /api/library` returns campaign entries including `updatedAt`, `pendingFeedback`, `exported`, and `published`. `GET /api/project/:campaign` returns campaign details; `platforms` is keyed by platform ID and contains `name`, `textLimit`, `titleLimit`, and `threadItemLimit`. Limits are sourced values or `unknown`.
 
For dashboard development, run `npm run build:ui` to build the local Carbon assets, or run `npm run dev:ui` alongside the dashboard to rebuild them on changes.

The dashboard serves project media from the studio root and checks resolved paths to prevent traversal outside the project. Video supports byte ranges. It is a local interface, not a publishing service. Use the [CLI](commands.md) for generation, review, export, and source checks.
