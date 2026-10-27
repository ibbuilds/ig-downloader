'use strict';

const { createUrlPolicy } = require('../core/url-policy.js');
module.exports = {
    id: 'example',
    name: 'Example fixture',
    match(input) {
        try { return new URL(input).hostname === 'example.test'; } catch { return false; }
    },
    parse(input) { return { url: input, type: 'post' }; },
    async resolve() {
        return { username: 'fixture', items: [{ id: 'sample', url: 'https://media.example.test/photo.jpg' }] };
    },
    select(item) {
        return { id: item.id, url: item.url, sourceKind: 'image', isVideo: false, format: 'jpg', width: 8, height: 8 };
    },
    validateUrl: createUrlPolicy(['media.example.test']),
};
