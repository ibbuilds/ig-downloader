'use strict';
const fs = require('node:fs');
const calls = [];
process.on('exit', () => { if (process.env.SGET_FIXTURE_LOG) fs.writeFileSync(process.env.SGET_FIXTURE_LOG, JSON.stringify(calls)); });

global.fetch = async (url, options = {}) => {
    const host = new URL(url).hostname;
    const cookie = options.headers?.cookie || '';
    calls.push({ host, cookie, path: new URL(url).pathname });
    if (host === 'www.facebook.com') return new Response('<meta property="og:image" content="https://scontent.xx.fbcdn.net/poster.jpg">', { headers: { 'content-type': 'text/html' } });
    if (host === 'www.instagram.com' && !options.method) return new Response('"DTSGInitialData",[],{"token":"test"}', { headers: { 'content-type': 'text/html' } });
    if (host === 'www.instagram.com' && options.method === 'POST') return Response.json({ data: {
        xdt_api__v1__media__shortcode__web_info: { items: [{ pk: '123456', media_type: 1, user: { username: 'example' },
            image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/123.jpg', width: 512, height: 512 }] } }] },
    } });
    throw new Error('Unexpected request to ' + host);
};
