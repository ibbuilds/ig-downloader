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

### Quick CLI: one command

Run `npm link` once to install **`igd`** (recommended) and the backwards-compatible **`ig-downloader`**. No custom shell alias or additional dependency is required. `igd` accepts a URL, several URLs, or an accessible Instagram username directly.

| Goal | Command |
|---|---|
| Download a Post, Reel, Story or Highlight | `igd URL` |
| Download multiple links | `igd URL1 URL2 URL3` |
| Get direct media URLs (no download) | `igd -u URL` |
| Preview metadata and provenance | `igd -n URL` |
| Get JSON preview | `igd -nJ URL` |
| Keep original media type for Stories | `igd -a URL` |
| Images only (video Stories may yield posters) | `igd -i URL` |
| Prefer video | `igd -V URL` |
| Download to a folder | `igd URL -o ./media` |
| Bounded parallel transfers | `igd URL1 URL2 -j8` |
| Batch from file | `igd -f links.txt` |
| Batch from a shell pipe | `cat links.txt | igd` |

For example:

```sh
igd "https://www.instagram.com/reel/SHORTCODE/"
igd "https://www.instagram.com/stories/example/1234567890/" -a
igd -u "https://www.instagram.com/p/SHORTCODE/"
igd -nJ "https://www.instagram.com/p/SHORTCODE/"
igd -f links.txt -o downloads -j4
cat links.txt | igd -q
```

Short flags: `-u` URLs, `-n` inspect, `-a` auto/original type, `-i` image, `-V` prefer video, `-o` output, `-j` concurrency, `-f` input file, `-J` JSON, `-q` quiet. Flags may follow or precede URLs. Compact forms such as `-j8`, `-mi` and `-nJ` work. Lowercase `-v` still displays the version; uppercase `-V` selects video.

**Defaults:** Stories and Highlights use image mode (which may return a video poster, *not* the original photograph); Posts and Reels preserve their original media type. `-m i`, `-m a` and `-m v` are shorthand for the full names. Conflicting media modes are rejected.

The original `get`, `urls` and `inspect` subcommands, together with legacy `--url-only`, `--dry-run` and `--json`, remain supported. For scripts, `--input-json FILE` processes a saved authorized Instagram API response without calling the live API.

A UTF-8 target file contains one URL or username per line. Empty lines, lines starting with `#` and duplicate targets are ignored (maximum 2,000 unique targets). Piped stdin needs no `get -` argument; explicit `igd -` remains supported. Target resolution uses up to three workers and `-j` limits total CDN transfers to 1–8 (default: 4). Successful single-target JSON preserves the established schema; batches return a versioned result/error envelope. A failed batch target is reported without stopping the others.

Signed CDN URLs can expire, and live Instagram endpoints can change. Download only media you can legitimately access.

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
