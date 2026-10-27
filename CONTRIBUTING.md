# Contributing

This project maintains a small, stable **extraction core** and provides procedures for community-owned site adapters. Instagram is the first supported provider and must keep working as changes land.

## Before opening a PR

1. Choose a focused issue: `core`, `cli`, `extension`, or a named `provider`.
2. Use `npm run create:provider -- id` only if adding a new site; finish every generated TODO and failing fixture.
3. Run `npm run check`, `npm run check:providers`, and `make format-check` locally (format only relevant files with `make format` when needed).
4. Add regression tests for all modified behavior. For a provider, include sanitized representative fixtures, failure cases, provenance and URL/redirect policy checks.
5. Use the PR template to record scope, verification, and limitations. Never claim live functionality solely from mocked tests.

## Architecture rules

- **Do not rewrite working code** or remove existing Instagram extension/CLI features without a regression test and migration plan.
- Keep website-specific scraping, session logic, content models and host allowlists inside the provider. The CLI must not gain site-specific branches.
- Never fetch arbitrary user-supplied URLs directly. Each provider must validate HTTPS and exact permitted resource domains; CDN redirects must remain constrained.
- Do not include private media, active cookies, secrets, signed URLs or identifiable third-party content in fixtures or PR discussion.
- Official APIs are not required for every extractor, but the tool does not bypass login/access restrictions, payment systems or DRM.
- Keep third-party plugins explicit and review their security implications; installed provider code can execute arbitrary JavaScript.
- Avoid fragile DOM selectors in browser extensions and unnecessary dependencies in the core.

## Maintenance and CI

`CI` reports core/CLI/extension stability. `Provider checks` reports each site's offline regression tests separately. Each provider has a scheduled/manual `<id>-live.yml` that **skips** when no test URL is configured, rather than presenting fake success. Live credentials never run in untrusted PR workflows.

Provider READMEs declare one of `maintained`, `experimental`, `broken` or `unmaintained`. Community members can repair their own providers by PR. Core maintainers review the stable interface, security and release process, not perpetual support for every site.

Read [provider-development](docs/provider-development.md), [architecture](docs/architecture.md), and [runtime decision](docs/adr/0001-runtime.md) before implementing a new provider.
