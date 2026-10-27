# Generic web adapter

**Fallback for public HTTPS pages or direct media file links. No JavaScript rendering or recursive crawling.**

Fixture tests: `npm run check:provider -- web`. Live authenticated downloads have not been verified and public pages may stop exposing these URLs. The source kind distinguishes preview images from playable video. The core validates HTTPS and media origins. Never commit cookies, personal signed media links, or private responses.
