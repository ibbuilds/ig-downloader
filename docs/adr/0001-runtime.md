# ADR 0001: Node.js + typed JavaScript for Provider SDK v1

**Status:** accepted (October 2026)

## Decision

Keep Node.js 20+ and the existing CommonJS JavaScript implementation. Add runtime provider contract validation, type declarations (`types/provider.d.ts`) and interface-focused tests. Avoid a Python, Rust, or TypeScript rewrite for SDK v1.

## Rationale

- Network latency, platform throttling and media transfer dominate the typical extractor. Changing languages alone would not remove those costs.
- Node.js already supports our streaming downloads and parallel requests on Windows, macOS and Linux, with zero external runtime dependencies.
- The Instagram browser extension shares selection logic with the CLI; keeping JavaScript avoids maintaining a duplicate implementation.
- A small provider interface is inexpensive to read and implement, saving contributor effort and AI coding context compared with a large abstraction or build toolchain.
- Runtime shape checks and per-provider fixture tests directly protect the plugin boundary. TypeScript can be introduced selectively if a measurable need arises.

## Revisit when

Profiling shows a sustained CPU bottleneck in media processing, or contributors need static checking across a larger plugin ecosystem. Prefer moving a measured hotspot to a native library rather than rewriting the whole downloader.
