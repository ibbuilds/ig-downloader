'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { parseCookies } = require('../lib/instagram.js');
const { PROVIDERS, resolveTarget } = require('../lib/providers.js');
const { parseArgs, planMedia, loadTargets } = require('../bin/ig-downloader.js');
const { downloadMedia } = require('../lib/download.js');
const { validatePublicUrl } = require('../core/public-http.js');
const { parsePageMedia } = require('../core/page-media.js');
const { Readable } = require('node:stream');

test('single-cookie Cookie: export is recognized and unrelated domains remain filtered', () => {
    assert.equal(parseCookies('Cookie: sessionid=abc'), 'sessionid=abc');
    assert.equal(parseCookies('sessionid=abc'), 'sessionid=abc');
    assert.equal(parseCookies('Cookie: sessionid=abc; csrftoken=def'), 'sessionid=abc; csrftoken=def');
    assert.equal(parseCookies('# Netscape HTTP Cookie File\n.evil.test\tTRUE\t/\tFALSE\t0\tsessionid\tstolen'), '');
});

test('specialized site adapters outrank web fallback and reject unsupported/private addresses', () => {
    const pairs = {
        'https://www.reddit.com/r/pics/comments/abc12/post': 'reddit',
        'https://www.facebook.com/reel/42': 'facebook',
        'https://www.tiktok.com/@any/video/42': 'tiktok',
        'https://x.com/user/status/42': 'twitter',
        'https://www.pinterest.com/pin/42': 'pinterest',
        'https://www.instagram.com/p/ABC123': 'instagram',
        'https://www.youtube.com/watch?v=a': 'web',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ': 'youtube',
        'https://any.example.org/picture.jpg': 'web',
    };
    for (const [url, id] of Object.entries(pairs)) assert.equal(resolveTarget(url).provider.id, id, url);
    assert.deepEqual(Object.keys(PROVIDERS), ['instagram', 'reddit', 'facebook', 'tiktok', 'twitter', 'pinterest', 'youtube', 'web']);
    assert.throws(() => resolveTarget('https://localhost/photo.jpg'), /Unsupported provider/);
    assert.throws(() => validatePublicUrl('https://192.168.1.1/image.png'), /Refusing/);
    assert.throws(() => validatePublicUrl('https://user:pass@news.example.org/'), /Refusing/);
});

test('CLI retains short commands and adds opt-in page resource scan', async () => {
    assert.equal(parseArgs(['https://example.org/post', '-A']).all, true);
    assert.equal(parseArgs(['-nJA', 'https://example.org/post']).json, true);
    assert.equal(parseArgs(['-i', 'https://example.org/post']).mode, 'image');
    assert.equal(parseArgs(['-V', 'https://example.org/post']).mode, 'video');
    const inputs = await loadTargets(parseArgs(['-u']), Readable.from(['https://example.org/media.jpg\n']));
    assert.deepEqual(inputs, ['https://example.org/media.jpg']);
});

test('metadata provenance is preserved and audio resources are labeled as audio', () => {
    const items = parsePageMedia('<meta property="og:audio" content="https://cdn.example.org/song.mp3"><meta property="og:image" content="https://cdn.example.org/art.jpg">', 'https://example.org/p/1');
    assert.equal(items[0].kind, 'audio');
    assert.equal(items[0].sourceKind, 'audio');
    const chosen = planMedia(items, 'auto', PROVIDERS.web);
    assert.equal(chosen.available[0].info.mediaType, 'audio');
    const { normalizeResource } = require('../core/provider.js');
    assert.throws(() => normalizeResource({ id: 'x', url: 'https://cdn.example.org/x.mp4', isVideo: false, kind: 'video', sourceKind: 'video', format: 'mp4' }), /agree with isVideo/);
    assert.equal(planMedia(items, 'image', PROVIDERS.web).available.length, 1);
});

test('safe streaming supports WebM video and MP3 audio without full buffering', async (t) => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'sget-stream-'));
    t.after(() => fs.rm(folder, { recursive: true, force: true }));
    for (const [format, contentType, body, kind] of [
        ['webm', 'video/webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0]), 'video'],
        ['mp3', 'audio/mpeg', Buffer.from('ID3xyz'), 'audio'],
        ['ogg', 'audio/ogg', Buffer.from('OggSxxxx'), 'audio'],
    ]) {
        const entry = { id: format, url: `https://cdn.example.org/${format}.${format}`, isVideo: kind === 'video', kind,
            sourceKind: kind, format };
        const result = await downloadMedia(entry, { output: folder, validateUrl: validatePublicUrl,
            fetchImpl: async () => new Response(body, { headers: { 'content-type': contentType } }) });
        assert.deepEqual(await fs.readFile(result.path), body);
        assert.ok(result.path.endsWith('.' + format));
    }
});

test('HTML media discovery selects high-resolution srcset, lazy-loaded images and video posters', () => {
    const html = [
        '<img src="https://img.example.org/thumb.jpg" srcset="https://img.example.org/small.jpg 480w, https://img.example.org/full.webp 1600w">',
        '<img src="data:image/gif;base64,AAAA" data-src="https://img.example.org/lazy.png">',
        '<picture><source type="image/webp" srcset="https://img.example.org/one.webp 1x, https://img.example.org/two.webp 2x"></picture>',
        '<video poster="https://img.example.org/poster.jpg"><source type="video/mp4" src="https://media.example.org/clip.mp4"></video>',
    ].join('');
    const urls = parsePageMedia(html, 'https://gallery.example.org/item', { all: true });
    assert.deepEqual(urls.map((item) => item.url), [
        'https://img.example.org/full.webp',
        'https://img.example.org/lazy.png',
        'https://img.example.org/two.webp',
        'https://img.example.org/poster.jpg',
        'https://media.example.org/clip.mp4',
    ]);
    assert.equal(urls[3].sourceKind, 'video-poster');
    assert.equal(urls[4].isVideo, true);
    const fallback = parsePageMedia('<img src="https://img.example.org/fallback.jpg" srcset="javascript:alert(1) 2x">', 'https://gallery.example.org/item', { all: true });
    assert.equal(fallback[0].url, 'https://img.example.org/fallback.jpg');
});

test('indexed FIFO download limiter retains strict concurrency and order for a large mixed batch', async () => {
    const { createLimiter } = require('../bin/ig-downloader.js');
    assert.throws(() => createLimiter(0), /positive integer/);
    let active = 0;
    let peak = 0;
    const starts = [];
    const schedule = createLimiter(3);
    const jobs = await Promise.all(Array.from({ length: 2400 }, (_, index) => schedule(async () => {
        starts.push(index);
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        if (index === 317) throw new Error('expected per-item failure');
        return index;
    }).then((value) => ({ value }), (error) => ({ error: error.message }))));
    assert.equal(peak, 3);
    assert.deepEqual(starts, Array.from({ length: 2400 }, (_, index) => index));
    assert.deepEqual(jobs[317], { error: 'expected per-item failure' });
    assert.deepEqual(jobs[2399], { value: 2399 });
});
