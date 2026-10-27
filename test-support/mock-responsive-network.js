'use strict';

const PAGE = 'https://gallery.example.org/post';
const HIGH = 'https://cdn.example.org/hero-1200.jpg';
global.fetch = async (url, options = {}) => {
    if (options.headers?.cookie || options.headers?.authorization) throw new Error('Media pages do not receive credentials.');
    if (String(url) === PAGE) return new Response(
        '<img src="https://cdn.example.org/thumbnail.jpg" srcset="https://cdn.example.org/hero-480.jpg 480w, https://cdn.example.org/hero-1200.jpg 1200w">',
        { headers: { 'content-type': 'text/html' } },
    );
    if (String(url) === HIGH) return new Response(Buffer.from([255, 216, 255, 217]), {
        headers: { 'content-type': 'image/jpeg', 'content-length': '4' },
    });
    throw new Error('Unexpected request: ' + url);
};
