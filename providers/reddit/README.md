# Reddit adapter

**Experimental: JSON post/gallery extraction with public preview fallback; anonymous JSON may be blocked by Reddit.**

Fixture tests: `npm run check:provider -- reddit`. Live authenticated downloads have not been verified and public pages may stop exposing these URLs. The source kind distinguishes preview images from playable video. The core validates HTTPS and media origins. Never commit cookies, personal signed media links, or private responses.
