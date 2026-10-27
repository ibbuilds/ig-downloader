'use strict';

const { validatePublicUrl } = require('../../core/public-http.js');
const { resolvePage, selectPageMedia, formatFromUrl } = require('../../core/page-media.js');

function match(value) {
    try { validatePublicUrl(value); return true; } catch { return false; }
}
function parse(value) { return { url: validatePublicUrl(value) }; }
async function resolve(target, context = {}) {
    const filename = new URL(target.url).pathname;
    if (/\.(jpe?g|png|gif|webp|avif|heic|heif|mp4|mov|webm|mp3|m4a|ogg)$/i.test(filename)) {
        const isVideo = /\.(mp4|mov|webm)$/i.test(filename);
        const isAudio = /\.(mp3|m4a|ogg)$/i.test(filename);
        const value = { id: '1', url: target.url, isVideo, ...(isAudio ? { kind: 'audio' } : {}),
            sourceKind: isAudio ? 'audio' : isVideo ? 'video' : 'image',
            format: formatFromUrl(target.url, isAudio ? 'mp3' : isVideo ? 'mp4' : 'jpg'), width: 0, height: 0, hasVideo: isVideo };
        return { items: [value], username: new URL(target.url).hostname };
    }
    return resolvePage(target.url, context);
}

module.exports = Object.freeze({ id: 'web', name: 'Public web metadata', fallback: true,
    match, parse, resolve, select: selectPageMedia, validateUrl: validatePublicUrl });
