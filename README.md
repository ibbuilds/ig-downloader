# Sget — links in, media out

A **lightweight link-to-media CLI** with a pluggable extraction core. Instagram remains the reference provider; Reddit, public-page social metadata and a generic HTTPS fallback are separately testable. The repository remains `ibbuilds/ig-downloader` while the generic engine is developed; the existing Instagram browser extension and CLI are preserved. Forked from [hoaianle/Instagram-Downloader](https://github.com/hoaianle/Instagram-Downloader), MIT, retaining the original LICENSE.

## Open-source status

This is already a **public MIT-licensed project**. The core, CLI, SDK and Instagram integration are open source; upstream attribution remains in [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). The GitHub repository is still attached to its original fork network: independence of development is not the same as detachment. We preserve the repository URL, commits and PR history; see the [non-destructive independence procedure](docs/repository-independence.md).

The npm `private` flag prevents accidental registry publication, not source access. No npm publication is claimed. Read [governance](GOVERNANCE.md), [security](SECURITY.md), and [release procedures](docs/releases.md).

## Install and use

Use a maintained Node.js LTS release (24 recommended; 22 supported). Node 20 remains legacy-compatible, not security-supported. No third-party runtime packages.

```sh
git clone https://github.com/ibbuilds/ig-downloader.git
cd ig-downloader
npm link
sget 'https://www.instagram.com/reel/SHORTCODE/'
sget -u 'https://www.instagram.com/p/SHORTCODE/'
sget -nJ 'https://www.instagram.com/p/SHORTCODE/'
sget -f links.txt -o ./downloads -j4
cat links.txt | sget
```

`sget` is the platform-neutral command. `igd` and `ig-downloader` continue working with exactly the same options. Short options: `-A` scan page tags, `-u` URLs, `-n` preview, `-a` auto/original type, `-i` image only, `-V` prefer video, `-m` media mode, `-f` input file, `-j` concurrency, `-J` JSON, `-q` quiet. Batch requests deduplicate input and use shared command-scoped session/cache and globally bounded downloads.

**Instagram remains the reference provider.** Stories, Highlights, Posts, Reels and account-scoped Stories use the existing web GraphQL implementation; it can change without warning. Image mode on a video Story may yield a poster, not the photographer's original file. Respect login and content-access restrictions. User-supplied cookies are secrets and must not be posted to issues or committed.

The browser extension is still Instagram-specific: load unpacked at `chrome://extensions` using the repository folder containing `manifest.json`. Original inline buttons, ZIP, quality controls and filename templates are retained. CLI/extension media selection continues sharing `shared/media.js`.

## Popular links: what works today

| Source | Current extraction behavior | Status |
| --- | --- | --- |
| Instagram | Existing Story, Highlight, Post, Reel GraphQL client | Implemented; authenticated live acceptance not yet verified |
| Reddit | Images, galleries and publicly retrievable Reddit video fallback (audio may be separate); public-page preview fallback | Fixture tested; Reddit may require user OAuth and restrict anonymous JSON |
| Facebook | Public Open Graph image/direct MP4 metadata only | Experimental; login/JS pages may expose nothing |
| TikTok | Public video hydration when exposed, otherwise Open Graph resource metadata | Experimental; signed dynamic endpoints may stop working |
| X / Twitter | Public player-stream URL or image metadata | Experimental; often only an image preview |
| Pinterest | Public pin image/video metadata | Experimental; previews may be resized |
| Other HTTPS links | Direct JPG/PNG/WebP/AVIF/HEIC/GIF/MP4/MOV/WebM/MP3/M4A/OGG and public Open Graph tags | Generic fallback; no JavaScript rendering or recursive crawl |

The CLI **never labels a poster as the original video**. Passing fixture tests does not prove any service remains publicly accessible today. YouTube pages may expose preview metadata, but the native core does not implement the full YouTube video-stream extractor or audio/video merging. No DRM or payment-control bypass is provided.

```sh
sget 'https://www.reddit.com/r/pics/comments/POSTID/title/'
sget -nJ 'https://www.facebook.com/reel/POSTID'
sget -n 'https://www.tiktok.com/@user/video/POSTID'
sget -A 'https://example.org/article-with-images' # include visible HTML <img>/<video> tags
sget 'https://cdn.example.org/song.mp3'
sget providers   # show built-in adapters
```

**Private session inputs stay with the person running the CLI.** When necessary, use `--cookie-file` for a *single* provider (a raw header for non-Instagram sites), `IG_COOKIE` for Instagram compatibility, or `SGET_COOKIE_FACEBOOK`, `SGET_COOKIE_TIKTOK`, `SGET_COOKIE_TWITTER`, `SGET_COOKIE_PINTEREST`, `SGET_COOKIE_REDDIT` for distinct local environments. Reddit also reads `SGET_REDDIT_TOKEN` locally for OAuth access when configured. Never put credentials in GitHub fixtures, repository variables or Actions secrets; public CI checks only use synthetic responses. Do not run arbitrary community plugins unless you trust their code.

## Add another platform

```sh
npm run create:provider -- example
npm run check:provider -- instagram
npm run check:providers
sget --plugin ./my-provider.js 'https://site.example/post/123'
```

Contributors implement a small adapter (`match`, `parse`, `resolve`, `select`, `validateUrl`) rather than duplicating the CLI/downloader. Site-specific origins and redirects are validated by provider policy. External packages are explicitly enabled with `--plugin` and **run arbitrary local JavaScript**; load only code you trust. Generated scaffold tests intentionally fail until implemented.

The framework does not yet implement Patreon, OnlyFans or complete YouTube media-stream extraction. TikTok, Facebook, X and Pinterest are experimental **public-metadata** adapters rather than guaranteed full-site extractors. A contributor must add fixtures and verify each new adapter independently.

See [architecture](docs/architecture.md), [provider development](docs/provider-development.md), [adapter type contract](types/provider.d.ts), [runtime decision](docs/adr/0001-runtime.md), and [contributing procedures](CONTRIBUTING.md).

## Automated checks and maintenance

```sh
npm run check              # core/CLI tests, syntax, static extension
npm run check:providers    # independently test all registered providers
npm run check:package      # offline install, aliases, artifacts and notices
npm run pack:release       # CLI tarball, extension ZIP and SHA256SUMS
```

- `CI`: cross-platform core/CLI tests (Ubuntu, Windows, macOS; Node.js 22 and 24 plus legacy Node 20 compatibility).
- `Provider checks`: dynamically discovered matrix jobs, one per built-in adapter, from saved response fixtures.
- `<provider> live resolution`: optional public-URL-only manual/scheduled checks; **skipped until an accessible public URL is given**. No private user cookies or tokens are stored in GitHub. Checks current extraction/selection, not full downloaded bytes.
- `Package checks`: cross-platform offline installation and reproducible ZIP smoke tests.
- `Release`: separate CLI/extension tag validation, artifacts and checksums; tagged builds create drafts, never automatic npm publication.

Core maintainers maintain common actions, contracts, URL safety and packaging. Provider contributors maintain individual site behavior via focused PRs. An external site breaking should be reported independently rather than described as core failure. Provider READMEs state `maintained`, `experimental`, `broken` or `unmaintained`.

## Limitations and licensing

This project is independent of Instagram/Meta, Patreon and other platforms. Signed media URLs expire. Content permissions and applicable rights remain the user's responsibility. The CLI supports progressive media while the Instagram extension also includes its existing DASH muxing behavior. MIT license: see [LICENSE](LICENSE) for upstream attribution.
