'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../../providers/facebook');

test('facebook: extracts only metadata exposed by an accessible page', async () => {
    const input = 'https://www.facebook.com/user/videos/123456';
    let requests = 0;
    const result = await provider.resolve(provider.parse(input), { fetchImpl: async (url, options) => {
        requests++;
        assert.equal(url, input);
        assert.equal(options.headers.cookie, undefined);
        return new Response(`<meta property="og:video" content="https://video.xx.fbcdn.net/movie.mp4"><meta property="og:image" content="https://scontent.xx.fbcdn.net/poster.jpg">`, { headers: { 'content-type': 'text/html' } });
    } });
    assert.equal(requests, 1);
    assert.equal(result.items[0].sourceKind, 'video');
    assert.equal(result.items[1].sourceKind, 'video-poster');
    assert.equal(provider.validateUrl(result.items[0].url), result.items[0].url);
    assert.throws(() => provider.validateUrl('https://evil.net/a.mp4'), /Refusing/);
});

test('facebook: rejects inaccessible pages rather than claiming support', async () => {
    await assert.rejects(provider.resolve(provider.parse('https://www.facebook.com/user/posts/42'), {
        fetchImpl: async () => new Response('Login required', { status: 403 }),
    }), /unavailable.*403/);
});
