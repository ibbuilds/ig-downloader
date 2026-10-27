'use strict';

const { createUrlPolicy } = require('./url-policy.js');
const { resolvePage, selectPageMedia } = require('./page-media.js');

/** Static public HTML metadata adapter; sites may not expose playable media without JavaScript. */
function createSiteProvider({ id, name, hosts, mediaHosts, resolveOverride }) {
    const pagePolicy = createUrlPolicy(hosts);
    const mediaPolicy = createUrlPolicy(mediaHosts);
    function match(value) {
        try { pagePolicy(value); return true; }
        catch { return false; }
    }
    function parse(value) {
        if (!match(value)) throw new Error(`Expected an HTTPS ${name} link.`);
        return { url: pagePolicy(value) };
    }
    async function resolve(target, context = {}) {
        if (resolveOverride) return resolveOverride(target, context, { pagePolicy, mediaPolicy });
        const found = await resolvePage(target.url, { ...context, validatePageUrl: pagePolicy });
        const items = found.items.filter((item) => {
            try { mediaPolicy(item.url); return true; } catch { return false; }
        });
        if (!items.length) throw new Error(`${name} did not expose media on an allowed CDN.`);
        return { ...found, items };
    }
    return Object.freeze({ id, name, match, parse, resolve, select: selectPageMedia, validateUrl: mediaPolicy });
}

module.exports = { createSiteProvider };
