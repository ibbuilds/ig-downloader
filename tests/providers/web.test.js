'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../../providers/web');
const { parsePageMedia } = require('../../core/page-media.js');
const { validatePublicUrl } = require('../../core/public-http.js');

const html = `<html><head>
<meta property='og:image' content='https://media.example.org/preview.jpg?x=1&amp;y=2'>
<meta property='og:video' content='https://cdn.example.org/actual.mp4'>
<meta property='og:video' content='https://www.youtube.com/embed/ABC'>
</head><body><img src='https://media.example.org/photo.png'><img src='/relative.jpg'></body></html>`;

test('web: HTTPS page metadata distinguishes playable video from preview and ignores embeds', async () => {
    const page = 'https://news.example.org/p/a';
    const impl = async () => new Response(html, { headers: { 'content-type': 'text/html' } });
    const response = await provider.resolve(provider.parse(page), { fetchImpl: impl });
    assert.equal(response.items.length, 2);
    assert.equal(response.items[0].isVideo, true);
    assert.equal(response.items[0].sourceKind, 'video');
    assert.equal(response.items[1].sourceKind, 'video-poster');
    assert.equal(response.items[1].url, 'https://media.example.org/preview.jpg?x=1&y=2');
    assert.equal(provider.select(response.items[0], 'image'), null);
    assert.equal(provider.select(response.items[1], 'video'), null);
    assert.equal(provider.validateUrl(response.items[0].url), response.items[0].url);
});

test('web: all page-media mode collects visible img/src without requesting unrelated URLs', async () => {
    const output = parsePageMedia(html, 'https://news.example.org/p/a', { all: true });
    assert.equal(output.length, 4);
    assert.equal(output[3].url, 'https://news.example.org/relative.jpg');
    assert.ok(!output.some((i) => i.url.includes('/embed/')));
});

test('web: direct file URLs and public-host validation', async () => {
    const value = await provider.resolve(provider.parse('https://media.example.org/picture.webp'));
    assert.equal(value.items[0].format, 'webp');
    assert.throws(() => validatePublicUrl('https://127.0.0.1/file.mp4'), /Refusing/);
    assert.throws(() => validatePublicUrl('https://[::1]/file.mp4'), /Refusing/);
    assert.throws(() => validatePublicUrl('https://localhost/file.mp4'), /Refusing/);
    assert.throws(() => validatePublicUrl('http://news.example.org/img.jpg'), /Refusing/);
});

test('web: rejects excessive pages and validates redirects independently', async () => {
    await assert.rejects(provider.resolve(provider.parse('https://news.example.org/post'), {
        fetchImpl: async () => new Response('x'.repeat(3 * 1024 * 1024), { headers: { 'content-type': 'text/html' } }),
    }), /size limit/);
    await assert.rejects(provider.resolve(provider.parse('https://news.example.org/post'), {
        fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/' } }),
    }), /Refusing/);
});
