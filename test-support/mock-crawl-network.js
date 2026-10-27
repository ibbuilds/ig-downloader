'use strict';

const fs = require('node:fs');
const calls = [];
process.on('exit', () => {
    if (process.env.SGET_CRAWL_LOG) fs.writeFileSync(process.env.SGET_CRAWL_LOG, JSON.stringify(calls));
});

global.fetch = async (raw, opts = {}) => {
    const url = new URL(raw);
    calls.push({ host: url.hostname, path: url.pathname, cookie: opts.headers?.cookie || '' });
    if (!['gallery.example.org', 'cdn.assets.example.org'].includes(url.hostname)) throw Error('Unexpected outbound host ' + url.hostname);
    if (!url.pathname.endsWith('.jpg') && !url.pathname.endsWith('.mp4')) {
        let html = '';
        if (url.pathname === '/root') html = '<img src="https://gallery.example.org/start.jpg"><a href="/child">Next</a><a href="https://cdn.assets.example.org/extra.jpg">Download</a><a href="https://evil.example.org/steal">Outside</a>';
        else if (url.pathname === '/child') html = '<meta property="og:video" content="https://gallery.example.org/clip.mp4"><a href="/grandchild">More</a>';
        else if (url.pathname === '/grandchild') html = '<img src="https://gallery.example.org/end.png">';
        else throw Error('Unexpected mock page ' + url.pathname);
        return new Response(html, { headers: { 'content-type': 'text/html' } });
    }
    if (url.pathname.endsWith('.jpg')) {
        const bytes = Buffer.from([255, 216, 255, 217]);
        return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'content-length': String(bytes.length) } });
    }
    if (url.pathname.endsWith('.mp4')) {
        const bytes = Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]);
        return new Response(bytes, { headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length) } });
    }
    throw Error('Unexpected mock CDN URL ' + url.pathname);
};
