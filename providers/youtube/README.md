# YouTube provider

**Experimental: direct progressive video with audio when present in publicly accessible player metadata, or thumbnail/poster fallback.**

Supported link forms: normal videos (`watch?v=...`), Shorts, live-video IDs, and `youtu.be` short URLs. Playlists, channels and membership areas are not crawled. Many videos expose only ciphered or adaptive DASH/HLS streams: **this adapter does not decipher signatures, mux separate tracks, access DRM-protected media, or guarantee video playback**. In that case it may save a *video-poster* image, clearly labeled, rather than masquerading it as a video.

- Fixture check: `npm run check:provider -- youtube`
- Public-only manual/scheduled smoke check: `.github/workflows/youtube-live.yml`, no repository session secrets.
- Authentication-dependent live tests belong on the user's device. No user credentials belong in GitHub Actions, fixtures or pull requests.
