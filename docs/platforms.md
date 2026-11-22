# Platform packs

Each directory under `platforms/` contains a `pack.yml` and a `guide.md`. Packs describe formats, media limits, disclosure rules, AI policy, and review criteria. Values with a source identify an entry in `platforms/sources.yml`; `unknown` means the pack does not assert a verified value. The loader validates packs against `schemas/pack.schema.json` and checks their source IDs. Consult the guide and the destination's current rules before publishing.

`draft` allows generated drafts. `outline` limits the plan to text talking points with no generated assets, even when the pack lists other destination formats. `none` excludes the platform from generated plans. Formats below describe the destination pack, not a promise that every format can be generated under its AI policy.

| Platform and guide | AI policy | Pack formats | Market Blaster |
| --- | --- | --- | --- |
| [Bluesky](platforms/bluesky/guide.md) | draft | text, thread, image, video | bluesky |
| [daily.dev](platforms/dailydev/guide.md) | outline | text, article | manual |
| [DEV](platforms/devto/guide.md) | draft | article, image | devto |
| [Gist](platforms/gist/guide.md) | draft | article, diagram | gist |
| [GitHub Discussion](platforms/github-discussion/guide.md) | draft | article, image | github-discussion |
| [Hashnode](platforms/hashnode/guide.md) | draft | article, image | hashnode |
| [Hacker News](platforms/hn/guide.md) | none | text | hn |
| [Instagram](platforms/instagram/guide.md) | draft | video, carousel, image | manual |
| [Lemmy](platforms/lemmy/guide.md) | outline | text, image | lemmy |
| [LinkedIn](platforms/linkedin/guide.md) | draft | text, image, carousel, video | linkedin |
| [Mastodon](platforms/mastodon/guide.md) | draft | text, image, video | mastodon |
| [Medium](platforms/medium/guide.md) | draft | article, image | medium |
| [Newsletter](platforms/newsletter/guide.md) | outline | article, image | newsletter |
| [Product Hunt](platforms/producthunt/guide.md) | outline | text, image, video | producthunt |
| [Reddit](platforms/reddit/guide.md) | outline | text, image | reddit |
| [Substack](platforms/substack/guide.md) | draft | article, image | substack |
| [Threads](platforms/threads/guide.md) | draft | text, image, carousel, video | threads |
| [TikTok](platforms/tiktok/guide.md) | draft | video | manual |
| [X](platforms/x/guide.md) | draft | text, thread, image, video | x |
| [YouTube Shorts](platforms/youtube-shorts/guide.md) | draft | video | manual |

Select IDs in [`studio.yml`](configuration.md). After manually publishing on a manual destination, use `bstudio mark <slug> <platform> --url <https-url>` to record the link. See [source updates](updater.md) for maintaining packs.
