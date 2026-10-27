# Architecture: small core, independent providers

The repository is a modular extraction engine with **Instagram as the maintained reference provider**. Reddit supports posts/galleries from available JSON with a clearly labeled metadata fallback. Facebook, TikTok, X/Twitter and Pinterest have experimental public-metadata adapters; `web` is the last-resort HTTPS page/direct-media fallback. Other providers can be contributed separately.

## Runtime boundaries

1. **CLI** (`bin/ig-downloader.js`) parses actions (`get`, `urls`, `inspect`), input, batch scheduling, exit codes and JSON reports. `sget` is the neutral executable. `igd` and `ig-downloader` remain aliases.
2. **Registry** (`core/provider.js`, `lib/providers.js`) matches input and selects exactly one provider. Ambiguous targets are errors. Built-ins come from `providers/registry.json`; external providers execute **only** when passed with `--plugin`.
3. **Provider** (`providers/<id>/index.js`) matches/parses its website, resolves website-specific records, selects a normalized media resource and validates download origins. Providers do not own the CLI, file naming or scheduling.
4. **Core validation** (`core/provider.js`, `core/url-policy.js`, `core/public-http.js`) enforces the resource shape, bounded HTML responses, and HTTPS URL rules. The fallback adapter rejects private/IP-literal hosts but is not designed as a hardened shared web-crawling service. URL validation is repeated at **every** CDN redirect in `lib/download.js`.
5. **Downloader** (`lib/download.js`) streams media with MIME/signature checks, a 500 MB cap, unique names and cleanup on error. The CLI overlaps resolution and downloads with bounded concurrency.
6. **Instagram browser extension** remains a separate optional integration using `shared/media.js`; it is not modified by new providers. Instagram's existing CLI client lives in `lib/instagram.js` until a separately tested migration makes sense.

## Normalized resource

Each adapter returns `{ items, username? }` from `resolve()` and converts individual items in `select(item, mode)` into a resource:

```js
{
  id: '123',
  url: 'https://approved-cdn.example/resource.jpg',
  isVideo: false,
  sourceKind: 'image',  // or 'video-poster', etc.; always disclose provenance
  format: 'jpg',
  width: 1080,
  height: 1920,
}
```

The concrete interface is documented in `types/provider.d.ts`. We use CommonJS and JSDoc-compatible type declarations so a new adapter needs no build step or additional runtime dependency.

## Security and extension policy

- Built-in providers are code-reviewed. `--plugin` executes local/package JavaScript with the user's account privileges and is **opt-in**; install only code you trust.
- No arbitrary URL should be downloaded. Providers must validate HTTPS and exact CDN domains/suffixes; redirects are revalidated. The generic `createUrlPolicy()` helper avoids domain-substring matching bugs.
- Never commit cookies, private responses, session tokens or signed personal media URLs. Mock tests use synthetic fixtures.
- The framework handles content available to the requesting session; it does not imply that authorization checks, paywalls or DRM can be bypassed.
- An extractor can remain marked experimental, broken or unmaintained without compromising the independently tested core.

## Maintenance contract

**Core maintainers** own CLI behavior, provider contracts, security checks, tests and packaging. **Provider contributors** own website-specific extraction and their fixtures, with reviewers confirming compatibility. A site changing its response format is a provider failure, not proof the generic engine is broken.

## CI classification

- `CI`: core cross-platform checks for Node 20/22/24 plus extension asset/syntax checks.
- `Provider checks`: separate matrix jobs such as `Provider / instagram`. New built-ins are discovered from the registry; one adapter failure does not cancel others.
- `<provider> live resolution`: weekly and manual **public-only** checks. No repository credentials or private test URLs are required. **Skipped means unconfigured**, not passing. Authentication-dependent checks belong on the end user’s machine. These checks validate current resource selection, not complete downloaded bytes.
- `Release`: packaging/version checks. Live checks are *not* run with secrets on untrusted pull requests.

## What is not implemented

A metadata page is not the same thing as a platform-native full archive. No generic JavaScript rendering, profile crawling, complete adaptive video muxing, protected-resource access, or all-sites guarantee exists. Provider fixtures prove parsing of known response shapes; they are not live acceptance. Reddit video fallback URLs may omit audio. YouTube currently reaches the generic metadata fallback, which does **not** claim the original YouTube stream.
