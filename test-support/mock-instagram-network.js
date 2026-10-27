'use strict';

// Preload in a child process to exercise the actual CLI without internet access.
const fs = require('node:fs');
const calls = [];
process.on('exit', () => {
    if (process.env.IGD_FIXTURE_LOG) fs.writeFileSync(process.env.IGD_FIXTURE_LOG, JSON.stringify(calls));
});

const story = (pk) => ({
    media_type: 1,
    pk,
    image_versions2: { candidates: [{ url: `https://scontent.cdninstagram.com/${pk}.jpg`, width: 320, height: 640 }] },
});

global.fetch = async (url, options = {}) => {
    const address = new URL(url);
    const name = options.body ? new URLSearchParams(options.body).get('fb_api_req_friendly_name') : null;
    calls.push({ host: address.hostname, name });
    if (address.hostname === 'scontent.cdninstagram.com') {
        const body = Buffer.from([255, 216, 255, 217]);
        return new Response(body, { headers: { 'content-type': 'image/jpeg', 'content-length': String(body.length) } });
    }
    if (address.pathname === '/') {
        return new Response('"DTSGInitialData",[],{"token":"test"}');
    }
    if (name === 'PolarisSearchBoxRefetchableQuery') {
        return Response.json({ data: {
            xdt_api__v1__fbsearch__topsearch_connection: { users: [{ user: { id: '42', username: 'example' } }] },
        } });
    }
    if (name === 'PolarisStoriesV3ReelPageGalleryQuery') {
        return Response.json({ data: {
            xdt_api__v1__feed__reels_media__connection: {
                edges: [{ node: { user: { username: 'example' }, items: [story('100'), story('200')] } }],
            },
        } });
    }
    throw new Error('Unexpected mock request: ' + name);
};
