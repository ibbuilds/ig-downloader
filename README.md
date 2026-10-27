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

### Fast commands: `igd`

`npm link` installs both commands: **`igd`** (recommended) and the backwards-compatible **`ig-downloader`**. No alias configuration or extra package is needed. The CLI reports version **0.2.0**; the browser extension retains its independent manifest version.

```sh
igd 'https://www.instagram.com/reel/SHORTCODE/'             # download
igd get 'https://www.instagram.com/p/SHORTCODE/' -o ./media
igd urls 'https://www.instagram.com/stories/example/1234567890/'
igd inspect 'https://www.instagram.com/stories/example/1234567890/' --json
igd 'https://www.instagram.com/reel/SHORTCODE/' -m video -j 4
igd get URL1 URL2 URL3 -j 8 -o ./downloads                # batch
igd get --input-file links.txt --json                       # file batch
cat links.txt | igd get - -q                                # stdin / shell pipeline
igd providers                                               # installed providers
igd --help
```

Subcommands are optional: `igd URL` downloads media; `get`, `urls`, `inspect` and `providers` are explicit alternatives. Legacy flags `--url-only` and `--dry-run` remain available. Short options include `-m` (mode), `-o` (output), `-j` (concurrency), `-f` (input file), and `-q` (quiet).

For batches, use multiple targets or a UTF-8 file with one URL/username per line. Blank lines, lines beginning with `#` and repeated targets are skipped. `-` reads stdin; the maximum batch size is 2,000 distinct targets. GraphQL resolution uses at most three workers, while `-j` bounds total CDN downloads to 1–8 transfers. The default is 4, adjustable downward if Instagram limits requests. Downloads start when a target resolves, rather than waiting for the entire batch; a global FIFO limiter keeps CDN concurrency bounded and backpressure reduces the time signed URLs sit in memory.

`--json` emits the established single-target shape on success and a `{version, results, errors}` envelope for batches or per-target resolution failures. Failures return a nonzero exit code while other batch items continue. `igd urls --json` returns media metadata rather than mixing raw URL lines with JSON output.

The default mode is **image** for Stories/highlights and **auto** for posts/Reels. `image` **never silently downloads an MP4**. Select `auto` to download the original Story media type. `--mode video` prefers video but uses the still image if no video is present.

Direct links are short-lived signed CDN URLs. `inspect` does not download media. Repeated Stories from the same account share session setup and matching Instagram API responses within one command, reducing duplicate requests.

### Authentication and permissions

Instagram does **not** promise anonymous CLI access to Stories. Only download content you are allowed to view. If you have legitimate access, the CLI can use your existing session cookies; it does not bypass Instagram logins or private profiles.

Export your **own** cookies for `instagram.com` as a Netscape cookies.txt, or a plain `Cookie: name=value; name=value` line. Then:

```sh
igd 'https://www.instagram.com/stories/example/1234567890/' --cookie-file /path/to/cookies.txt
```

Alternatively set `IG_COOKIE` to your Cookie header value in your environment. Treat sessions as secrets: never commit cookies, post them to issue trackers, or share them with others. **The tool does not log cookie values or send them to third-party download servers.** They are only supplied to Instagram's own session/API endpoints, never to the CDN.

The CLI uses the Instagram web GraphQL queries used by the upstream extension, which Instagram can change without warning. `403`, `429` or unrecognized GraphQL responses are surfaced as errors rather than misreported as successful downloads. No claim of universal or permanent compatibility is made.

### Offline/testing input

To process a saved (authorized) Instagram API response instead of requesting the live API:

```sh
igd inspect --input-json path/to/instagram-response.json --json
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

`npm run check` runs offline unit/integration tests, validates core JavaScript syntax, and statically checks the extension's content scripts, manifest assets, and web-accessible resources. It does **not** verify live Instagram requests or load the extension in Chrome.

CI uses GitHub-hosted Ubuntu, Windows and macOS runners for Node.js 20 and 22; no self-hosted runner needs to be installed. The workflow supports pushes, pull requests and manual dispatch. The repository's Actions workflows are enabled; the current `main` CI matrix has passed. The real Instagram website and authenticated sessions require separate live acceptance testing.

- `shared/media.js` — deterministic shared image/video selector.
- `lib/instagram.js` — Instagram session requests and response parsing.
- `lib/targets.js` — strict Instagram URL parsing.
- `lib/providers.js` — explicit provider registry (Instagram only today).
- `lib/download.js` — safe streaming CDN download.
- `bin/ig-downloader.js` — CLI argument handling and output.
- `tests/` — unit and CLI tests with mocked Instagram/CDN traffic (no live credentials needed).

## Extensible providers

The provider registry keeps platform-specific URL parsing, authentication, and media resolution separate from CLI orchestration. **Only Instagram is implemented.** Patreon is a potential future integration through its supported API v2/OAuth permissions. OnlyFans is **not** an implemented provider; unofficial endpoints, paywall bypass and DRM circumvention are not part of this tool. Any future adapter must validate authorized access and safe download origins rather than reusing Instagram's CDN allowlist.

## Limitations

- Instagram may modify GraphQL document IDs, Story payloads, or CDN behavior at any time.
- Private and restricted media remain subject to your actual account permissions.
- Story IDs can expire or disappear from Instagram's accessible response.
- Video Story posters may not contain edits/music or be the original photo.
- The CLI saves available progressive video resources. The extension retains its higher-quality DASH muxing capability.
- This is an independent community fork, not affiliated with Instagram or Meta.

## License

MIT. See [LICENSE](LICENSE), including upstream copyright attribution.
