# Campaign package v2 (`<project>--<campaign>.campaign.zip`)

One zip holds one whole campaign: where to publish, what to publish, the sources behind it, and the review results.
`bstudio export <project>/<campaign>` writes it, and `mblast import <file.zip>` reads it. Manifest v1 (an unzipped export
directory, selected with `--dir`) is still accepted by `mblast import <dir>`.

## Identity and collisions

Both the v1 manifest and v2 `campaign.json` carry top-level `project` and `campaign` fields for the original address and a `slug` formed as `<project>--<campaign>`. For example, `acme/media-launch` has `project: "acme"`, `campaign: "media-launch"`, and `slug: "acme--media-launch"`. The zip is named `acme--media-launch.campaign.zip`. When Studio invokes Market Blaster, it passes this composite slug as `--slug` to import and uses it for the subsequent check.

Individual project and campaign slugs cannot contain consecutive hyphens, so the `--` separator unambiguously identifies the boundary: distinct addresses produce distinct composite slugs. Market Blaster can overwrite existing unapproved drafts with a warning; approved drafts require `--force`. Inspect the target before importing.

## Layout

```text
<project>--<campaign>.campaign.zip
├── campaign.json            manifest v2 (below)
├── brief.md                 the Studio brief with ## [E<n>] anchors
├── sources/
│   ├── sources.json         [{anchor, title, status, url?}]
│   └── E<n>.md              text of each source, as captured for the brief
├── posts/<destination>.md   one post per Market Blaster destination (frontmatter: title, tags, evidence, disclosure, media, studio)
├── media/<file>             every image, video, PDF and VTT the posts reference
├── handoff/
│   ├── <destination>-thread.md        thread items to post by hand
│   └── <platform>/                    manual destinations, including owner overrides
│       ├── post.md
│       ├── <media files>
│       └── README.md                  upload checklist and disclosure lines from the platform pack
└── review/
    ├── <platform>.json
    └── review.md
```

## `campaign.json`

```json
{
  "version": 2,
  "kind": "blast-studio-campaign",
  "project": "acme",
  "campaign": "media-launch",
  "slug": "acme--media-launch",
  "title": "Market Blaster now attaches images and video",
  "generatedAt": "2026-11-22T08:00:00.000Z",
  "generator": { "name": "blast-studio", "version": "0.1.0" },
  "canonicalHome": "devto",
  "sources": [{ "anchor": "E1", "title": "Idea", "status": "claim", "url": null }],
  "destinations": [
    {
      "id": "linkedin",
      "mode": "api",
      "aiPolicy": "draft",
      "post": "posts/linkedin.md",
      "media": [{ "path": "media/carousel.pdf", "alt": "…", "kind": "document" }],
      "thread": null,
      "review": { "verdict": "pass", "total": 86, "reviewHash": "<sha256>" }
    }
  ],
  "manual": [
    { "platform": "youtube-shorts", "folder": "handoff/youtube-shorts/", "review": { "verdict": "pass", "total": 80 } }
  ]
}
```

| Field | Notes |
|---|---|
| `project`, `campaign` | Original components of the Studio campaign address; also present in the v1 manifest |
| `slug` | Composite `<project>--<campaign>` Market Blaster identity |
| `destinations[].mode` | `api` or `handoff`, as decided by the Market Blaster mapping table in [the design](blast-studio.md) |
| `destinations[].post` | Path inside the zip. `null` for `ai: none` destinations (HN). Market Blaster builds those from the canonical home |
| `destinations[].tags` | Optional array of post tags, also included in the post frontmatter and v1 manifest |
| `media[].kind` | `image`, `video`, `gif` or `document`. Optional `cover: true` (DEV), `lang` (BCP-47) and `captions` (path to a VTT file) |
| `review.reviewHash` | The shared review-hash contract (test vector `5d5491c0…c977`) |
| `manual` | Manual destinations, including posts whose owner selected `delivery: manual`; the importer copies these folders to `campaigns/<slug>/handoff/` |

## Import rules (Market Blaster)

- **Archive safety:**
  - Reject entries with absolute paths, `..` segments, backslashes, drive letters or symlinks.
  - Reject more than 2,000 entries or more than 1 GiB uncompressed.
  - Reject any single entry over 500 MiB.
  - Reject compression ratios above 100:1 (zip-bomb guard).
  - Extract into a temporary directory, never in place.
- **Destinations:**
  - Each destination in `campaign.json` that is enabled in `market-blaster.yml` gets `drafts/<id>.md`.
  - Destinations in the zip but not enabled are listed with the config line to add, and nothing is written for them.
  - Enabled destinations missing from the zip get `skip: not planned in studio`.
- **Other files:**
  - `brief.md` becomes the campaign brief; `sources/` is copied to `campaigns/<slug>/sources/`.
  - `media/` goes to `campaigns/<slug>/media/` and draft media paths are rewritten.
  - `handoff/` goes to `campaigns/<slug>/handoff/`; `review/` to `campaigns/<slug>/review/`.
- **Safety and reporting:**
  - An approved draft is never overwritten without `--force`.
  - The import ends by running `check` and printing a summary: destinations imported, skipped and not enabled, plus
    the manual platforms.
