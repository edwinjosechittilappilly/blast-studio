# Dashboard

Run `bstudio dashboard` and open the printed URL. The default port is 4848; use `bstudio dashboard --port 5000` to choose another. The server binds to `127.0.0.1` only. Stop the process to close it.

The printed URL contains a one-use token. Opening it exchanges the token for an HttpOnly, SameSite=Strict session cookie and redirects to the dashboard. Keep the URL private. Sessions last 12 hours with activity extending the expiry and survive server restarts. The signing key is stored in `<studio root>/.dashboard-key` with owner-only permissions; deleting it invalidates existing sessions.

The projects view searches the library and opens tabbed project details. The Overview summarizes review and publishing status; destination tabs show posts, media and review comparisons; Assets collects the project's files. Use View for a full-size preview and Download, or copy post text, titles, hooks and alt text for manual posting. The settings view shows month-to-date and provider spend and lets you change budget caps and image and voice provider selections. The sources view shows the latest reported changes, failures, and unverified sources. These settings are saved to `studio.yml`; other configuration remains a file edit.

Project details compare the independent review, weighted rubric, gates and hook checks with the maker's self-review. Add feedback to a post or asset with **Your feedback**; its pending, applied and rejected history stays in the project's `feedback.yml`. **Apply feedback** starts `bstudio revise <slug> --feedback-only` and displays its status and recent log output. Only one revision can run per project at a time. The ten most recent revision logs are kept in the project's `logs` directory. Revision invokes the normal CLI workflow and may call configured agents and providers.
 
For dashboard development, run `npm run build:ui` to build the local Carbon assets, or run `npm run dev:ui` alongside the dashboard to rebuild them on changes.

The dashboard serves project media from the studio root and checks resolved paths to prevent traversal outside the project. Video supports byte ranges. It is a local interface, not a publishing service. Use the [CLI](commands.md) for generation, review, export, and source checks.
