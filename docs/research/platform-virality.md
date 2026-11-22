# Platform distribution, creative specifications, and review seeds

Research snapshot: 2026-11-22. Primary sources are linked throughout and enumerated for monitoring below. `[UNVERIFIED]` means the consulted primary sources did not establish the claim; it does not mean the feature or rule is absent. `[JUDGEMENT]` means a proposed editorial heuristic, not a platform claim or measured causal effect. Specs are route-, account-, region-, server-, and time-dependent; do not silently substitute API, advertising, or historical specs for current organic composer limits.

## Decisions summary

- **Optimize for the right reader, not a mythical universal algorithm.** Ranking differs by feed, viewer, and eligibility; even an open-source implementation may omit live configuration or experiments. No source establishes a universal viral format, number of hashtags, hook length, or cadence. [X](https://github.com/xai-org/x-algorithm), [YouTube](https://support.google.com/youtube/answer/11914225?co=YOUTUBE._YTVideoType%3Dshorts&hl=en).
- **Gate content policy before scoring.** HN accepts no generated post text and bans AI-edited comments; daily.dev rejects generated content; Buttondown prohibits primarily machine-generated prose and images. An outline is not permission to copy generated prose into a prohibited destination. For daily.dev, use author-written substance; its separate feed guidance allows AI editing, but does not license generated articles. [HN](https://news.ycombinator.com/newsguidelines.html), [daily.dev policy](https://docs.daily.dev/content-guidelines/), [daily.dev guidance](https://docs.daily.dev/what-the-feed-recommends/), [Buttondown](https://buttondown.com/legal/acceptable-use-policy).
- **Disclosure is platform- and content-specific.** Identify realistic synthetic audiovisual content and sponsorships, prompt the creator for the platform's disclosure where required, and retain human review. Labels do not legalize deceptive content. See table below.
- **[JUDGEMENT] Treat every seed as a review aid, never a reach predictor.** Score each listed criterion 0–2 (0 missing/failed, 1 partial, 2 clear/pass); record evidence and `N/A` where irrelevant. Hard policy failures block export, not merely lower a score. Hook, compression, simplicity, audience relevance, evidence and accessibility should be judged in context; never fabricate an experimental metric.
- **Recheck specifications at publish time.** Unknowns are intentionally explicit in the tables; do not fill them with common internet lore. Check actual instance configuration, publishing endpoint, account entitlements, community rules and disclosure UI.
- **[JUDGEMENT] Updater:** store registry rows as stable source records with URL, platform, scope and monitor method; hash normalized substantive content or monitor commits/releases, then flag the owner for a semantic diff and human approval. A changed page is not itself an instruction to rewrite a skill; network errors, redirects and unchanged content are not evidence of policy stability.

## Per-platform distribution and reviewer seeds

The review criteria below are **[JUDGEMENT]**, unless a corresponding rule is explicitly cited as mandatory. They assess a candidate, not the platform's disclosed ranking weights. Common accessibility baseline: meaningful image alternatives and synchronized captions for relevant audio, without claiming every platform legally mandates them. [W3C images](https://www.w3.org/WAI/tutorials/images/), [W3C captions](https://www.w3.org/WAI/media/av/captions/).

### LinkedIn

**Documented:** Feed recommendations consider professional relevance and quality, viewer relationships and activity, context and potential engagement; overly promotional or incoherent content may have limited reach. [LinkedIn](https://www.linkedin.com/help/linkedin/answer/a1499047). Text, images, documents/PDF, links and video are format options; no primary evidence reviewed proves a universal native-format preference, external-link penalty, ideal hashtag count, or that links belong in comments. **[JUDGEMENT]** A specific opening in the first two lines helps a human skimming; the exact truncation point varies by surface and is not a fixed platform specification. AI and paid partnership requirements are in the disclosure table.

**Seed:** (1) opening states a concrete outcome/problem; (2) identifies professional audience; (3) supplies one verifiable example; (4) explains a useful takeaway without a pitch dominating; (5) image/document has descriptive alternatives and legible type; (6) partnership disclosure and claims pass policy check.

### X

**Documented:** The [current xAI repository](https://github.com/xai-org/x-algorithm) describes in-network, Phoenix, SimClusters and popular-post candidate sources, personalized predicted actions, weighted scoring and visibility filtering; model weights apply to predicted probabilities, not raw engagement counts. It documents experiments and omitted components, so no static repository proves a live setting. The earlier [Twitter algorithm release](https://github.com/twitter/the-algorithm) is historical, not the current system. Short text, images, videos, links and threads are supported. A universal link penalty, media bonus, or seven-word hook is **[UNVERIFIED]**; **[JUDGEMENT]** prioritize a concrete first sentence, not an arbitrary word count. [X posting](https://help.x.com/en/using-x/how-to-post).

**Seed:** (1) first sentence communicates a specific proposition; (2) one identifiable audience; (3) every quantitative claim traceable; (4) fits actual account character allowance; (5) media adds information and has alt text/captions; (6) no deceptive or artificial engagement solicitation.

### Bluesky

**Documented:** Users select custom feeds, so there is no single Bluesky ranking; Discover is one evolving feed. [Custom feeds](https://bsky.social/about/blog/7-27-2023-custom-feeds), [product update](https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky). Posts support text, images, video and external cards; links in comments versus posts and hashtag boosts are **[UNVERIFIED]**. Sponsored content must be identified and artificial engagement is prohibited. [Community guidelines](https://bsky.social/about/support/community-guidelines).

**Seed:** (1) proposition fits one standalone post or coherent thread; (2) relevant feed/community identified; (3) evidence linked; (4) accessible image/video; (5) promotion explicitly identified when applicable; (6) within actual record limits.

### Mastodon

**Documented:** Home and live timelines are chronological, not a single centrally ranked feed; Explore/discovery is a separate surface, so do not claim that all Mastodon discovery has no ranking. Follows, boosts, hashtags, visibility settings and server federation affect exposure; federated feeds only include posts known to the server. [Network](https://docs.joinmastodon.org/user/network/), [posting](https://docs.joinmastodon.org/user/posting/). Rules differ per instance. **[JUDGEMENT]** Use relevant CamelCase hashtags for readability, not a promised ranking boost; no evidence establishes a universal external-link penalty.

**Seed:** (1) post is intelligible without opening a link; (2) relevant instance/community selected; (3) meaningful alt text; (4) hashtags are relevant and readable; (5) visibility and any content warning suit the material; (6) server's current media and promotion rules pass.

### Threads

**Documented:** Meta reports conversation-driving posts are more likely to be recommended; its aggregate observations about replies and text with media are not randomized causal estimates. [Meta creator guidance](https://about.fb.com/news/2024/10/find-your-community-with-new-threads-educational-insights/). Text, images, video and carousels are supported; placement of external links and universal hashtag uplift **[UNVERIFIED]**. See API-only media limits and Meta disclosure below.

**Seed:** (1) opening contains a concrete observation; (2) invitation to respond is relevant rather than engagement bait; (3) each claim has evidence; (4) media contains readable context and alt/captions; (5) fits target channel limits; (6) required relationship and AI labels checked.

### Reddit

**Documented:** The Home Best feed uses machine-learning recommendations; different sorts and subreddits need not follow one formula. [Reddit](https://support.reddithelp.com/hc/en-us/articles/4402284777364-What-are-home-feed-recommendations). Text, links and media depend on the community's enabled formats. Repeated unsolicited mass engagement is spam; each subreddit controls its own rules. [Posting](https://support.reddithelp.com/hc/en-us/articles/360060422572-How-do-I-post-and-comment-on-Reddit), [spam](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam). A universal numeric self-promotion ratio or AI rule is **[UNVERIFIED]**. **[JUDGEMENT]** hand off an outline only and have the human write the submission after checking that community.

**Seed:** (1) named subreddit rules checked; (2) problem and learning precede any pitch; (3) ownership disclosed; (4) concrete reproducible detail/evidence; (5) correct post type/flair; (6) no cross-community spam or vote solicitation.

### Hacker News

**Documented:** The [FAQ](https://news.ycombinator.com/newsfaq.html) describes a basic points-and-age ranking with penalties and moderation; it is not a complete current formula. [Guidelines](https://news.ycombinator.com/newsguidelines.html) require original non-editorialized titles where possible, mark video/PDF, forbid generated post text and AI-edited comments, and ask users not to automate posting or solicit votes or comments. Self-submission must not make promotion the main use. [Show HN](https://news.ycombinator.com/showhn.html) is for something personally built that people can try now, not a landing page, blog or newsletter.

**Seed:** Apply only to a human-authored candidate: (1) original accurate title; (2) useful, substantive source; (3) Show HN eligibility when selected; (4) correct `[video]`/`[pdf]` marker if applicable; (5) no generated or AI-edited text where prohibited; (6) no engagement solicitation or automated submission. **Do not generate an HN draft or outline for copy/paste.**

### DEV

**Documented:** Markdown articles, tags, cover images, scheduling and cross-posts with canonical URL are supported; high-quality cross-posts may be featured. [Writing help](https://dev.to/help/writing-editing-scheduling). DEV's [AI disclosure tiers](https://dev.to/devteam/introducing-ai-disclosure-on-dev-tools-for-nuance-clarity-and-better-feeds-34mk) include Hand Written, AI-Assisted and Fully Autonomous; authors remain responsible for accuracy. Exact feed weights **[UNVERIFIED]**. Ensure substantial developer value and check [community rules](https://dev.to/code-of-conduct).

**Seed:** (1) title names developer outcome; (2) runnable or concrete example; (3) claims sourced; (4) canonical URL set for cross-post; (5) relevant tags and readable headings; (6) correct AI tier and accessible images.

### Hashnode

**Documented:** A [historical feed description](https://townhall.hashnode.com/revamped-personalized-feed) cites followed tags/authors, engagement and quality signals; it does not establish today's weights. Articles support Markdown and syndicated original URLs. [Syndication](https://townhall.hashnode.com/why-you-should-republish-your-devblog-posts-and-how-to-do-it). [Terms](https://hashnode.com/terms) require review/edit/approval of AI-generated editor suggestions and prohibit unsolicited promotion and generation intended to manipulate search or engagement. General disclosure mandate **[UNVERIFIED]**.

**Seed:** (1) title states a specific technical problem; (2) tutorial has reproducible detail; (3) sources support claims; (4) original URL set when syndicated; (5) headings and visual descriptions accessible; (6) AI suggestions reviewed and no manipulative promotion.

### Medium

**Documented:** Network distribution and personalized recommendations differ; stories can be restricted to Network Only and exceptional stories selected for human-curated Boost. [Distribution](https://help.medium.com/hc/en-us/articles/360018677974-What-happens-to-your-story-when-you-publish-on-Medium). Long-form articles and imported stories are supported; format favoritism, link penalty and exact weights **[UNVERIFIED]**. AI-generated text and images have specific disclosure rules, below. [AI policy](https://help.medium.com/hc/en-us/articles/22576852947223-Artificial-Intelligence-AI-content-policy).

**Seed:** (1) opening establishes the reader's question; (2) article offers original insight; (3) factual claims have sources; (4) sections and images are accessible; (5) import preserves canonical URL where applicable; (6) AI disclosure and paywall eligibility pass.

### Product Hunt

**Documented:** Homepage featuring involves editorial selection; leaderboard points weight genuine engagement rather than treating all raw votes identically. Do not ask for upvotes or buy votes; invite genuine feedback instead. [Points](https://help.producthunt.com/en/articles/10275873-what-are-points), [launch FAQ](https://help.producthunt.com/en/articles/17734646-8-launch-faq-and-myths). A launch includes a concise product page, visual gallery and maker comment; see limits below. Generic AI disclosure requirement **[UNVERIFIED]**.

**Seed:** (1) name/tagline explain what the product does; (2) gallery demonstrates real functionality; (3) description states audience and differentiated benefit; (4) claims and ownership are accurate; (5) asset and field limits pass; (6) feedback request avoids asking for upvotes.

### YouTube Shorts

**Documented:** Recommendation signals include whether viewers choose to watch, average watch duration and percentage, likes and surveys; topic interest, competition and seasonality matter. YouTube states no minimum posting cadence is required. [YouTube](https://support.google.com/youtube/answer/11914225?co=YOUTUBE._YTVideoType%3Dshorts&hl=en). Square or vertical videos up to three minutes qualify under the current Shorts rules; a Short over one minute with an active Content ID claim is globally blocked. [Shorts](https://support.google.com/youtube/answer/15424877?hl=en). No universal retention percentage or optimal duration is established.

**Seed:** (1) first seconds establish the subject; (2) a specific viewer benefit is evident; (3) visual demonstration matches narration; (4) captions and readable framing are present; (5) music/footage rights checked; (6) altered-content disclosure checked.

### Instagram Reels and carousels

**Documented:** Instagram's [2023 ranking explanation](https://about.instagram.com/blog/announcements/instagram-ranking-explained) describes separate Feed, Explore and Reels systems; predicted shares, completion and other engagement inform Reels, while low-resolution, watermarked or predominantly text Reels can be less visible. This is not a current formula or a guarantee. Reels over three minutes are not recommended to new audiences; Feed carousels may contain up to 20 images/videos and their videos are not Reels. [Reels length](https://www.facebook.com/help/instagram/456185931138729?locale=en_GB), [carousel](https://www.facebook.com/help/instagram/1188122969438057). External-link and hashtag effects **[UNVERIFIED]**.

**Seed:** (1) first frame/slide communicates a clear topic; (2) each subsequent slide or scene advances one point; (3) text remains readable on mobile; (4) captions and image alternatives supplied; (5) media is original and not misleading; (6) partnership and AI labeling checked.

### TikTok

**Documented:** Recommendations use interactions such as full watches, skips, likes, shares and comments, alongside content information and search relevance. [TikTok](https://support.tiktok.com/en/using-tiktok/exploring-videos/how-tiktok-recommends-content). Unoriginal reused media without creative changes can be ineligible for For You; realistic synthetic or significantly edited people/scenes require labeling. [Integrity policy](https://www.tiktok.com/community-guidelines/en/integrity-authenticity). A magic duration or hashtag set is **[UNVERIFIED]**.

**Seed:** (1) subject appears in opening seconds; (2) demonstration is original and relevant; (3) pacing contains no unnecessary dead time; (4) spoken information has accurate captions; (5) factual/visual claims are supported; (6) synthetic-media and commercial disclosure requirements pass.

### GitHub: README, Discussions and Releases

**Documented:** Explore may show popular or relevant projects personalized from activity; an exact Trending formula is **[UNVERIFIED]**. [Discovery](https://docs.github.com/en/get-started/exploring-projects-on-github/discovering-projects-on-github). README is the durable project entry point, Discussions are community conversations, and Releases describe versions; GitHub supports Markdown. Project-related promotion in a README is allowed when advertising is not its primary focus; bulk promotional activity and artificial stars/follows are prohibited. [Acceptable use](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies). Universal AI disclosure rule **[UNVERIFIED]**.

**Seed:** (1) README identifies purpose and audience; (2) install/try instructions are runnable; (3) discussion has a clear topic/category; (4) release specifies version and meaningful changes; (5) claims link to commits/docs; (6) no artificial engagement and visuals have alternatives.

### daily.dev

**Documented:** Wider feed reach depends on reader response; educational, non-misleading developer content is favored in published guidance. Link previews use page title, description and image. [Feed guidance](https://docs.daily.dev/what-the-feed-recommends/). [Guidelines](https://docs.daily.dev/content-guidelines/) reject generated content, predominantly promotional material, paid placements outside official programs and affiliate links; personal and company blogs cannot become indexed sources, though direct posts and Squads are available. AI editing is described separately as permissible when substance and voice remain the author's; generated article submission is not. [Featuring](https://docs.daily.dev/how-to-get-featured/).

**Seed:** For a human-authored candidate only: (1) teaches a useful developer lesson independent of purchase; (2) authentic experience or evidence included; (3) accurate English title; (4) `og:title` and `og:image` checked; (5) disclosure of affiliation; (6) no generated article, prohibited paid placement or affiliate link.

### Newsletters

**Documented:** There is no single platform or feed algorithm for newsletters; distribution may be direct email or an independent editor's selection. [Gmail sender requirements](https://support.google.com/mail/answer/81126?hl=en) address authentication, spam rate and bulk unsubscribe, not guaranteed inbox placement. [Buttondown](https://buttondown.com/legal/acceptable-use-policy) requires double opt-in and rejects primarily machine-generated prose/images. [Substack](https://support.substack.com/hc/en-us/articles/50891130623508-How-can-I-detect-AI-on-Substack) offers estimated AI detection on eligible web posts, not proof or a rule covering all email. Publication-specific submissions and AI rules **[UNVERIFIED]**; choose the actual editor. See [Cooperpress](https://cooperpress.com/submit/) and [Changelog News](https://changelog.com/news/submit) for distinct editorial routes.

**Seed:** (1) clearly names intended publication and audience; (2) concise human-written subject/pitch; (3) newsworthy evidence and working primary link; (4) affiliation and sponsorship disclosed; (5) recipient opted in or editor explicitly accepts suggestions; (6) provider AI policy and unsubscribe requirements pass.

## Media and length specification matrix

`U` means **[UNVERIFIED]**, not unlimited. Limits are per item unless stated; `API` denotes that route only. Always check the linked live source and account/server capabilities; specification ≠ ranking preference. Where not specified, dimensions, aspect ratios, codecs, byte limits, carousel count, caption and hashtag limits are U.

| Platform / route | Text, images, carousel | Video and additional scope | Source |
|---|---|---|---|
| LinkedIn organic | Text, image, document/PDF; current character, image and document limits U. | 75 KB–5 GB; 3 sec desktop/2 sec mobile minimum, 15 min max; 256×144–4096×2304, aspect 1:2.4–2.4:1, 10–60 fps; codec U. | [LinkedIn](https://www.linkedin.com/help/linkedin/answer/a7494039) |
| X organic | Standard posts normally 280 weighted characters; Premium longer posts exist. Image dimensions, sizes and carousel limits U. | Standard accounts up to 140 sec; Premium up to four hours; upload size, codec and dimensions vary by route and are U here. | [Post](https://help.x.com/en/using-x/how-to-post), [video](https://help.x.com/en/using-x/premium-longer-videos) |
| Bluesky protocol / app | Post text ≤300 graphemes and ≤3,000 bytes; 2026 app supports four photos. Image size/aspect U. | 2026 product update describes up to 3 min; email verification and daily limits apply on Bluesky video hosting. File size, codec and dimensions U. | [Lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json), [app](https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky), [video](https://bsky.network/docs/about-bluesky-content/video) |
| Mastodon default server | Default 500 characters, server configurable; up to four PNG/JPG/HEIF/WebP/AVIF images, 16 MB each, downscaled to 8.3 MP. | One MP4/M4V/MOV/WebM video up to 99 MB by documented defaults; length, dimensions, codec U. Actual instance can differ. | [Posting](https://docs.joinmastodon.org/user/posting/), [instance](https://docs.joinmastodon.org/entities/Instance/) |
| Threads API | 500-character post; JPEG/PNG ≤8 MB; carousel 2–20 items. Image dimensions U. | MOV/MP4, H.264/HEVC, 23–60 fps, horizontal ≤1920 px, ≤5 min and ≤1 GB; 9:16 recommended. Not necessarily app limits. | [API](https://developers.facebook.com/documentation/threads/posts) |
| Reddit | Text/link/image/video availability is subreddit-dependent; image dimensions, size, carousel and text limits U. | Video specs and length U; check selected community. | [Posting](https://support.reddithelp.com/hc/en-us/articles/360060422572-How-do-I-post-and-comment-on-Reddit) |
| HN | Link or text submission; no native uploaded image; title/body limits U. | Link to video with `[video]`; video upload specs not applicable. | [Guidelines](https://news.ycombinator.com/newsguidelines.html) |
| DEV / Forem | Markdown, tags, cover URL and canonical URL; text/image/carousel limits U. | Embedded media supported by editor; size/length/codec U. | [API](https://developers.forem.com/api/v1), [editor](https://dev.to/help/writing-editing-scheduling) |
| Hashnode | Markdown and cover; API upload ≤8 MB, `image/*` except SVG; image dimensions, article length and carousel U. | Embedded media; upload codec, size, length U. | [API skill](https://github.com/Hashnode/gql-skill/blob/main/skills/gql-api/references/mutations.md) |
| Medium | Long-form text, image and imported articles; image dimensions/bytes, text limit, carousel U. | Video constraints U. | [Import](https://help.medium.com/hc/en-us/articles/213480228-API-Importing) |
| Product Hunt | Name ≤40, tagline ≤60, description ≤500, maker comment ≤5,000 characters; 1–3 tags. Logo 240×240 recommended, JPG/PNG/GIF ≤2 MB; ≥1 gallery image, 1270×760 recommended; gallery maximum U. | Video and codec limits U. | [Launch page](https://help.producthunt.com/en/articles/17834537-4-build-your-product-page) |
| YouTube Shorts | Title, description, image/thumbnail and character specs U here. | Square or vertical and ≤3 min for qualifying standard-channel uploads; codec, bytes, dimensions U. | [Shorts](https://support.google.com/youtube/answer/15424877?hl=en) |
| Instagram | Feed carousel ≤20 photos/videos, common chosen orientation across items. Image byte/dimension limits U. | Reels 1.91:1–9:16, ≥30 fps and ≥720 pixels; >3 min not recommended to new audiences. Maximum upload duration, file size and codec U. | [Reels](https://www.facebook.com/help/instagram/1038071743007909?locale=en_GB), [length](https://www.facebook.com/help/instagram/456185931138729?locale=en_GB), [carousel](https://www.facebook.com/help/instagram/1188122969438057) |
| TikTok Content Posting API | Image carousel, text and image-size specs U here. | MP4 recommended; MOV/WebM accepted, H.264/H.265/VP8/VP9, 23–60 fps, each dimension 360–4096 px, ≤4 GB; Upload Video endpoint ≤10 min and account-specific publishing limits may be lower. App limits U. | [API transfer guide](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide) |
| GitHub repository | Social preview PNG/JPG/GIF <1 MB, at least 640×320; 1280×640 recommended. README/Discussion/Release Markdown length, carousel and embedded image sizes U. | Release/README video specs U. | [Social preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview) |
| daily.dev | Link shares, free-form posts and polls; share to profile and/or up to three Squads. Image dimensions, bytes, text and carousel limits U. | Video support noted for source content; upload specs U. | [Featuring](https://docs.daily.dev/how-to-get-featured/) |
| Newsletters | Publisher/editor-specific text and image specs, limits and attachment rules U. | Provider-specific; video codec and length U. | [Cooperpress](https://cooperpress.com/submit/), [Buttondown](https://buttondown.com/legal/acceptable-use-policy) |

## AI and promotion disclosure matrix

| Platform | Requirements and limitations | Source |
|---|---|---|
| LinkedIn | Recommends disclosing substantial non-obvious AI use; this source does not establish a universal mandatory label. Paid brand relationships, including free products exchanged for value, require the partnership label. C2PA/provenance label behavior and scope **[UNVERIFIED]**. | [AI](https://www.linkedin.com/help/linkedin/answer/a1481496), [partnership](https://www.linkedin.com/help/linkedin/answer/a1627083) |
| X | No universal AI disclosure rule established **[UNVERIFIED]**. Inauthentic manipulation and artificial amplification prohibited; confirm current paid-partnership policy before posting. | [Authenticity](https://help.x.com/en/rules-and-policies/authenticity), [partnership](https://help.x.com/rules-and-policies/paid-partnerships-policy) |
| Bluesky | Commercial content must be clearly identified; deceptive/harmful synthetic content and manipulation are restricted. Blanket AI disclosure requirement **[UNVERIFIED]**. | [Guidelines](https://bsky.social/about/support/community-guidelines) |
| Mastodon | Rules vary by home and receiving server; network-wide AI disclosure mandate **[UNVERIFIED]**. Check local rules and applicable law. | [Network](https://docs.joinmastodon.org/user/network/) |
| Threads / Instagram | Meta applies AI info labels using industry signals or self-disclosure, and may use prominent labels for higher-risk manipulated media; API supports `is_made_with_ai` for Threads. Exact mandatory self-disclosure scope **[UNVERIFIED]**; branded content requires appropriate paid-partnership disclosure. | [Meta labeling](https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/), [Threads API](https://developers.facebook.com/documentation/threads/posts), [branded content](https://help.instagram.com/2467529163409127) |
| Reddit | Subreddit rules govern AI and promotion; a universal AI disclosure mandate **[UNVERIFIED]**. No spam. | [Posting](https://support.reddithelp.com/hc/en-us/articles/360060422572-How-do-I-post-and-comment-on-Reddit), [spam](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam) |
| Hacker News | No generated text in posts; comments must not contain generated or AI-edited text. Do not solicit engagement or automate posting. | [Guidelines](https://news.ycombinator.com/newsguidelines.html) |
| DEV | Use applicable Hand Written, AI-Assisted or Fully Autonomous disclosure tier and remain accountable for accuracy. | [DEV disclosure](https://dev.to/devteam/introducing-ai-disclosure-on-dev-tools-for-nuance-clarity-and-better-feeds-34mk) |
| Hashnode | Review, edit and approve AI editor suggestions; no manipulative automated content or unsolicited promotion. General disclosure mandate **[UNVERIFIED]**. | [Terms](https://hashnode.com/terms) |
| Medium | Disclose AI-generated text, e.g. in first two paragraphs, and caption generated images; minor editing/outline/fact-check assistance has exceptions. Predominantly generated, lightly edited writing is ineligible for Partner Program paywall even if disclosed. | [AI policy](https://help.medium.com/hc/en-us/articles/22576852947223-Artificial-Intelligence-AI-content-policy) |
| Product Hunt | General AI disclosure policy **[UNVERIFIED]**; no soliciting or purchasing upvotes. | [FAQ](https://help.producthunt.com/en/articles/17734646-8-launch-faq-and-myths) |
| YouTube | Disclose realistic meaningfully altered or synthetic scenes, events or people; minor edits, script help and some other listed examples are exceptions. YouTube may label automatically; disclosure itself does not reduce monetization eligibility. | [Altered content](https://support.google.com/youtube/answer/14328491?hl=en) |
| TikTok | Label AI-generated or significantly edited realistic-looking people or scenes; labeling does not exempt content from other rules. | [Integrity policy](https://www.tiktok.com/community-guidelines/en/integrity-authenticity) |
| GitHub | Universal AI disclosure mandate **[UNVERIFIED]**; project-focused README promotion is allowed, artificial engagement and bulk promotional activity are not. | [Acceptable use](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies) |
| daily.dev | Rejects AI-generated content, predominantly self-promotional content and unauthorized paid placement; separate feed guidance permits AI editing while retaining human substance and voice. | [Guidelines](https://docs.daily.dev/content-guidelines/), [feed](https://docs.daily.dev/what-the-feed-recommends/) |
| Newsletters | Buttondown prohibits primarily machine-generated prose and images and requires double opt-in. Substack detector provides an estimate for eligible web posts, not an email-wide ban. Other publication policies **[UNVERIFIED]**. | [Buttondown](https://buttondown.com/legal/acceptable-use-policy), [Substack](https://support.substack.com/hc/en-us/articles/50891130623508-How-can-I-detect-AI-on-Substack) |

## Sources registry

Machine-readable Markdown table: one source per row, stable absolute URLs, explicit scope and proposed change detector. `page-hash` means hash normalized main content after successful fetch, retaining prior snapshot and surfacing failures; `git-commit` means monitor the specified repository/path's default-branch commit. A hash change triggers review, not automatic policy replacement. Dynamic or blocked pages require human review when fetching fails. All dates and availability may change.

| platform | source URL | what it governs | how to detect change |
|---|---|---|---|
| LinkedIn | https://www.linkedin.com/help/linkedin/answer/a1499047 | algorithm / feed recommendations | page-hash |
| LinkedIn | https://www.linkedin.com/help/linkedin/answer/a7494039 | specs / organic video | page-hash |
| LinkedIn | https://www.linkedin.com/help/linkedin/answer/a1481496 | AI policy | page-hash |
| LinkedIn | https://www.linkedin.com/help/linkedin/answer/a1627083 | community rules / branded content | page-hash |
| X | https://github.com/xai-org/x-algorithm | algorithm / current open-source For You | git-commit |
| X | https://github.com/twitter/the-algorithm | algorithm / historical release | git-commit |
| X | https://help.x.com/en/using-x/how-to-post | specs / text | page-hash |
| X | https://help.x.com/en/using-x/premium-longer-videos | specs / video | page-hash |
| X | https://help.x.com/en/rules-and-policies/authenticity | community rules / manipulation | page-hash |
| X | https://help.x.com/rules-and-policies/paid-partnerships-policy | community rules / partnerships; access unverified | page-hash |
| Bluesky | https://bsky.social/about/blog/7-27-2023-custom-feeds | algorithm / custom feeds | page-hash |
| Bluesky | https://bsky.social/about/blog/01-26-2026-whats-next-at-bluesky | specs / video and images; product update | page-hash |
| Bluesky | https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json | specs / post record | git-commit |
| Bluesky | https://bsky.network/docs/about-bluesky-content/video | specs / video | page-hash |
| Bluesky | https://bsky.social/about/support/community-guidelines | AI policy / community rules | page-hash |
| Mastodon | https://docs.joinmastodon.org/user/network/ | algorithm / federation and discovery | page-hash |
| Mastodon | https://docs.joinmastodon.org/user/posting/ | specs / posting and visibility | page-hash |
| Mastodon | https://docs.joinmastodon.org/entities/Instance/ | specs / instance configuration | page-hash |
| Threads | https://about.fb.com/news/2024/10/find-your-community-with-new-threads-educational-insights/ | algorithm / creator guidance | page-hash |
| Threads | https://developers.facebook.com/documentation/threads/posts | specs / API and AI labeling | page-hash |
| Reddit | https://support.reddithelp.com/hc/en-us/articles/4402284777364-What-are-home-feed-recommendations | algorithm / Home recommendations | page-hash |
| Reddit | https://support.reddithelp.com/hc/en-us/articles/360060422572-How-do-I-post-and-comment-on-Reddit | specs / community post types | page-hash |
| Reddit | https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam | community rules / spam | page-hash |
| Hacker News | https://news.ycombinator.com/newsfaq.html | algorithm / ranking explanation | page-hash |
| Hacker News | https://news.ycombinator.com/newsguidelines.html | AI policy / community rules | page-hash |
| Hacker News | https://news.ycombinator.com/showhn.html | community rules / Show HN | page-hash |
| DEV | https://dev.to/help/writing-editing-scheduling | specs / editor and canonical | page-hash |
| DEV | https://developers.forem.com/api/v1 | specs / article API | page-hash |
| DEV | https://dev.to/devteam/introducing-ai-disclosure-on-dev-tools-for-nuance-clarity-and-better-feeds-34mk | AI policy / disclosure tiers | page-hash |
| DEV | https://dev.to/code-of-conduct | community rules | page-hash |
| Hashnode | https://townhall.hashnode.com/revamped-personalized-feed | algorithm / historical feed | page-hash |
| Hashnode | https://townhall.hashnode.com/why-you-should-republish-your-devblog-posts-and-how-to-do-it | specs / syndication | page-hash |
| Hashnode | https://github.com/Hashnode/gql-skill/blob/main/skills/gql-api/references/mutations.md | specs / image upload API | git-commit |
| Hashnode | https://hashnode.com/terms | AI policy / community rules | page-hash |
| Medium | https://help.medium.com/hc/en-us/articles/360018677974-What-happens-to-your-story-when-you-publish-on-Medium | algorithm / distribution and Boost | page-hash |
| Medium | https://help.medium.com/hc/en-us/articles/213480228-API-Importing | specs / import | page-hash |
| Medium | https://help.medium.com/hc/en-us/articles/22576852947223-Artificial-Intelligence-AI-content-policy | AI policy / disclosure and paywall | page-hash |
| Product Hunt | https://help.producthunt.com/en/articles/10275873-what-are-points | algorithm / leaderboard | page-hash |
| Product Hunt | https://help.producthunt.com/en/articles/17734646-8-launch-faq-and-myths | community rules / launch | page-hash |
| Product Hunt | https://help.producthunt.com/en/articles/17834537-4-build-your-product-page | specs / launch page | page-hash |
| YouTube Shorts | https://support.google.com/youtube/answer/11914225?co=YOUTUBE._YTVideoType%3Dshorts&hl=en | algorithm / recommendation signals | page-hash |
| YouTube Shorts | https://support.google.com/youtube/answer/15424877?hl=en | specs / Shorts eligibility and copyright | page-hash |
| YouTube Shorts | https://support.google.com/youtube/answer/14328491?hl=en | AI policy / disclosure | page-hash |
| Instagram | https://about.instagram.com/blog/announcements/instagram-ranking-explained | algorithm / historical ranking explanation | page-hash |
| Instagram | https://www.facebook.com/help/instagram/1038071743007909?locale=en_GB | specs / Reels size | page-hash |
| Instagram | https://www.facebook.com/help/instagram/456185931138729?locale=en_GB | specs / Reels duration and discovery | page-hash |
| Instagram | https://www.facebook.com/help/instagram/1188122969438057 | specs / carousel | page-hash |
| Instagram and Threads | https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/ | AI policy / labeling | page-hash |
| Instagram and Threads | https://help.instagram.com/2467529163409127 | community rules / branded content | page-hash |
| TikTok | https://support.tiktok.com/en/using-tiktok/exploring-videos/how-tiktok-recommends-content | algorithm / recommendations | page-hash |
| TikTok | https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide | specs / API video | page-hash |
| TikTok | https://www.tiktok.com/community-guidelines/en/integrity-authenticity | AI policy / unoriginal media | page-hash |
| GitHub | https://docs.github.com/en/get-started/exploring-projects-on-github/discovering-projects-on-github | algorithm / Explore | page-hash |
| GitHub | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview | specs / social preview | page-hash |
| GitHub | https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies | community rules / promotion and manipulation | page-hash |
| daily.dev | https://docs.daily.dev/what-the-feed-recommends/ | algorithm / feed guidance and AI editing | page-hash |
| daily.dev | https://docs.daily.dev/content-guidelines/ | AI policy / source and promotion rules | page-hash |
| daily.dev | https://docs.daily.dev/how-to-get-featured/ | specs / submissions | page-hash |
| Newsletters | https://buttondown.com/legal/acceptable-use-policy | AI policy / opt-in | page-hash |
| Newsletters | https://support.substack.com/hc/en-us/articles/50891130623508-How-can-I-detect-AI-on-Substack | AI policy / detector scope | page-hash |
| Newsletters | https://support.google.com/mail/answer/81126?hl=en | delivery / authentication and unsubscribe | page-hash |
| Newsletters | https://cooperpress.com/submit/ | community rules / editorial submission | page-hash |
| Newsletters | https://changelog.com/news/submit | community rules / editorial submission | page-hash |
| Cross-platform | https://www.w3.org/WAI/tutorials/images/ | accessibility / text alternatives | page-hash |
| Cross-platform | https://www.w3.org/WAI/media/av/captions/ | accessibility / captions | page-hash |
