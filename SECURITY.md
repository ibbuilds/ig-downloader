# Security policy

## Reporting

Do not publish cookies, access tokens, private media URLs, personal data or usable exploit details in public issues, PRs or logs. Use the repository's **Security -> Report a vulnerability** channel when it is enabled. If that private channel is unavailable, ask the maintainer for a private reporting route without disclosing the vulnerability itself. No private email address or reporting feature is assumed to exist.

Include the affected version/commit, a minimal sanitized reproduction, impact, and suggested mitigation. There is no guaranteed response time. Ordinary site breakage belongs in a provider bug report, not a security advisory.

## Supported scope

Security fixes target the current main branch and latest reviewed release, not every historical tag. Use a maintained Node.js LTS release (22 or 24 at the October 2026 review). Node 20 compatibility tests do not make that end-of-life runtime security-supported. Browser extension runtime must also be kept current.

## Trust boundaries

- Explicitly loaded provider plugins run arbitrary JavaScript with the user's local permissions. They are not sandboxed; review and pin trusted code. A URL allowlist is not a sandbox for malicious plugins.
- Treat cookies as credentials. Do not commit cookie exports or include them in distributions. Never pass one platform's session to an unrelated adapter or CDN.
- Validate every selected download URL and redirect with the provider's policy. Prefer explicit HTTPS host allowlists, not arbitrary URL downloads. Do not disable checks merely to make a fixture pass.
- Tests on pull requests must be offline and secret-free. Authenticated live workflows run only trusted default-branch code. Never switch them to `pull_request_target` and then check out an untrusted PR.
- Release packages use explicit inclusion lists. Packaging checks verify required notices, disallow common credential files, install the CLI offline, and check deterministic extension output. These checks are not a substitute for review of file contents.

## Known limitations

Media signatures detect common wrong-type responses, not every corrupt file. A poster is not proof of an original uploaded photograph. The browser integration and third-party site endpoints require live acceptance tests in addition to static checks. Publication does not guarantee access to restricted content or grant rights to media.
