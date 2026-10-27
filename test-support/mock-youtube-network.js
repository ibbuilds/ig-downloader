'use strict';
// End-to-end CLI fixture. This module never makes external requests.
const id = 'dQw4w9WgXcQ';
const media = 'https://rr1.googlevideo.com/videoplayback?fmt=18';
const player = { streamingData: { formats: [{
    mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', width: 640, height: 360,
    bitrate: 600000, url: media,
}] } };
const video = Buffer.alloc(24);
video.writeUInt32BE(24, 0);
video.write('ftyp', 4, 4, 'ascii');
video.write('isom', 8, 4, 'ascii');
video.write('isom', 16, 4, 'ascii');
global.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'www.youtube.com') {
        if (parsed.searchParams.get('v') !== id) throw new Error('Unexpected YouTube video ID');
        return new Response(`<meta property="og:image" content="https://i.ytimg.com/vi/${id}/maxresdefault.jpg"><script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script>`,
            { headers: { 'content-type': 'text/html' } });
    }
    if (url === media) return new Response(video, {
        headers: { 'content-type': 'video/mp4', 'content-length': String(video.length) },
    });
    throw new Error('Unexpected network request');
};
