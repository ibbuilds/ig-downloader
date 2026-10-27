# Sget — link in, media out

A **small modular media extraction and downloading engine**, with Instagram as the first built-in provider. The repository remains `ibbuilds/ig-downloader` while the generic engine is developed; the existing Instagram browser extension and CLI are preserved. Forked from [hoaianle/Instagram-Downloader](https://github.com/hoaianle/Instagram-Downloader), MIT, retaining the original LICENSE.

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
sget -nJ 'https://www.reddit.com/r/pics/comments/POST_ID/title/'
sget -A 'https://public.example.org/gallery'  # visible page assets; no JS rendering
cat links.txt | sget
sget providers  # show installed adapters
```

`sget` is the platform-neutral command. `igd` and `ig-downloader` continue working with exactly the same options. Short options: `-u` URLs, `-n` preview, `-a` auto/original type, `-i` image only, `-V` prefer video, `-m` media mode, `-f` input file, `-j` concurrency, `-J` JSON, `-q` quiet. Batch requests deduplicate input and use shared command-scoped session/cache and globally bounded downloads.

**Built-in sources:** Instagram, Reddit, Facebook, TikTok, X/Twitter, Pinterest, and generic public HTTPS pages/direct media. **Only Instagram has the existing full, site-specific extension and Story/Post/Reel handling.** Reddit resolves supported public post/gallery JSON when available. The other sources are experimental **public-metadata extractors**; they may only return previews/posters or fail when sites require login, JavaScript or signed streams. See [source coverage](#coverage-and-limitations). No site is claimed live-verified solely because its fixture tests pass.

The browser extension is still Instagram-specific: load unpacked at `chrome://extensions` using the repository folder containing `manifest.json`. Original inline buttons, ZIP, quality controls and filename templates are retained. CLI/extension media selection continues sharing `shared/media.js`.

## Add another platform

```sh
npm run create:provider -- example
npm run check:provider -- instagram
npm run check:providers
sget --plugin ./my-provider.js 'https://site.example/post/123'
```

Contributors implement a small adapter (`match`, `parse`, `resolve`, `select`, `validateUrl`) rather than duplicating the CLI/downloader. Site-specific origins and redirects are validated by provider policy. External packages are explicitly enabled with `--plugin` and **run arbitrary local JavaScript**; load only code you trust. Generated scaffold tests intentionally fail until implemented.

New adapters are independently maintained. Patreon and OnlyFans are **not** built in; unsupported services may still return public Open Graph images through the generic web fallback, which is **not** full service support. The core does not bypass access controls or DRM.

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
- `<provider> live resolution`: optional separate scheduled/manual **public-only** workflow. Unconfigured = not verified. Any authenticated acceptance is run **locally by the end user**; no private credentials are required or committed to GitHub. Checks resolution/selection, not full downloads.
- `Package checks`: cross-platform offline installation and reproducible ZIP smoke tests.
- `Release`: separate CLI/extension tag validation, artifacts and checksums; tagged builds create drafts, never automatic npm publication.

Core maintainers maintain common actions, contracts, URL safety and packaging. Provider contributors maintain individual site behavior via focused PRs. An external site breaking should be reported independently rather than described as core failure. Provider READMEs state `maintained`, `experimental`, `broken` or `unmaintained`.

## Coverage and limitations

| Source | Current behavior | Confidence |
|---|---|---|
| Instagram | Stories, Highlights, Posts, Reels and the original browser extension | Fixture-tested; live unverified |
| Reddit | Public post JSON, galleries and linked images/videos; preview fallback | Experimental, fixture-tested; video fallback may lack audio |
| Facebook | Public Open Graph image/video metadata only | Experimental; full video may require an unavailable stream |
| TikTok | Public hydration video/image resources where exposed, plus metadata | Experimental; frequently changes |
| X/Twitter | Public Twitter Card / Open Graph images and directly linked media | Experimental; often poster-only |
| Pinterest | Public pin metadata images | Experimental; may be previews |
| Other public HTTPS pages | Direct files, Open Graph and `-A` page media tag scan | Fallback; not a browser, crawler, or JavaScript renderer |

Status is **not** a claim that a site's present-day endpoints are working. Automated provider CI uses synthetic fixtures. No recursive profile/playlist crawling, automatic DRM removal, YouTube adaptive-stream support, or private-media bypass exists.

### Authentication remains user-local

Do not put real accounts, cookies or private test targets into GitHub repository secrets or fixtures. Each user may set `IG_COOKIE` (Instagram) or a provider-specific `SGET_COOKIE_<PROVIDER>` environment variable locally (for example, `SGET_COOKIE_FACEBOOK`). Reddit optionally accepts local `SGET_REDDIT_TOKEN`. Public GitHub Actions workflows may test **public sample URLs only**, without user session credentials. See [provider development](docs/provider-development.md) for scope.

## Limitations and licensing

This project is independent of Instagram/Meta, Patreon and other platforms. Signed media URLs expire. Content permissions and applicable rights remain the user's responsibility. The CLI supports progressive media while the Instagram extension also includes its existing DASH muxing behavior. MIT license: see [LICENSE](LICENSE) for upstream attribution.
