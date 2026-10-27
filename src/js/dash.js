function getXmlElements(parent, localName) {
    return Array.from(parent.getElementsByTagNameNS('*', localName));
}

function parseDashManifest(manifest) {
    if (!manifest) return [];
    const xml = new DOMParser().parseFromString(manifest, 'application/xml');
    if (getXmlElements(xml, 'parsererror').length) return [];
    return getXmlElements(xml, 'Representation')
        .map((representation) => {
            const adaptationSet = representation.parentElement;
            const baseUrl = getXmlElements(representation, 'BaseURL')[0]?.textContent?.trim();
            return {
                url: baseUrl,
                codec: representation.getAttribute('codecs') || '',
                mimeType: representation.getAttribute('mimeType') || adaptationSet?.getAttribute('mimeType') || '',
                width: Number(representation.getAttribute('width') || adaptationSet?.getAttribute('width') || 0),
                height: Number(representation.getAttribute('height') || adaptationSet?.getAttribute('height') || 0),
                bandwidth: Number(
                    representation.getAttribute('bandwidth') || representation.getAttribute('FBAvgBitrate') || 0,
                ),
                contentLength: Number(representation.getAttribute('FBContentLength') || 0),
                qualityLabel: representation.getAttribute('FBQualityLabel') || '',
            };
        })
        .filter((representation) => representation.url);
}

function selectBestRepresentation(representations, type) {
    const candidates = representations.filter((representation) => representation.mimeType.startsWith(`${type}/`));
    return candidates.sort((a, b) => {
        if (type === 'video') {
            const pixelDifference = b.width * b.height - a.width * a.height;
            if (pixelDifference) return pixelDifference;
        }
        return b.bandwidth - a.bandwidth || b.contentLength - a.contentLength;
    })[0];
}

function getBestDashMedia(item) {
    const representations = parseDashManifest(item['video_dash_manifest']);
    const video = selectBestRepresentation(representations, 'video');
    const audio = selectBestRepresentation(representations, 'audio');
    if (!video) return null;
    if (item['has_audio'] === true && !audio) return null;
    return {
        videoUrl: video.url,
        audioUrl: audio?.url || null,
        videoCodec: video.codec,
        audioCodec: audio?.codec || null,
        width: video.width,
        height: video.height,
        bandwidth: video.bandwidth,
        qualityLabel: video.qualityLabel,
    };
}

function getOriginalMediaFilename(mediaUrl) {
    try {
        const pathname = new URL(mediaUrl).pathname;
        const filename = decodeURIComponent(pathname.split('/').pop() || '');
        return filename.replace(/\.[a-z0-9]+$/i, '');
    } catch (error) {
        return '';
    }
}

function extractMediaData(item, mode = IGDownloaderMedia.MODES.AUTO) {
    const media = IGDownloaderMedia.selectMedia(item, mode);
    if (!media) return null;
    const dash = media.isVideo ? getBestDashMedia(item) : null;
    return {
        ...media,
        originalFilename: getOriginalMediaFilename(media.url),
        width: dash?.width || media.width,
        height: dash?.height || media.height,
        progressiveWidth: media.width,
        progressiveHeight: media.height,
        videoBitrate: dash?.bandwidth || 0,
        videoCodec: dash?.videoCodec || '',
        dash,
    };
}
