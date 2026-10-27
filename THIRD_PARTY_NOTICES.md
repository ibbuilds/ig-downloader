# License and attribution notices

The engine, CLI, provider SDK and original browser extension are distributed under the MIT license in [LICENSE](LICENSE). The original copyright notice is retained without modification. The current project builds on **hoaianle/Instagram-Downloader**, https://github.com/hoaianle/Instagram-Downloader. Independent development or detaching GitHub's fork relationship does not remove this attribution or change the license.

## Vendored browser components

| Component | Included files | License notice |
|---|---|---|
| js-cookie 3.0.8 | `lib/js.cookie.min.js` | MIT; full upstream notice in `lib/js.cookie.LICENSE` |
| MP4Box.js | `lib/mp4box/` | Full upstream notice in `lib/mp4box/LICENSE`; retain it with all vendored chunks |

The js-cookie notice is copied from https://github.com/js-cookie/js-cookie/blob/v3.0.8/LICENSE. Vendored source headers and notices must not be removed. The extension ZIP includes both notices and this inventory. The CLI tarball does not bundle these browser-only libraries.

No third-party runtime npm dependencies are declared. This does not imply that the vendored browser code has been comprehensively audited. New dependencies or copied components require their own license review and notices before distribution.
