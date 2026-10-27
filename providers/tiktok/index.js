'use strict';

const { createSiteProvider } = require('../../core/site-provider.js');
const { fetchPage } = require('../../core/public-http.js');
const { parsePageMedia, formatFromUrl } = require('../../core/page-media.js');

function hydrate(html, url, mediaPolicy) {
    const script = html.match(/<script\b[^>]*id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!script) return [];
    let data;
    try { data = JSON.parse(script[1]); } catch { return []; }
    const item = data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (!item) return [];
    const candidates = [];
    const add = (value, isVideo, kind) => {
        const raw = typeof value === 'string' ? value : value?.urlList?.[0];
        if (!raw || candidates.length >= 100) return;
        let valid;
        try { valid = mediaPolicy(new URL(raw, url).toString()); } catch { return; }
        if (candidates.some((v) => v.url === valid)) return;
        candidates.push({ id: String(item.id || 'tiktok') + '_' + (candidates.length + 1), url: valid,
            isVideo, sourceKind: kind, format: formatFromUrl(valid, isVideo ? 'mp4' : 'jpg'), width: 0, height: 0 });
    };
    // Only exposed media URLs. This does not attempt signature circumvention or login bypass.
    add(item.video?.playAddr || item.video?.downloadAddr, true, 'video');
    for (const picture of item.imagePost?.images || []) {
        add(picture.imageURL?.urlList?.[0] || picture.imageURL, false, 'image');
    }
    return candidates;
}

module.exports = createSiteProvider({
    id: 'tiktok', name: 'TikTok', hosts: ['tiktok.com'],
    mediaHosts: ['tiktok.com', 'tiktokcdn.com', 'tiktokv.com', 'byteoversea.com', 'byteimg.com', 'akamaized.net', 'snssdk.com'],
    async resolveOverride(target, context, { pagePolicy, mediaPolicy }) {
        const response = await fetchPage(target.url, { ...context, validateUrl: pagePolicy });
        if (response.contentType && !/text\/html|application\/xhtml\+xml/.test(response.contentType)) {
            throw new Error('TikTok did not return HTML media metadata.');
        }
        const enriched = hydrate(response.text, response.url, mediaPolicy);
        const metadata = parsePageMedia(response.text, response.url, { all: context.all });
        const unique = new Set(enriched.map((media) => media.url));
        for (const value of metadata) {
            try { mediaPolicy(value.url); } catch { continue; }
            if (unique.has(value.url)) continue;
            unique.add(value.url);
            enriched.push({ ...value, sourceKind: !value.isVideo && enriched.some((v) => v.isVideo) ? 'video-poster' : value.sourceKind });
        }
        if (!enriched.length) throw new Error('TikTok page exposed no downloadable resources in public HTML.');
        const hasVideo = enriched.some((v) => v.isVideo);
        return { items: enriched.map((v) => ({ ...v, hasVideo })), username: 'tiktok' };
    },
});
