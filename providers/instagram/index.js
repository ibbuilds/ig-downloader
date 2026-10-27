'use strict';

const { parseTarget } = require('../../lib/targets.js');
const { getInstagramItems, createInstagramSession } = require('../../lib/instagram.js');
const { selectMedia } = require('../../shared/media.js');
const { validateMediaUrl } = require('../../lib/download.js');

const USERNAME = /^@?[A-Za-z0-9._]{1,30}$/;
const HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);

function match(input) {
    const text = String(input || '').trim();
    if (USERNAME.test(text)) return true;
    const candidate = /^instagram\.com\//i.test(text) ? `https://${text}` : text;
    try {
        const url = new URL(candidate);
        return url.protocol === 'https:' && HOSTS.has(url.hostname.toLowerCase());
    } catch {
        return false;
    }
}

module.exports = Object.freeze({
    id: 'instagram',
    name: 'Instagram',
    match,
    parse: parseTarget,
    resolve: getInstagramItems,
    select: selectMedia,
    createSession: createInstagramSession,
    validateUrl: validateMediaUrl,
});
