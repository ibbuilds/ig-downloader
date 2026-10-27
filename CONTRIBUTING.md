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

`CI` reports core/CLI/extension stability. `Provider checks` reports each site's offline regression tests separately. Each provider has a scheduled/manual `<id>-live.yml` that **skips** when no test URL is configured, rather than presenting fake success. The repository live workflows accept only public sample URLs, with no private account credentials. Contributors perform any authenticated tests on their own machines; private sessions must never enter repository settings, PR workflows, or fixtures.

Provider READMEs declare one of `maintained`, `experimental`, `broken` or `unmaintained`. Community members can repair their own providers by PR. Core maintainers review the stable interface, security and release process, not perpetual support for every site.

Read [provider-development](docs/provider-development.md), [architecture](docs/architecture.md), and [runtime decision](docs/adr/0001-runtime.md) before implementing a new provider.

## Open-source and release review

All contributions remain MIT-licensed; retain upstream and vendored notices. Run `npm run check:package` after changing runtime files, assets or the package allowlist. Review GOVERNANCE.md, SECURITY.md and docs/releases.md. Public PRs must never need session secrets. Repository feature settings are separate from committed templates; see docs/repository-independence.md.

## Complete PR and branch lifecycle

1. Start focused work in a descriptive short-lived branch based on up-to-date `main`. Do not use `main` as a development branch.
2. Open **one PR per coherent change**. Attach regression tests, describe how behavior was verified, and request the appropriate review. Repair failing CI on **the same branch and PR**; do not accumulate replacement PRs.
3. Merge only after required CI and review. Verify the resulting `main` workflow before calling the work finished. If a PR cannot proceed, close it with a documented reason.
4. Delete the merged head branch. The trusted `Clean merged branches` workflow automatically prunes **only** internal branches whose current SHA equals the head SHA recorded on a merged PR, and skips open PRs and the default branch. A failed cleanup job must be investigated rather than called a success.
5. Retire abandoned branches after their work is either incorporated or explicitly closed. Direct commits to `main` are exceptional hotfixes only, with documented justification and immediate verification.

The workflow is not a replacement for protecting `main`: configure repository rules to require PR reviews and CI checks (see `docs/repository-independence.md`).
