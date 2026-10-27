'use strict';

const { createHash } = require('node:crypto');
const { fetchPage, validatePublicUrl } = require('./public-http.js');
const { parsePageMedia, decodeHtml, formatFromUrl } = require('./page-media.js');

const MEDIA_PATH = /\.(?:jpe?g|png|gif|webp|avif|heic|heif|mp4|mov|webm|mp3|m4a|ogg)$/i;
const VIDEO_PATH = /\.(?:mp4|mov|webm)$/i;
const AUDIO_PATH = /\.(?:mp3|m4a|ogg)$/i;
const MAX_MEDIA = 500;

/** Minimal anchor URL extraction; no DOM execution or remote navigation. */
function* anchorUrls(html, base) {
    for (const tag of String(html).matchAll(/<a\b[^>]*>/gi)) {
        const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag[0]);
        if (!match) continue;
        try {
            const url = new URL(decodeHtml(match[1] ?? match[2] ?? match[3]), base);
            url.hash = '';
            yield validatePublicUrl(url.toString());
        } catch { /* Ignore invalid and private links. */ }
    }
}

/** Crawl page links on the exact origin; separately collect direct media links on public CDNs. */
function pageLinks(html, base, origin, limit = 200) {
    const found = [];
    const seen = new Set();
    for (const link of anchorUrls(html, base)) {
        if (found.length >= limit) break;
        if (new URL(link).origin === origin && !seen.has(link)) {
            found.push(link);
            seen.add(link);
        }
    }
    return found;
}

function mediaLinks(html, base, limit = 200) {
    const found = [];
    const seen = new Set();
    for (const link of anchorUrls(html, base)) {
        if (found.length >= limit) break;
        if (MEDIA_PATH.test(new URL(link).pathname) && !seen.has(link)) {
            found.push(link);
            seen.add(link);
        }
    }
    return found;
}

/** Explicit public-HTML crawl: no cookies, no headless browser, same-origin navigation only. */
async function crawlPublicSite(root, { fetchImpl = fetch, depth = 1, maxPages = 10 } = {}) {
    if (!Number.isInteger(depth) || depth < 0 || depth > 2) throw new RangeError('Crawl depth must be 0..2.');
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new RangeError('Crawl page limit must be 1..20.');
    const start = validatePublicUrl(root);
    const origin = new URL(start).origin;
    const pagePolicy = (value) => {
        const valid = validatePublicUrl(value);
        if (new URL(valid).origin !== origin) throw new Error('Crawl page redirected outside the starting origin.');
        return valid;
    };
    const queue = [{ url: start, level: 0 }];
    const discovered = new Set([start]);
    const visited = [];
    const media = [];
    const seenMedia = new Set();
    let cursor = 0;
    while (cursor < queue.length && visited.length < maxPages && media.length < MAX_MEDIA) {
        const { url, level } = queue[cursor++];
        const response = await fetchPage(url, { fetchImpl, validateUrl: pagePolicy });
        discovered.add(response.url);
        if (response.contentType && !/text\/html|application\/xhtml\+xml/.test(response.contentType)) {
            throw new Error('Crawl page did not return HTML. Use sget URL directly for media files.');
        }
        visited.push(response.url);
        const items = parsePageMedia(response.text, response.url, { all: true });
        const pageId = createHash('sha256').update(response.url).digest('hex').slice(0, 12);
        for (const item of items) {
            if (media.length >= MAX_MEDIA) break;
            if (seenMedia.has(item.url)) continue;
            seenMedia.add(item.url);
            media.push({ ...item, id: pageId + '-' + item.id, pageUrl: response.url });
        }
        const links = pageLinks(response.text, response.url, origin);
        // Direct file links on the crawled page count as media, not navigation.
        for (const link of mediaLinks(response.text, response.url)) {
            if (media.length >= MAX_MEDIA) break;
            const pathname = new URL(link).pathname;
            if (!MEDIA_PATH.test(pathname) || seenMedia.has(link)) continue;
            const isVideo = VIDEO_PATH.test(pathname);
            const isAudio = AUDIO_PATH.test(pathname);
            seenMedia.add(link);
            media.push({ id: pageId + '-link-' + media.length, url: link,
                isVideo, ...(isAudio ? { kind: 'audio' } : {}),
                sourceKind: isAudio ? 'audio' : isVideo ? 'video' : 'page-image',
                format: formatFromUrl(link, isAudio ? 'mp3' : isVideo ? 'mp4' : 'jpg'),
                width: 0, height: 0, pageUrl: response.url });
        }
        if (level < depth) {
            for (const link of links) {
                if (discovered.size >= maxPages * 20) break;
                if (MEDIA_PATH.test(new URL(link).pathname) || discovered.has(link)) continue;
                discovered.add(link);
                queue.push({ url: link, level: level + 1 });
            }
        }
    }
    if (!media.length) throw new Error(`No directly accessible media found across ${visited.length} HTML page(s).`);
    const hasVideo = media.some((item) => item.isVideo);
    return { items: media.map((item) => ({ ...item, hasVideo })), username: new URL(start).hostname,
        pagesVisited: visited.length };
}

module.exports = { pageLinks, mediaLinks, crawlPublicSite };
