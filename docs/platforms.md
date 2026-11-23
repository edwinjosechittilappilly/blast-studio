# Platform packs

Each directory under `platforms/` contains a `pack.yml` and a `guide.md`. Packs describe formats, media limits, disclosure rules, AI policy, and review criteria. Values with a source identify an entry in `platforms/sources.yml`; `unknown` means the pack does not assert a verified value. The loader validates packs against `schemas/pack.schema.json` and checks their source IDs. Consult the guide and the destination's current rules before publishing.

`draft` allows generated drafts. `outline` limits the plan to text talking points with no generated assets, even when the pack lists other destination formats. `none` excludes the platform from generated plans. Formats below describe the destination pack, not a promise that every format can be generated under its AI policy.

Pack fields worth knowing:

- **`aiSource`** names the `sources.yml` entry behind the `ai` policy. It is unset where no official policy page exists (Mastodon today); review then warns that the policy source is unknown.
- **`verified` / `lastVerified`** on sourced values are written by `bstudio sources verify`. Review warns when a policy or disclosure value has no `lastVerified` or one older than 90 days.
- **`disclosure`** covers AI-generated text, media and voice. A rule may list **`accepts`**: the exact labels a post must use (DEV's AI-assistance tiers, for example).
- **`sponsorship`** holds paid-partnership rules, kept apart from AI disclosure. It applies only to posts with `sponsored: true` in their frontmatter.
- **`accessibility`** overrides the review thresholds: `minFontPx`, `minContrast` (4.5 by default), `minContrastLarge` (3 by default, WCAG large text) and `largeTextPx`.
- **`safeZones`** gives sourced per-edge frame fractions for video or image overlays; unknown or omitted zones use a 5% inset. The YouTube and Instagram zones are conservative 9:16 ad guidance, not guarantees for every organic surface. Shared outputs use the strictest applicable insets; video timelines are sampled when seekable, and VHS text is not measured.

The Market Blaster column describes the pack's default route. An owner can
override an individual post to manual delivery with `delivery: manual` in
its frontmatter. Omission uses the pack route; `marketBlaster` selects that
route for supported packs. Other values are invalid and can be repaired with
`bstudio delivery <project>/<campaign> <platform> manual|marketBlaster`.

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

Select IDs in [`studio.yml`](configuration.md). After manually publishing a manual or owner-overridden post, use `bstudio mark <project>/<campaign> <platform> --url <https-url>` to record its publication URL. URLs must use HTTPS without credentials. Fixed-domain platforms require an allowed host; Mastodon, Lemmy, newsletter, Hashnode, Medium and Substack accept any host for federated instances or custom domains. See [source updates](updater.md) for maintaining packs.
