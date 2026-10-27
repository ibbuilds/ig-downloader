'use strict';

const USERNAME = /^[A-Za-z0-9._]{1,30}$/;
const SHORTCODE = /^[A-Za-z0-9_-]+$/;

function parseTarget(raw) {
    const input = String(raw || '').trim();
    if (!input) throw new Error('Supply an Instagram Story, highlight, post or Reel URL.');
    if (input.startsWith('@') && USERNAME.test(input.slice(1))) {
        return { type: 'story', username: input.slice(1), id: '' };
    }
    if (USERNAME.test(input) && !/^\d+$/.test(input)) {
        return { type: 'story', username: input, id: '' };
    }

    const urlInput = /^instagram\.com\//i.test(input) ? `https://${input}` : input;
    let url;
    try {
        url = new URL(urlInput);
    } catch {
        throw new Error('Expected an Instagram URL or username (a Story ID alone has no account context).');
    }
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname)) {
        throw new Error('Only HTTPS URLs on instagram.com are supported.');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'stories' && parts[1] === 'highlights' && /^\d+$/.test(parts[2] || '') && parts.length === 3) {
        return { type: 'highlight', id: parts[2] };
    }
    if (parts[0] === 'stories' && USERNAME.test(parts[1] || '') && parts.length >= 2 && parts.length <= 3) {
        if (parts.length === 3 && !/^\d+$/.test(parts[2])) throw new Error('Invalid Story media ID.');
        return { type: 'story', username: parts[1], id: parts[2] || '' };
    }
    if (['p', 'reel', 'reels', 'tv'].includes(parts[0]) && SHORTCODE.test(parts[1] || '') && parts.length === 2) {
        return { type: 'post', shortcode: parts[1] };
    }
    if (parts.length === 1 && USERNAME.test(parts[0])) return { type: 'story', username: parts[0], id: '' };
    throw new Error('Unsupported Instagram URL. Use /stories/user/id, /stories/highlights/id, /p/code, or /reel/code.');
}

function matchStoryId(item, id) {
    return String(item?.pk ?? item?.id ?? '').split('_')[0] === String(id);
}

module.exports = { parseTarget, matchStoryId };
