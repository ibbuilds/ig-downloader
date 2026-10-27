'use strict';

global.fetch = async (url) => {
    if (new URL(url).hostname !== 'media.example.test') throw new Error('Untrusted mock request.');
    const bytes = Buffer.from([255, 216, 255, 217]);
    return new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(bytes.length) } });
};
