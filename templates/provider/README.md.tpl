# __ID__ provider

**Status: scaffold — not implemented.** Complete the TODOs before submitting a PR.

The adapter implements `match`, `parse`, `resolve`, `select`, and `validateUrl`.
See `docs/provider-development.md` and `types/provider.d.ts` for the contract.

- Offline tests: `npm run check:provider -- __ID__`.
- Add sanitized fixtures that represent real response structures; no session tokens, private content, or expiring signed URLs.
- Keep the URL allowlist narrow and verify redirects remain within it.
- Scheduled live checks require the repo variable `IGD___ENV___TEST_URL` and optionally the secret `IGD___ENV___COOKIE`.
- A live check validates extraction and media URL selection, **not a complete download**.
