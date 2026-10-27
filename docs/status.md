# Project status and release gates

Reviewed: 2026-10-27. This file describes **test evidence and remaining boundaries**; it is not a claim that every supported website works today.

## Implemented and covered by automated tests

- Sget CLI (`sget`), preserving `igd` and `ig-downloader`; direct URLs, mixed batches, stdin/files, JSON inspection, configurable concurrency and output folders.
- An opt-in download archive stores SHA-256 resource identities. Successful concurrent requests share a single transfer; **failed concurrent duplicates share the failure**, and later operations may retry. The archive represents download history, not a guarantee the file still exists at a later output location.
- Images/video/audio supported by the progressive-stream downloader, with MIME/signature checks, length/size bounds, safe file naming, redirect and per-provider URL validation. Adaptive/DASH/HLS support is **not** a general CLI capability.
- Built-in adapters: Instagram, Reddit, Facebook, TikTok, X/Twitter, Pinterest, YouTube and generic public HTTPS. These have independent **synthetic fixture** tests; they are not equally capable. The generic public HTML mode can inspect Open Graph metadata and scan visible image/video tags, including responsive `srcset`, lazy-loaded images and posters. Its bounded crawler only follows links on the starting origin.
- Plugin SDK and scaffold, contributor instructions, MIT upstream/vendored attribution, deterministic packages and release-draft workflows. No third-party runtime dependencies.
- Core CI on Ubuntu, macOS and Windows across supported and legacy Node versions, per-adapter offline tests, release package checks and automated cleanup of fully merged PR branches.

## Not verified as production-ready

- **Live website changes:** No green fixture run proves a current Instagram, Facebook, TikTok, Reddit, X, Pinterest or YouTube media endpoint works in production. Real-world authenticated behavior must be checked on a user's own machine when applicable, with their own credentials. Credentials must not be committed to the repository or submitted in PRs.
- **Browser:** The original Instagram extension remains site-specific. Offline extension assets/syntax tests do not prove current Chrome interactions work.
- **Completeness:** YouTube adaptive/ciphered tracks, platform-specific whole-account pagination, protected media and arbitrary JavaScript-rendered pages are outside the current contract. Experimental providers may yield previews, posters, or no result.
- **Performance:** Targeted optimizations exist (streaming, request caching, bounded concurrency and an indexed FIFO). No comprehensive real-world startup/network/memory benchmark establishes globally optimal performance. Measure before making stronger claims or rewriting the runtime.
- **Security:** This is a local CLI. Public-hostname checks and per-provider allowlists are not a complete defense against DNS rebinding for a public server that accepts untrusted URLs. Do not expose it as an unaudited multi-tenant scraping service.
- **Distribution:** GitHub is public and MIT licensed, but still in the upstream fork network. CLI package publication and a stable release are separate decisions; `private: true` prevents accidental npm publication.

## Repository-owner configuration, not a code problem

At the audit, Issues and Discussions were disabled, `main` had no protected-branch/ruleset requirement, and GitHub did not automatically delete merged branches. An existing trusted workflow now prunes exact-match merged branch heads after pushes to `main`; it **does not** replace the need for enforced PR/CI rules. Enable Issues, consider Discussions and private security reports, and require reviewed PRs plus CI through repository settings. Fork detachment is optional and may discard GitHub metadata; retaining the fork marker does not prevent open-source development.

## Release decision

The **framework/SDK and offline CI can be maintained as a usable 0.x project**. Do not label all eight provider integrations stable. A major/stable public release requires repeatable end-to-end downloads for the content types it promises, a real browser-extension smoke test if shipping the extension, review of security and package artifacts, and repository merge protections. Record platform-specific failures and limitations independently; do not hold the core hostage to experimental third-party endpoints.
