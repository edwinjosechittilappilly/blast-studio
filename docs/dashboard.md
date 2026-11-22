# Dashboard

Run `bstudio dashboard` and open the printed URL. The default port is 4848; use `bstudio dashboard --port 5000` to choose another. The server binds to `127.0.0.1` only. Stop the process to close it.

The printed URL contains a one-use token. Opening it exchanges the token for an HttpOnly, SameSite=Strict session cookie and redirects to the dashboard. Keep the URL private. A new server process creates a new token and session.

The projects view searches the library and opens project details, including posts, review scores, and previews of available assets. The settings view shows month-to-date and provider spend and lets you change budget caps and image and voice provider selections. The sources view shows the latest reported changes, failures, and unverified sources. These settings are saved to `studio.yml`; other configuration remains a file edit.

The dashboard serves project media from the studio root and checks resolved paths to prevent traversal outside the project. Video supports byte ranges. It is a local interface, not a publishing service. Use the [CLI](commands.md) for generation, review, export, and source checks.
