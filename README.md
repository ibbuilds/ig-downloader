# ig-downloader

A cross-platform Instagram media downloader: **browser extension + Node.js CLI**, with the same shared media-selection logic.

> Forked from [hoaianle/Instagram-Downloader](https://github.com/hoaianle/Instagram-Downloader) (MIT). Original license and copyright are preserved in [LICENSE](LICENSE).

## Why this fork

- **Image-first Stories:** saves Instagram's largest available image response instead of blindly saving an MP4.
- **Transparent:** choose `image`, `auto`, or `video`, inspect the exact CDN URL, and see the `sourceKind` (`image`, `video`, or `video-poster`).
- **Cross-platform:** Node.js 20+ terminal support on Linux, macOS and Windows without shell-specific dependencies.
- **Fast:** direct CDN download, bounded concurrency, streaming (no buffering full files in RAM), unique file names.
- **Careful:** HTTPS CDN allowlist, media MIME checks, bounded file sizes, no hard-coded account credentials, and no silent fallback from image to MP4.

**Important:** Image resources attached to video Stories can be posters/previews, not the original uploaded picture. Instagram usually strips original EXIF/GPS data. No tool can reconstruct the uploader's original file from a compressed video or poster.

## CLI

Requires Node.js 20 or newer.

```sh
git clone https://github.com/ibbuilds/ig-downloader.git
cd ig-downloader
npm link
```

### Examples

```sh
ig-downloader 'https://www.instagram.com/stories/example/1234567890/'
ig-downloader 'https://www.instagram.com/stories/example/1234567890/' --mode image
ig-downloader 'https://www.instagram.com/stories/highlights/1234567890/' --output downloads
ig-downloader 'https://www.instagram.com/p/SHORTCODE/' --mode auto
ig-downloader 'https://www.instagram.com/reel/SHORTCODE/' --mode video
ig-downloader '@example' --url-only
ig-downloader 'https://www.instagram.com/stories/example/1234567890/' --dry-run --json
```

The default mode is **image** for Stories/highlights and **auto** for posts/Reels. `image` **never silently downloads an MP4**. Select `auto` to download the original Story media type. `--mode video` prefers video but uses the still image if no video is present.

`--url-only` prints signed, short-lived CDN media links; `--dry-run` prints provenance/size without saving; `--json` prints machine-readable results. `--concurrency 1..4` controls parallel downloads (default 2).

### Authentication and permissions

Instagram does **not** promise anonymous CLI access to Stories. Only download content you are allowed to view. If you have legitimate access, the CLI can use your existing session cookies; it does not bypass Instagram logins or private profiles.

Export your **own** cookies for `instagram.com` as a Netscape cookies.txt, or a plain `Cookie: name=value; name=value` line. Then:

```sh
ig-downloader 'https://www.instagram.com/stories/example/1234567890/' --cookie-file /path/to/cookies.txt
```

Alternatively set `IG_COOKIE` to your Cookie header value in your environment. Treat sessions as secrets: never commit cookies, post them to issue trackers, or share them with others. **The tool does not log cookie values or send them to third-party download servers.** They are only supplied to Instagram's own session/API endpoints, never to the CDN.

The CLI uses the Instagram web GraphQL queries used by the upstream extension, which Instagram can change without warning. `403`, `429` or unrecognized GraphQL responses are surfaced as errors rather than misreported as successful downloads. No claim of universal or permanent compatibility is made.

### Offline/testing input

To process a saved (authorized) Instagram API response instead of requesting the live API:

```sh
ig-downloader --input-json path/to/instagram-response.json --dry-run --json
```

Do not publish raw API responses containing private content or session data.

## Extension

1. Clone/download the branch from this repository.
2. Chrome/Edge → `chrome://extensions` → Developer mode → **Load unpacked** → choose the repository folder containing `manifest.json`.
3. Open Instagram and select **Downloader settings** in the sidebar.
4. Choose **Story media format**: *Image first* (default), *Original type*, or *Prefer video*.
5. Use the existing inline Story/post controls or legacy panel.

All original post, Reel, ZIP, filename-template and video-quality controls remain. The image-first Story setting is stored locally as `igDownloaderStoryMediaMode`.

The browser extension and CLI share `shared/media.js`. That selector picks the highest-resolution image candidate from `image_versions2` (or the best video from `video_versions`) and records whether an image came from a video Story.

## Development

```sh
npm test
npm run check
```

- `shared/media.js` — deterministic shared image/video selector.
- `lib/instagram.js` — Instagram session requests and response parsing.
- `lib/targets.js` — strict Instagram URL parsing.
- `lib/download.js` — safe streaming CDN download.
- `bin/ig-downloader.js` — CLI argument handling and output.
- `tests/` — unit tests (no live Instagram credentials or network required).

## Limitations

- Instagram may modify GraphQL document IDs, Story payloads, or CDN behavior at any time.
- Private and restricted media remain subject to your actual account permissions.
- Story IDs can expire or disappear from Instagram's accessible response.
- Video Story posters may not contain edits/music or be the original photo.
- The CLI saves available progressive video resources. The extension retains its higher-quality DASH muxing capability.
- This is an independent community fork, not affiliated with Instagram or Meta.

## License

MIT. See [LICENSE](LICENSE), including upstream copyright attribution.
