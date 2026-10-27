'use strict';

const { createUrlPolicy } = require('../../core/url-policy.js');

module.exports = Object.freeze({
    id: '__ID__',
    name: '__ID__',
    match(input) {
        // TODO: match exact domain(s), not URL substrings.
        try { return new URL(input).hostname === '__ID__.example.test'; } catch { return false; }
    },
    parse(input) { return { url: new URL(input).toString() }; },
    async resolve(target, context) {
        // TODO: return { items: [...], username?: string }; never hardcode cookies.
        throw new Error('Provider __ID__ not implemented yet.');
    },
    select(item, mode) {
        // TODO: return { id, url, isVideo, sourceKind, format, width?, height? }.
        return null;
    },
    validateUrl: createUrlPolicy(['__ID__.example.test']), // TODO: approved CDN domain(s)
});
