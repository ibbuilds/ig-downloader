'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const IMAGE_TYPES = Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
});
const VIDEO_TYPES = Object.freeze({ 'video/mp4': 'mp4', 'video/quicktime': 'mov' });
const MAX_BYTES = 500 * 1024 * 1024;

function validateMediaUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error('Invalid media URL.');
    }
    const host = url.hostname.toLowerCase();
    const allowed = ['fbcdn.net', 'cdninstagram.com'].some((domain) => host === domain || host.endsWith('.' + domain));
    if (url.protocol !== 'https:' || !allowed || url.username || url.password) {
        throw new Error('Refusing non-Instagram CDN or non-HTTPS media URL.');
    }
    return url.toString();
}

function safeName(value) {
    return String(value || 'media')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-z0-9._-]/g, '-')
        .slice(0, 80)
        .replace(/^[.-]+|[. ]+$/g, '') || 'media';
}

function makeBaseName(username, media, index) {
    const stamp = media.takenAt && Number.isFinite(Number(media.takenAt))
        ? new Date(Number(media.takenAt) * 1000).toISOString().slice(0, 10)
        : '';
    return safeName([username || 'instagram', media.id || 'media', stamp, String(index + 1)].filter(Boolean).join('_'));
}

async function fetchCdn(url, fetchImpl = fetch) {
    let current = validateMediaUrl(url);
    for (let redirects = 0; redirects <= 3; redirects++) {
        const response = await fetchImpl(current, {
            headers: { accept: 'image/*,video/*' },
            redirect: 'manual',
            signal: AbortSignal.timeout(60000),
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location) throw new Error('Media CDN redirected without a Location header.');
            current = validateMediaUrl(new URL(location, current).toString());
            continue;
        }
        if (response.status === 429) throw new Error('CDN rate limit (429). Stop and retry later.');
        if (!response.ok) throw new Error(`CDN returned HTTP ${response.status}.`);
        return response;
    }
    throw new Error('Too many CDN redirects.');
}

function getResponseExtension(response, media) {
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentType.startsWith('video/') && !media.isVideo) {
        throw new Error('Expected an image, but CDN returned video. Refusing to disguise it as a JPG.');
    }
    if (contentType.startsWith('image/') && media.isVideo) {
        throw new Error('Expected video, but CDN returned an image.');
    }
    const extension = IMAGE_TYPES[contentType] || VIDEO_TYPES[contentType];
    if (contentType && !extension && contentType !== 'application/octet-stream') {
        throw new Error('Unexpected media content type: ' + contentType);
    }
    return { extension: extension || media.format || (media.isVideo ? 'mp4' : 'jpg'), contentType };
}

async function downloadMedia(media, options = {}) {
    const response = await fetchCdn(media.url, options.fetchImpl);
    const { extension, contentType } = getResponseExtension(response, media);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) throw new Error('Media exceeds the 500 MB safety limit.');
    if (!response.body) throw new Error('No response body from media CDN.');
    const output = path.resolve(options.output || '.');
    await fs.mkdir(output, { recursive: true });
    const baseName = makeBaseName(options.username, media, options.index || 0);
    let filename;
    let file;
    for (let attempt = 0; attempt < 100; attempt++) {
        filename = path.join(output, baseName + (attempt ? '_' + (attempt + 1) : '') + '.' + extension);
        try {
            file = await fs.open(filename, 'wx', 0o600);
            break;
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
    }
    if (!file) throw new Error('Unable to find a unique output file name.');
    let completed = false;
    try {
        let loaded = 0;
        async function* limitedStream() {
            for await (const chunk of Readable.fromWeb(response.body)) {
                loaded += chunk.byteLength;
                if (loaded > MAX_BYTES) throw new Error('Media exceeds the 500 MB safety limit.');
                yield chunk;
            }
        }
        await pipeline(Readable.from(limitedStream()), file.createWriteStream());
        completed = true;
        return { path: filename, bytes: loaded, contentType };
    } finally {
        if (!completed) {
            await file.close().catch(() => {});
            await fs.rm(filename, { force: true });
        }
    }
}

module.exports = { validateMediaUrl, safeName, makeBaseName, getResponseExtension, downloadMedia };
