'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../../providers/reddit');

function mockPost(data) {
    return [{ data: { children: [{ data }] } }, { data: { children: [] } }];
}

test('reddit: parses posts and galleries and selects full-resolution gallery images', async () => {
    const input = provider.parse('https://www.reddit.com/r/pics/comments/abc123/some-title');
    assert.equal(input.id, 'abc123');
    let seen = 0;
    const result = await provider.resolve(input, { fetchImpl: async (url, options) => {
        seen++;
        assert.match(url, /comments\/abc123\.json/);
        assert.match(options.headers['user-agent'], /sget/);
        return Response.json(mockPost({ id: 'abc123', author: 'test', gallery_data: { items: [{ media_id: 'first' }, { media_id: 'second' }] }, media_metadata: {
            first: { s: { u: 'https://i.redd.it/one.jpg?x=1&amp;y=2' } },
            second: { s: { u: 'https://i.redd.it/two.png' } },
        } }));
    } });
    assert.equal(seen, 1);
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].url, 'https://i.redd.it/one.jpg?x=1&y=2');
    assert.equal(result.items[1].sourceKind, 'image');
});

test('reddit: video fallback warns about missing audio', async () => {
    const result = await provider.resolve(provider.parse('https://redd.it/abc12'), { fetchImpl: async () => Response.json(mockPost({
        id: 'abc12', author: 'tester', media: { reddit_video: { fallback_url: 'https://v.redd.it/abc12/DASH_720.mp4' } },
    })) });
    assert.equal(result.items[0].sourceKind, 'video-may-lack-audio');
    assert.equal(result.items[0].isVideo, true);
});

test('reddit: when anonymous JSON is denied, uses explicitly labeled public preview if present', async () => {
    const result = await provider.resolve(provider.parse('https://redd.it/abc12'), { fetchImpl: async (url) =>
        url.endsWith('.json?raw_json=1') ? new Response('Forbidden', { status: 403 }) :
            new Response('<meta property="og:image" content="https://preview.redd.it/abc.jpg">', { headers: { 'content-type': 'text/html' } }),
    });
    assert.equal(result.items[0].sourceKind, 'preview-image');
});
