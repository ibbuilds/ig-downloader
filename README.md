# Social resource extraction engine

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
cat links.txt | sget
```

`sget` is the platform-neutral command. `igd` and `ig-downloader` continue working with exactly the same options. Short options: `-u` URLs, `-n` preview, `-a` auto/original type, `-i` image only, `-V` prefer video, `-m` media mode, `-f` input file, `-j` concurrency, `-J` JSON, `-q` quiet. Batch requests deduplicate input and use shared command-scoped session/cache and globally bounded downloads.

**Current support: Instagram only.** Stories, Highlights, Posts, Reels and account-scoped Stories use the existing web GraphQL implementation; it can change without warning. Image mode on a video Story may yield a poster, not the photographer's original file. Respect login and content-access restrictions. User-supplied cookies are secrets and must not be posted to issues or committed.

The browser extension is still Instagram-specific: load unpacked at `chrome://extensions` using the repository folder containing `manifest.json`. Original inline buttons, ZIP, quality controls and filename templates are retained. CLI/extension media selection continues sharing `shared/media.js`.

## Add another platform

```sh
npm run create:provider -- example
npm run check:provider -- instagram
npm run check:providers
sget --plugin ./my-provider.js 'https://site.example/post/123'
```

Contributors implement a small adapter (`match`, `parse`, `resolve`, `select`, `validateUrl`) rather than duplicating the CLI/downloader. Site-specific origins and redirects are validated by provider policy. External packages are explicitly enabled with `--plugin` and **run arbitrary local JavaScript**; load only code you trust. Generated scaffold tests intentionally fail until implemented.

The framework **does not** mean Patreon, OnlyFans, TikTok, etc. are currently supported. Site adapters must be built and tested independently; accessing restricted media or bypassing DRM is not supplied by the core.

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
- `<provider> live resolution`: separate scheduled/manual workflow; **skipped until an accessible test URL is configured**. Checks current extraction and URL selection but not download bytes. Live secrets never run on untrusted PRs.
- `Package checks`: cross-platform offline installation and reproducible ZIP smoke tests.
- `Release`: separate CLI/extension tag validation, artifacts and checksums; tagged builds create drafts, never automatic npm publication.

Core maintainers maintain common actions, contracts, URL safety and packaging. Provider contributors maintain individual site behavior via focused PRs. An external site breaking should be reported independently rather than described as core failure. Provider READMEs state `maintained`, `experimental`, `broken` or `unmaintained`.

## Limitations and licensing

This project is independent of Instagram/Meta, Patreon and other platforms. Signed media URLs expire. Content permissions and applicable rights remain the user's responsibility. The CLI supports progressive media while the Instagram extension also includes its existing DASH muxing behavior. MIT license: see [LICENSE](LICENSE) for upstream attribution.
