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
const HEADER_BYTES = 512;

// Content-Type alone is not proof that Instagram returned media instead of an error page.
function sniffMediaExtension(bytes) {
    const head = Buffer.from(bytes);
    if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
    if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
    if (head.length >= 6 && ['GIF87a', 'GIF89a'].includes(head.toString('ascii', 0, 6))) return 'gif';
    if (head.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if (head.length >= 16 && head.toString('ascii', 4, 8) === 'ftyp') {
        const size = head.readUInt32BE(0);
        if (size < 16) return '';
        const brands = [head.toString('ascii', 8, 12)];
        for (let index = 16; index + 4 <= Math.min(head.length, size); index += 4) {
            brands.push(head.toString('ascii', index, index + 4));
        }
        if (brands.some((brand) => ['avif', 'avis'].includes(brand))) return 'avif';
        if (brands.some((brand) => ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand))) return 'heic';
        if (brands.some((brand) => ['mif1', 'msf1'].includes(brand))) return 'heif';
        return brands[0] === 'qt  ' ? 'mov' : 'mp4';
    }
    return '';
}

function verifyMediaSignature(chunks, bytes, extension) {
    const detected = sniffMediaExtension(Buffer.concat(chunks, Math.min(bytes, HEADER_BYTES)));
    const compatibleHeif = extension === 'heif' && detected === 'heic';
    if (!detected || (detected !== extension && !compatibleHeif)) {
        throw new Error(`Media payload does not match expected ${extension} format (${detected || 'unrecognized signature'}).`);
    }
}

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

async function fetchCdn(url, fetchImpl = fetch, validateUrl = validateMediaUrl) {
    let current = validateUrl(url);
    for (let redirects = 0; redirects <= 3; redirects++) {
        const response = await fetchImpl(current, {
            headers: { accept: 'image/*,video/*' },
            redirect: 'manual',
            signal: AbortSignal.timeout(60000),
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location) throw new Error('Media CDN redirected without a Location header.');
            current = validateUrl(new URL(location, current).toString());
            continue;
        }
        if (response.status === 429) throw new Error('CDN rate limit (429). Stop and retry later.');
        if (response.status === 206) throw new Error('CDN returned partial content (206) without a range request.');
        if (response.status !== 200) throw new Error(`CDN returned HTTP ${response.status}.`);
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
    const response = await fetchCdn(media.url, options.fetchImpl, options.validateUrl || validateMediaUrl);
    const { extension, contentType } = getResponseExtension(response, media);
    const lengthHeader = response.headers.get('content-length');
    if (lengthHeader !== null && !/^\d+$/.test(lengthHeader)) throw new Error('Invalid CDN Content-Length header.');
    const declared = lengthHeader === null ? null : Number(lengthHeader);
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
            const pending = [];
            let headerSize = 0;
            let verified = false;
            for await (const chunk of Readable.fromWeb(response.body)) {
                loaded += chunk.byteLength;
                if (loaded > MAX_BYTES) throw new Error('Media exceeds the 500 MB safety limit.');
                if (!verified) {
                    pending.push(chunk);
                    headerSize += chunk.byteLength;
                    if (headerSize < HEADER_BYTES) continue;
                    verifyMediaSignature(pending, headerSize, extension);
                    verified = true;
                    for (const part of pending) yield part;
                    pending.length = 0;
                } else {
                    yield chunk;
                }
            }
            if (!loaded) throw new Error('CDN returned an empty media body.');
            if (!verified) {
                verifyMediaSignature(pending, headerSize, extension);
                for (const part of pending) yield part;
            }
            const encoding = response.headers.get('content-encoding');
            if ((!encoding || encoding.toLowerCase() === 'identity') && declared !== null && loaded !== declared) {
                throw new Error(`CDN Content-Length mismatch: expected ${declared} bytes, received ${loaded}.`);
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
