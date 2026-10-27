'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../../providers/youtube');

const ID = 'dQw4w9WgXcQ';
const PAGE = `https://www.youtube.com/watch?v=${ID}`;
function page(html) { return new Response(html, { headers: { 'content-type': 'text/html' } }); }

function htmlWithPlayer(player, poster = `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`) {
    return `<html><meta property="og:image" content="${poster}"><script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script></html>`;
}

test('youtube: match strict hosts and parse normal, short and Shorts URLs', () => {
    for (const input of [PAGE, `https://youtu.be/${ID}`, `https://m.youtube.com/shorts/${ID}`, `https://youtube.com/live/${ID}`]) {
        assert.equal(provider.match(input), true);
        assert.equal(provider.parse(input).id, ID);
    }
    assert.equal(provider.match('https://youtube.com.evil.test/watch?v='+ID), false);
    assert.throws(() => provider.parse('https://www.youtube.com/playlist?list=abc'), /video ID/);
    assert.throws(() => provider.validateUrl('https://metadata.googlevideo.com.evil.test/a.mp4'), /Refusing/);
});

test('youtube: picks highest quality *muxed* progressive video and labels image poster separately', async () => {
    const response = await provider.resolve(provider.parse(PAGE), { fetchImpl: async (url, opts) => {
        assert.equal(url, PAGE);
        assert.equal(opts.redirect, 'manual');
        return page(htmlWithPlayer({ streamingData: { formats: [
            { mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', height: 360, bitrate: 500000,
                url: 'https://rr1.googlevideo.com/videoplayback?fmt=18' },
            { mimeType: 'video/mp4; codecs="avc1.640028, mp4a.40.2"', height: 720, bitrate: 3000000,
                url: 'https://rr2.googlevideo.com/videoplayback?fmt=22' },
            { mimeType: 'video/mp4; codecs="avc1.640028"', height: 1080, bitrate: 5000000,
                url: 'https://rr3.googlevideo.com/adaptive_video_only' },
        ] } }));
    } });
    assert.equal(response.items.length, 1);
    const media = provider.select(response.items[0], 'auto');
    assert.equal(media.url, 'https://rr2.googlevideo.com/videoplayback?fmt=22');
    assert.equal(media.kind, 'video');
    assert.equal(media.height, 720);
    const image = provider.select(response.items[0], 'image');
    assert.equal(image.kind, 'image');
    assert.equal(image.sourceKind, 'video-poster');
    assert.match(image.url, /i\.ytimg\.com/);
});

test('youtube: adaptive-only or cipher-only media falls back to poster, never invents a playable video', async () => {
    const html = htmlWithPlayer({ streamingData: {
        formats: [{ mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', signatureCipher: 'cipher-only' }],
        adaptiveFormats: [{ url: 'https://rr.googlevideo.com/videoonly', mimeType: 'video/mp4; codecs="avc1.640028"' }],
    } });
    const resolved = await provider.resolve(provider.parse(PAGE), { fetchImpl: async () => page(html) });
    const selection = provider.select(resolved.items[0], 'auto');
    assert.equal(selection.isVideo, false);
    assert.equal(selection.sourceKind, 'video-poster');
    assert.equal(provider.select(resolved.items[0], 'image').sourceKind, 'video-poster');
    assert.equal(provider.select(resolved.items[0], 'video').sourceKind, 'video-poster');
});

test('youtube: refuses arbitrary media URL masquerading as a player stream', async () => {
    const html = htmlWithPlayer({ streamingData: { formats: [
        { mimeType: 'video/mp4; codecs="avc1, mp4a.40.2"', url: 'https://evil.test/movie.mp4' },
    ] } }, 'https://evil.test/preview.jpg');
    await assert.rejects(provider.resolve(provider.parse(PAGE), { fetchImpl: async () => page(html) }), /did not expose/);
});

test('youtube: mocked CLI downloads the actual progressive MP4 rather than a poster', async (t) => {
    const os = require('node:os');
    const fs = require('node:fs/promises');
    const path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sget-youtube-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const child = spawnSync(process.execPath, [
        '--require', path.resolve('test-support/mock-youtube-network.js'),
        path.resolve('bin/ig-downloader.js'), PAGE, '-o', dir, '-J',
    ], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    const json = JSON.parse(child.stdout);
    assert.equal(json.saved.length, 1);
    assert.equal(json.saved[0].sourceKind, 'video');
    assert.equal(json.saved[0].mediaType, 'video');
    assert.equal(json.saved[0].bytes, 24);
    assert.ok(json.saved[0].path.endsWith('.mp4'));
    const body = await fs.readFile(json.saved[0].path);
    assert.equal(body.toString('ascii', 4, 8), 'ftyp');
});
