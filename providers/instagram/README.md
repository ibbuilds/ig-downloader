# Instagram provider

**Status: maintained (offline tests passing; live site acceptance still unverified).**

Supported targets: accessible Stories, Highlights, Posts, Reels, and public/account-scoped Story lookups. The CLI uses existing web GraphQL queries and optional session cookies; those endpoints can change without notice. Video Story images may be posters, not original uploaded photos.

- Fixture/contract checks: `npm run check:provider -- instagram`
- Manual live resolution: configure `IGD_INSTAGRAM_TEST_URL` repository variable (an accessible stable URL), optionally `IGD_INSTAGRAM_COOKIE` secret, then run `instagram live resolution` from Actions.
- The live job is skipped until configured. Success proves resource resolution and URL selection at that point, **not** a full media download or extension behavior.
- Do not submit signed media URLs, active cookies or private responses in issues or fixtures.
