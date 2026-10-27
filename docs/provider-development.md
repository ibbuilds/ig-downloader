# Contributing an extractor

**One reliable provider is better than ten placeholders.** All contributors follow the same procedure; there is no requirement that core maintainers indefinitely repair third-party sites.

## Create the adapter

```sh
npm run create:provider -- example
```

This creates `providers/example/index.js`, `tests/providers/example.test.js`, `providers/example/README.md`, and `.github/workflows/example-live.yml`, then registers the provider in `providers/registry.json`. The generated provider deliberately contains TODOs and a **failing** fixture test until completed.

Implement the five required methods:

| Method | Responsibility |
|---|---|
| `match(input)` | Match the site's actual hostnames, not arbitrary substrings |
| `parse(input)` | Parse/validate the target and its content type |
| `resolve(target, context)` | Return `{ items, username? }` using the site's own response formats |
| `select(item, mode)` | Return a media resource with explicit origin/provenance, or `null` |
| `validateUrl(url)` | Allow only explicitly trusted HTTPS media hosts, including redirects |

`createSession(context)` is optional for batching/caching session setup. See the contract in `types/provider.d.ts` and the existing adapter in `providers/instagram/index.js`.

The recommended runtime is plain Node.js 20+ CommonJS. No TypeScript compilation is required. Use JSDoc/`.d.ts` types when helpful; do not add dependencies merely for boilerplate.

## Test it

```sh
npm run check:provider -- example
npm run check:providers
npm run check
```

Provider fixture tests belong under `tests/providers/`; the core suite deliberately excludes this folder. Every provider PR must cover recognized and rejected hosts, representative saved responses, media selection/provenance, inaccessible/private/expired resources, errors, and its HTTPS allowlist (including unsafe redirects). Mocks must contain no real session secrets or private third-party content.

The `Provider checks` workflow dynamically creates an independent job for every registered provider. A contributor does not need to add another CI matrix entry by hand.

## Live checks and ownership

The scaffold also creates `<provider>-live.yml`, scheduled weekly and manually runnable. The optional GitHub public-only check accepts a non-sensitive `public_url` value via manual dispatch, or the `SGET_EXAMPLE_PUBLIC_TEST_URL` repository variable for scheduled smoke checks. **Do not configure session credentials in repository secrets.** Tests needing login should run on the contributor’s own device using their own session. An unconfigured live job is **skipped, not validated**. Live checks only test resource resolution/selection, not the complete download.

Your provider README must disclose its supported resource types and a status: `maintained`, `experimental`, `broken` or `unmaintained`. Contributors can propose fixes via focused PRs. Maintainers review security and contract compliance but do not promise that every provider will keep working forever.

## Optional external packages

A provider does not have to be built into this repository. Export the same CommonJS object (or `{ provider }`) from a local file or installed package and load it explicitly:

```sh
sget --plugin ./my-provider.js 'https://site.example/post/123'
```

Third-party plugins run arbitrary code within the CLI process. This command is a trust decision. We do not automatically discover or execute packages from the internet.

## User-controlled session inputs

Session information belongs on the user device, not in public source, repository Actions or issue fixtures. Built-in non-Instagram site adapters read a locally set `SGET_COOKIE_PROVIDER` value (e.g. `SGET_COOKIE_FACEBOOK`) or a single-provider `--cookie-file` with a raw Cookie header. The Reddit adapter can use user-local `SGET_REDDIT_TOKEN` when OAuth is available. Instagram still supports `IG_COOKIE`. Never embed credentials in adapters, template files, PRs or CI workflows. Public metadata is often all that can be extracted without a logged-in session.
