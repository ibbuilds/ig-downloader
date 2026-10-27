# Governance and maintenance

## Scope and ownership

This is a public, MIT-licensed, independently developed resource extraction engine. The repository owner `@ibbuilds` is the current core maintainer. The repository URL and Git history are kept intact; GitHub fork-network status is a separate administrative property.

The core maintainer owns the CLI, provider contract, security policies, packaging, CI and compatibility. Provider contributors own site-specific behavior. Accepting a provider does not promise perpetual compatibility with that website. Only Instagram is currently built in; other adapters are community contributions, not promised support.

## Decisions and changes

Use a focused branch and PR. Describe the problem, tests, compatibility impact and any new network destinations. Core/security changes require maintainer review. CODEOWNERS requests reviewers but does not enforce approval by itself; enforcement requires repository rules. No PR may use untrusted code with live credentials. Keep the existing aliases and resource-provenance semantics unless a breaking change is explicitly documented.

Merges require passing core, provider and packaging checks for the reviewed head. A maintainer may document an exceptional override, but must not describe failing or skipped checks as passing. Releases are initially drafts; publication is a separate decision after reviewing the artifacts and known limitations.

## Provider lifecycle

Provider documentation declares `experimental`, `maintained`, `broken`, or `unmaintained`, with supported content types and evidence. A fixture pass is not a live-health result. A live failure should include a sanitized diagnosis and the last successful check, not expose credentials or private URLs. An unconfigured live check means **not verified**, not healthy. Contributors can repair an adapter through a PR; unmaintained adapters may be retired without changing the core API.

## Contributions and attribution

Contributions are accepted under the repository's MIT license; retain upstream and vendored notices. Do not copy code you cannot license consistently. See CONTRIBUTING.md and THIRD_PARTY_NOTICES.md. Be respectful in reviews; harassment, credential disclosure and malicious submissions are not acceptable. Maintainers may close unsafe, unrelated or abusive submissions.

## Service expectations

Maintenance is best effort. There is no response-time guarantee, uptime commitment or promise to bypass platform restrictions. The software is provided under the warranty disclaimer in LICENSE.
