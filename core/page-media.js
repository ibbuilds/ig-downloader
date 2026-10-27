'use strict';

const { validatePublicUrl } = require('./public-http.js');
const { fetchPage } = require('./public-http.js');

const IMAGE_EXT = /\.(?:jpe?g|png|webp|avif|heic|heif|gif)(?:$|[?#])/i;
const VIDEO_EXT = /\.(?:mp4|mov|webm)(?:$|[?#])/i;
const AUDIO_EXT = /\.(?:mp3|m4a|ogg)(?:$|[?#])/i;

function decodeHtml(value) {
    return String(value || '').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
        const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
        if (entity.startsWith('#')) {
            const hex = entity[1].toLowerCase() === 'x';
            const cp = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
            return Number.isInteger(cp) && cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)
                ? String.fromCodePoint(cp) : '';
        }
        return named[entity.toLowerCase()] || '';
    });
}

function attributes(tag) {
    const out = Object.create(null);
    const matcher = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    for (const m of tag.matchAll(matcher)) out[m[1].toLowerCase()] = decodeHtml(m[2] ?? m[3] ?? m[4]);
    return out;
}

function candidate(raw, base) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    try { return validatePublicUrl(new URL(decodeHtml(raw), base).toString()); }
    catch { return null; }
}

function formatFromUrl(url, fallback) {
    try {
        const ext = new URL(url).pathname.match(/\.(jpe?g|png|webp|avif|heic|heif|gif|mp4|mov|webm|mp3|m4a|ogg)$/i)?.[1]?.toLowerCase();
        return ext === 'jpeg' ? 'jpg' : ext || fallback;
    } catch { return fallback; }
}

/** Inspect public OpenGraph/Twitter metadata, not a headless browser or an original-media guarantee. */
function parsePageMedia(html, pageUrl, { all = false } = {}) {
    const tags = [];
    const keep = new Set();
    const add = (url, isVideo, sourceKind) => {
        if (!url || keep.has(url) || tags.length >= 200) return;
        keep.add(url);
        tags.push({ id: String(tags.length + 1), url, isVideo,
            ...(sourceKind === 'audio' ? { kind: 'audio' } : {}), sourceKind,
            format: formatFromUrl(url, isVideo ? 'mp4' : 'jpg'), width: 0, height: 0 });
    };
    const found = [];
    for (const match of String(html).matchAll(/<meta\b[^>]*>/gi)) {
        const attrs = attributes(match[0]);
        const key = (attrs.property || attrs.name || '').toLowerCase();
        const url = candidate(attrs.content, pageUrl);
        if (!url) continue;
        if (['og:video', 'og:video:url', 'og:video:secure_url', 'twitter:player:stream'].includes(key)) {
            // Embedded web players are not media files. Never write iframe HTML as MP4.
            if (VIDEO_EXT.test(url)) found.push({ url, isVideo: true, kind: 'video' });
        } else if (['og:audio', 'og:audio:url', 'og:audio:secure_url'].includes(key)) {
            if (AUDIO_EXT.test(url)) found.push({ url, isVideo: false, kind: 'audio' });
        } else if (['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes(key)) {
            found.push({ url, isVideo: false, kind: 'preview-image' });
        }
    }
    // Return videos first so default auto mode chooses a video when a page exposes it.
    const containsVideo = found.some((x) => x.isVideo);
    for (const media of found.filter((x) => x.isVideo)) add(media.url, true, media.kind);
    for (const media of found.filter((x) => x.kind === 'audio')) add(media.url, false, 'audio');
    for (const media of found.filter((x) => !x.isVideo && x.kind !== 'audio')) add(media.url, false, containsVideo ? 'video-poster' : media.kind);
    if (all) {
        for (const match of String(html).matchAll(/<(img|video|source)\b[^>]*>/gi)) {
            const attrs = attributes(match[0]);
            const url = candidate(attrs.src, pageUrl);
            if (!url) continue;
            const video = match[1].toLowerCase() === 'video' || VIDEO_EXT.test(url);
            if (video && VIDEO_EXT.test(url)) add(url, true, 'video');
            else if (!video && IMAGE_EXT.test(url)) add(url, false, 'page-image');
        }
    }
    return tags;
}

function selectPageMedia(item, mode = 'auto') {
    if (mode === 'image' && (item.isVideo || item.kind === 'audio')) return null;
    if (mode === 'video' && item.kind === 'audio') return null;
    if (mode === 'video' && !item.isVideo && item.hasVideo) return null;
    return { ...item };
}

async function resolvePage(url, { fetchImpl, cookie = '', all = false, validatePageUrl } = {}) {
    const response = await fetchPage(url, { fetchImpl, cookie, validateUrl: validatePageUrl });
    if (response.contentType && !/text\/html|application\/xhtml\+xml/.test(response.contentType)) {
        throw new Error('Page did not return HTML metadata.');
    }
    const items = parsePageMedia(response.text, response.url, { all });
    if (!items.length) throw new Error('No directly downloadable media exposed by this page. Login or a site adapter may be required.');
    const hasVideo = items.some((m) => m.isVideo);
    return { items: items.map((m) => ({ ...m, hasVideo })), username: new URL(response.url).hostname };
}

module.exports = { parsePageMedia, selectPageMedia, resolvePage, formatFromUrl, decodeHtml };
