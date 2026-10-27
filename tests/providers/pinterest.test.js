'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../../providers/pinterest');

test('pinterest: public pin image metadata is explicitly a preview', async () => {
    const value = await provider.resolve(provider.parse('https://www.pinterest.com/pin/12345'), {
        fetchImpl: async () => new Response('<meta property="og:image" content="https://i.pinimg.com/originals/photo.jpg">', { headers: { 'content-type': 'text/html' } }),
    });
    assert.equal(value.items[0].sourceKind, 'preview-image');
    assert.equal(provider.validateUrl(value.items[0].url), value.items[0].url);
    assert.throws(() => provider.validateUrl('https://untrusted.example.org/a.jpg'), /Refusing/);
});
