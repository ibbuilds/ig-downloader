'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../../providers/twitter');

test('x: publicly exposed player stream and poster are not confused', async () => {
    const result = await provider.resolve(provider.parse('https://x.com/user/status/1'), {
        fetchImpl: async () => new Response(`<meta name="twitter:player:stream" content="https://video.twimg.com/v.mp4"><meta name="twitter:image" content="https://pbs.twimg.com/preview.jpg">`, { headers: { 'content-type': 'text/html' } }),
    });
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].isVideo, true);
    assert.equal(result.items[1].sourceKind, 'video-poster');
    assert.equal(provider.validateUrl(result.items[0].url), result.items[0].url);
});
