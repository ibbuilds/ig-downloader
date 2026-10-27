#!/usr/bin/env node
'use strict';

const { PROVIDERS } = require('../lib/providers.js');
const { normalizeResource } = require('../core/provider.js');

async function main() {
    const id = process.argv[2];
    const provider = PROVIDERS[id];
    if (!provider) throw new Error(`Unknown provider: ${id}`);
    const targetUrl = process.env.IGD_LIVE_URL;
    if (!targetUrl) throw new Error('Live check is NOT CONFIGURED: IGD_LIVE_URL is required.');
    const key = `SGET_COOKIE_${id.toUpperCase().replace(/-/g, '_')}`;
    const cookie = process.env[key] || (id === 'instagram' ? process.env.IG_COOKIE || '' : '');
    const session = provider.createSession?.({ cookie });
    const target = provider.parse(targetUrl);
    const response = await provider.resolve(target, { cookie, session });
    if (!Array.isArray(response?.items) || !response.items.length) throw new Error('No items returned.');
    let resources = 0;
    for (const item of response.items) {
        const resource = normalizeResource(provider.select(item, 'auto'));
        if (!resource) continue;
        provider.validateUrl(resource.url);
        resources++;
    }
    if (!resources) throw new Error('Provider resolved items but none had downloadable media.');
    // Do not log authenticated URLs, cookie values or media IDs.
    process.stdout.write(`${id}: live resolution OK (${resources} resources; no bytes downloaded).\n`);
}

main().catch((error) => {
    const reason = String(error?.message || '');
    const category = /429|rate.?limit/i.test(reason) ? 'rate-limited' :
        /401|403|authentication|access denied/i.test(reason) ? 'access-denied' :
        /404|not found|expired/i.test(reason) ? 'unavailable-content' :
        /fetch failed|timeout|network|abort/i.test(reason) ? 'network-error' : 'extractor-error';
    // Error text can contain private post IDs or signed URLs; never print it in CI.
    console.error('Provider live check failed (' + category + ').');
    process.exitCode = 1;
});
