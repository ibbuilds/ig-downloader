(function (root) {
    'use strict';

    const MODES = Object.freeze({ AUTO: 'auto', IMAGE: 'image', VIDEO: 'video' });

    function largest(candidates) {
        if (!Array.isArray(candidates)) return null;
        return (
            candidates
                .filter((candidate) => candidate && typeof candidate.url === 'string' && candidate.url.startsWith('https://'))
                .sort(
                    (a, b) =>
                        Number(b.width || 0) * Number(b.height || 0) -
                        Number(a.width || 0) * Number(a.height || 0),
                )[0] || null
        );
    }

    function extensionFromUrl(url, fallback) {
        try {
            const match = new URL(url).pathname.match(/\.(jpe?g|png|webp|avif|heic|heif|gif|mp4|mov)$/i);
            if (match) return match[1].toLowerCase().replace('jpeg', 'jpg');
        } catch {
            // Keep the known media-type fallback.
        }
        return fallback;
    }

    /**
     * Shared by the extension and CLI. Image mode NEVER silently falls back to an MP4.
     * A video story's image_versions2 is a poster/preview, not necessarily the uploaded photo.
     */
    function selectMedia(item, mode = MODES.AUTO) {
        if (!item || typeof item !== 'object') return null;
        if (!Object.values(MODES).includes(mode)) throw new TypeError('Unknown media mode: ' + mode);

        const image = largest(item.image_versions2?.candidates);
        const video = largest(item.video_versions);
        const originalIsVideo = Number(item.media_type) === 2 || (Number(item.media_type) !== 1 && Boolean(video));
        const selected = mode === MODES.IMAGE ? image : mode === MODES.VIDEO ? video || image : originalIsVideo ? video || image : image || video;
        if (!selected) return null;

        const isVideo = selected === video && Boolean(video);
        const sourceKind = isVideo ? 'video' : originalIsVideo ? 'video-poster' : 'image';
        const url = selected.url;
        return {
            id: String(item.pk ?? item.id ?? '').split('_')[0],
            url,
            videoUrl: video?.url || '',
            imageUrl: image?.url || '',
            previewUrl: image?.url || '',
            isVideo,
            originalIsVideo,
            sourceKind,
            width: Number(selected.width || 0),
            height: Number(selected.height || 0),
            takenAt: item.taken_at ?? null,
            format: extensionFromUrl(url, isVideo ? 'mp4' : 'jpg'),
        };
    }

    const api = Object.freeze({ MODES, largest, selectMedia, extensionFromUrl });
    root.IGDownloaderMedia = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
