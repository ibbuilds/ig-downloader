# Instagram provider

**Status: maintained (offline tests passing; live site acceptance still unverified).**

Supported targets: accessible Stories, Highlights, Posts, Reels, and public/account-scoped Story lookups. The CLI uses existing web GraphQL queries and optional session cookies; those endpoints can change without notice. Video Story images may be posters, not original uploaded photos.

- Fixture/contract checks: `npm run check:provider -- instagram`
- Live resolution may be invoked **locally** using a user-controlled URL and session (`IGD_LIVE_URL=... IG_COOKIE=... node scripts/check-provider-live.js instagram`). The GitHub workflow permits public-URL-only manual smoke checks without receiving user credentials.
- The live job is skipped until configured. Success proves resource resolution and URL selection at that point, **not** a full media download or extension behavior.
- Do not submit signed media URLs, active cookies or private responses in issues or fixtures.
