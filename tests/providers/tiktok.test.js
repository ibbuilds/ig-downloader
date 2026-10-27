'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../../providers/tiktok');

test('tiktok: extracts playable resource exposed by public hydration payload', async () => {
    const record = { __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: {
        id: '123', video: { playAddr: 'https://v16.tiktokcdn.com/stream.mp4' },
    } } } } };
    const text = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(record)}</script><meta property="og:image" content="https://p16.tiktokcdn.com/poster.jpg">`;
    const output = await provider.resolve(provider.parse('https://www.tiktok.com/@example/video/123'), {
        fetchImpl: async () => new Response(text, { headers: { 'content-type': 'text/html' } }),
    });
    assert.equal(output.items.length, 2);
    assert.equal(output.items[0].url, 'https://v16.tiktokcdn.com/stream.mp4');
    assert.equal(output.items[0].sourceKind, 'video');
    assert.equal(output.items[1].sourceKind, 'video-poster');
});

test('tiktok: inaccessible hydration and metadata are reported, not fake downloads', async () => {
    await assert.rejects(provider.resolve(provider.parse('https://www.tiktok.com/@example/video/123'), {
        fetchImpl: async () => new Response('<html>No public media</html>', { headers: { 'content-type': 'text/html' } }),
    }), /no downloadable resources/);
});
