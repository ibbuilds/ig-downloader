'use strict';

const { parseTarget } = require('./targets.js');
const { getInstagramItems, createInstagramSession } = require('./instagram.js');

// Keep the platform contract isolated from CLI argument handling. Additional
// providers must implement their own authorized resolution and media validation.
const PROVIDERS = Object.freeze({
    instagram: Object.freeze({
        id: 'instagram',
        name: 'Instagram',
        parse: parseTarget,
        resolve: getInstagramItems,
        createSession: createInstagramSession,
    }),
});

function resolveTarget(raw) {
    const text = String(raw || '').trim();
    const candidate = /^[a-z][\w+.-]*:\/\//i.test(text)
        ? text
        : /^[\w.-]+\//.test(text) ? `https://${text}` : null;
    if (candidate) {
        let url;
        try {
            url = new URL(candidate);
        } catch {
            // Retain the more informative Instagram target validation below.
        }
        if (url && !['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname.toLowerCase())) {
            throw new Error(`Unsupported provider (${url.hostname}). Currently supported: Instagram.`);
        }
    }
    return { provider: PROVIDERS.instagram, target: parseTarget(text) };
}

module.exports = { PROVIDERS, resolveTarget };
