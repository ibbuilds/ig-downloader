'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../../providers/instagram');
const { assertProvider, normalizeResource } = require('../../core/provider.js');

const image = 'https://scontent.cdninstagram.com/media/photo.jpg';

test('Instagram implements the provider contract and target routing', () => {
    assert.equal(assertProvider(provider), provider);
    assert.equal(provider.match('@creator'), true);
    assert.equal(provider.match('https://instagram.com/reel/SHORTCODE/'), true);
    assert.equal(provider.match('https://patreon.com/posts/abc'), false);
    assert.equal(provider.parse('https://instagram.com/reel/SHORTCODE/').shortcode, 'SHORTCODE');
});

test('Instagram selects resources with explicit provenance and strict CDN limits', () => {
    const selected = provider.select({ media_type: 2, pk: '123',
        image_versions2: { candidates: [{ url: image, width: 500, height: 500 }] },
        video_versions: [{ url: 'https://video.fbcdn.net/stream.mp4' }],
    }, 'image');
    assert.equal(normalizeResource(selected).sourceKind, 'video-poster');
    assert.equal(provider.validateUrl(image), image);
    assert.throws(() => provider.validateUrl('https://evil.test/a.jpg'), /Refusing/);
    assert.throws(() => provider.validateUrl('http://scontent.cdninstagram.com/a.jpg'), /Refusing/);
});
