'use strict';

const { createUrlPolicy } = require('../../core/url-policy.js');
const { fetchPage } = require('../../core/public-http.js');
const { resolvePage, selectPageMedia, decodeHtml, formatFromUrl } = require('../../core/page-media.js');

const PAGE = createUrlPolicy(['reddit.com', 'redd.it']);
const MEDIA = createUrlPolicy(['redd.it', 'redditmedia.com', 'redditstatic.com', 'imgur.com']);
const HOSTS = new Set(['reddit.com', 'www.reddit.com', 'old.reddit.com', 'm.reddit.com', 'redd.it', 'www.redd.it']);
const POST_ID = /^[a-z0-9]{5,10}$/i;

function match(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && HOSTS.has(url.hostname.toLowerCase()); }
    catch { return false; }
}

function parse(value) {
    if (!match(value)) throw new Error('Expected a public Reddit post URL.');
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const index = parts.findIndex((part) => ['comments', 'gallery'].includes(part.toLowerCase()));
    const id = index >= 0 ? parts[index + 1] : url.hostname.endsWith('redd.it') ? parts[0] : null;
    if (!POST_ID.test(id || '')) throw new Error('Provide a Reddit post/gallery permalink, not a community or profile URL.');
    return { id: id.toLowerCase(), url: `https://www.reddit.com/comments/${id.toLowerCase()}/` };
}

function extractPostMedia(data) {
    const found = [];
    const seen = new Set();
    const add = (raw, isVideo, sourceKind) => {
        if (typeof raw !== 'string') return;
        const url = decodeHtml(raw);
        try { MEDIA(url); } catch { return; }
        if (seen.has(url) || found.length >= 200) return;
        seen.add(url);
        found.push({ id: String(data.id || 'post') + '_' + String(found.length + 1), url, isVideo,
            sourceKind, format: formatFromUrl(url, isVideo ? 'mp4' : 'jpg'), width: 0, height: 0 });
    };
    const redditVideo = data.secure_media?.reddit_video || data.media?.reddit_video;
    if (redditVideo?.fallback_url) add(redditVideo.fallback_url, true, 'video-may-lack-audio');
    const gallery = data.gallery_data?.items;
    if (Array.isArray(gallery)) {
        for (const entry of gallery) {
            const source = data.media_metadata?.[entry.media_id]?.s;
            if (source?.mp4) add(source.mp4, true, 'video-may-lack-audio');
            else if (source?.u) add(source.u, false, 'image');
        }
    }
    if (data.url_overridden_by_dest) {
        const isVideo = /\.(?:mp4|mov|webm)(?:$|[?#])/i.test(data.url_overridden_by_dest);
        add(data.url_overridden_by_dest, isVideo, isVideo ? 'video' : 'image');
    }
    // Some posts only expose a resized preview; never describe it as the original.
    if (!found.length && data.preview?.images?.[0]?.source?.url) {
        add(data.preview.images[0].source.url, false, 'preview-image');
    }
    if (!found.length) throw new Error('Reddit post contains no directly supported image/video resource.');
    const hasVideo = found.some((entry) => entry.isVideo);
    return { items: found.map((entry) => ({ ...entry, hasVideo })), username: data.author || 'reddit' };
}

async function resolve(target, { fetchImpl, cookie = '', all = false } = {}) {
    const token = process.env.SGET_REDDIT_TOKEN || '';
    const endpoint = token
        ? `https://oauth.reddit.com/comments/${target.id}?raw_json=1`
        : `https://www.reddit.com/comments/${target.id}.json?raw_json=1`;
    try {
        const response = await fetchPage(endpoint, { fetchImpl, cookie: token ? '' : cookie,
            authorization: token ? `Bearer ${token}` : '', validateUrl: PAGE, accept: 'application/json' });
        const parsed = JSON.parse(response.text);
        const data = parsed?.[0]?.data?.children?.[0]?.data;
        if (!data) throw new Error('Reddit post response did not include post metadata.');
        return extractPostMedia(data);
    } catch (error) {
        if (/Rate limited|size limit/.test(error.message) || token) throw error;
        // Public Reddit JSON is not guaranteed to work without OAuth. Use visible
        // page metadata as a transparently labelled last resort, not an API bypass.
        return resolvePage(target.url, { fetchImpl, all, validatePageUrl: PAGE });
    }
}

module.exports = Object.freeze({ id: 'reddit', name: 'Reddit', match, parse, resolve,
    select: selectPageMedia, validateUrl: MEDIA });
