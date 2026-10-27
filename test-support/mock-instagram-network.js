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
    const body = options.body ? new URLSearchParams(options.body) : null;
    const name = body?.get('fb_api_req_friendly_name') || null;
    const variables = body ? JSON.parse(body.get('variables')) : null;
    calls.push({ host: address.hostname, name, reelId: variables?.initial_reel_id || null });
    if (address.hostname === 'scontent.cdninstagram.com') {
        const body = Buffer.from([255, 216, 255, 217]);
        return new Response(body, { headers: { 'content-type': 'image/jpeg', 'content-length': String(body.length) } });
    }
    if (address.pathname === '/') {
        return new Response('"DTSGInitialData",[],{"token":"test"}');
    }
    if (name === 'PolarisSearchBoxRefetchableQuery') {
        const username = variables.data.query;
        if (username === 'delayed') await new Promise((resolve) => setTimeout(resolve, 100));
        return Response.json({ data: {
            xdt_api__v1__fbsearch__topsearch_connection: { users: [{ user: { id: username === 'delayed' ? '43' : '42', username } }] },
        } });
    }
    if (name === 'PolarisStoriesV3ReelPageGalleryQuery') {
        return Response.json({ data: {
            xdt_api__v1__feed__reels_media__connection: {
                edges: [{ node: { user: { username: variables.initial_reel_id === '43' ? 'delayed' : 'example' },
                    items: variables.initial_reel_id === '43' ? [story('300')] : [story('100'), story('200')] } }],
            },
        } });
    }
    throw new Error('Unexpected mock request: ' + name);
};
