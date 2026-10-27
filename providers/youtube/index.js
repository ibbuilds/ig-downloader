'use strict';

const { createUrlPolicy } = require('../../core/url-policy.js');
const { fetchPage } = require('../../core/public-http.js');
const { parsePageMedia } = require('../../core/page-media.js');

const PAGE = createUrlPolicy(['youtube.com', 'youtu.be']);
const MEDIA = createUrlPolicy(['googlevideo.com', 'ytimg.com']);
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

function videoId(url) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname === 'youtu.be' || url.hostname.endsWith('.youtu.be')) return parts[0];
    if (parts[0] === 'watch') return url.searchParams.get('v');
    if (['shorts', 'live', 'embed'].includes(parts[0])) return parts[1];
    return null;
}

function match(raw) {
    try { return VIDEO_ID.test(videoId(new URL(PAGE(raw))) || ''); }
    catch { return false; }
}

function parse(raw) {
    let url;
    try { url = new URL(PAGE(raw)); }
    catch { throw new Error('Expected a YouTube HTTPS URL.'); }
    const id = videoId(url);
    if (!VIDEO_ID.test(id || '')) throw new Error('Expected a YouTube video, Short or live-video URL with a valid video ID (not a playlist or channel).');
    return { id, url: `https://www.youtube.com/watch?v=${id}` };
}

/** Locate an inline JSON object without evaluating scripts or executing untrusted page code. */
function extractPlayerResponse(html) {
    const marker = /\bytInitialPlayerResponse\s*=\s*\{/g;
    const found = marker.exec(html);
    if (!found) return null;
    const start = found.index + found[0].lastIndexOf('{');
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < html.length; index++) {
        const char = html[index];
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '{') depth++;
        else if (char === '}' && --depth === 0) {
            try { return JSON.parse(html.slice(start, index + 1)); }
            catch { return null; }
        }
    }
    return null;
}

function bestProgressive(player) {
    const formats = player?.streamingData?.formats;
    if (!Array.isArray(formats)) return null;
    let best = null;
    let score = -1;
    for (const format of formats.slice(0, 100)) {
        if (!format || typeof format.url !== 'string') continue;
        const mime = /^video\/(mp4|webm)(?:\s*;\s*codecs\s*=\s*"([^"]+)")?/i.exec(format.mimeType || '');
        // Only include a single progressive file with BOTH sound and picture.
        // Adaptive/DASH and cipher-only streams need separate handling and are not mislabeled as ready MP4s.
        if (!mime || !/(?:mp4a|opus|vorbis)/i.test(mime[2] || '')) continue;
        let url;
        try { url = MEDIA(format.url); }
        catch { continue; }
        const quality = Math.max(0, Number(format.height) || 0) * 1000000 + Math.max(0, Number(format.bitrate) || 0);
        if (!best || quality > score) {
            best = { url, format: mime[1].toLowerCase(), width: Number(format.width) || 0, height: Number(format.height) || 0 };
            score = quality;
        }
    }
    return best;
}

async function resolve(target, { fetchImpl, cookie = '' } = {}) {
    const response = await fetchPage(target.url, { fetchImpl, cookie, validateUrl: PAGE });
    if (response.contentType && !/text\/html|application\/xhtml\+xml/.test(response.contentType)) {
        throw new Error('YouTube did not return HTML metadata.');
    }
    const video = bestProgressive(extractPlayerResponse(response.text));
    let poster = null;
    for (const item of parsePageMedia(response.text, response.url)) {
        if (item.isVideo || item.kind === 'audio') continue;
        try {
            const url = MEDIA(item.url);
            poster = { url, format: item.format, width: item.width, height: item.height };
            break;
        } catch { /* Ignore image previews from unrelated domains. */ }
    }
    if (!video && !poster) {
        throw new Error('This YouTube page did not expose a usable progressive stream or thumbnail. Adaptive/ciphered streams are not supported.');
    }
    return { items: [{ id: target.id, video, poster }], username: 'youtube' };
}

function select(item, mode = 'auto') {
    const selected = mode === 'image' ? item.poster : mode === 'auto' || mode === 'video' ? item.video || item.poster : null;
    if (!selected) return null;
    const isVideo = selected === item.video && Boolean(item.video);
    return { id: item.id, ...selected, isVideo, kind: isVideo ? 'video' : 'image',
        sourceKind: isVideo ? 'video' : 'video-poster' };
}

module.exports = Object.freeze({ id: 'youtube', name: 'YouTube (experimental progressive)', match, parse, resolve, select, validateUrl: MEDIA });
