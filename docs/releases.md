# Releases and distribution

## Build and verify

Use a maintained Node.js LTS release (24 recommended; 22 supported).

```sh
npm run check
npm run check:providers
npm run check:package
npm run pack:release
```

The last command writes a CLI `.tgz`, a deterministic `sget-extension-VERSION.zip`, and `SHA256SUMS` under `dist/`. The tarball uses an explicit file list; the extension ZIP includes only manifest resources and required license notices. No live credentials, response fixtures or test mocks are distributed. Inspect package contents before release; do not treat filename checks as a complete secret scanner.

Install the downloaded CLI tarball with `npm install -g ./ig-downloader-0.4.0.tgz`; all three aliases (`sget`, `igd`, `ig-downloader`) are installed. Unzip the extension artifact and load the resulting folder through Chrome/Edge's unpacked-extension UI. Verify SHA-256 checksums before installing artifacts obtained outside the trusted release page.

## Independent version streams

- `cli-v0.4.0` validates against `package.json`.
- `extension-v6.1.0` validates against `manifest.json`.
- Legacy `v6.1.0` tags remain extension-only; they never stand for CLI versions.

A mismatch fails without deleting or moving any tag. Bump the extension version before its next release, even if the changes are only packaging or notices, if that version has already been distributed.

The Release workflow can also be run manually to build a snapshot artifact without creating a GitHub release. A matching tag builds and tests the source, then creates a **draft** release with both independently versioned artifacts and checksums. Tags do not automatically publish a stable release or upload anything to npm. Keep `private: true` until npm ownership, package naming and a deliberate registry-release process have been configured.

## Acceptance gate

Before publishing a release, verify a clean install on Linux, Windows and macOS, extension startup in a real browser, real media downloads for supported Instagram content, unavailable/private/expired-item errors, and image-versus-poster provenance. Record test conditions without leaking session data. Unit fixtures and CI packaging checks alone are not live acceptance evidence. An unconfigured live workflow remains **not verified**.

## Ownership

The repository owner reviews drafts, notices, checksums, compatibility notes and known limitations. Never rewrite the repository or erase PR history to prepare a release. See repository-independence.md for the separate fork-network issue.
