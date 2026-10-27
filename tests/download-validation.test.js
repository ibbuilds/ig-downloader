'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { downloadMedia } = require('../lib/download.js');

const URL = 'https://scontent.cdninstagram.com/media';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function ftyp(brand, compatibles = []) {
    const bytes = Buffer.alloc(16 + compatibles.length * 4);
    bytes.writeUInt32BE(bytes.length, 0);
    bytes.write('ftyp', 4);
    bytes.write(brand, 8);
    compatibles.forEach((compatible, index) => bytes.write(compatible, 16 + index * 4));
    return bytes;
}

async function withDownload(t, { bytes, contentType, isVideo = false, format = 'jpg', status = 200, headers = {} }) {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), 'igd-signature-'));
    t.after(() => fs.rm(output, { recursive: true, force: true }));
    const media = { url: URL, id: '42', isVideo, format };
    const fetchImpl = async () => new Response(bytes, {
        status,
        headers: { 'content-type': contentType, ...headers },
    });
    return { output, run: () => downloadMedia(media, { output, fetchImpl }) };
}

test('does not save an HTTP 200 HTML error page disguised as JPEG', async (t) => {
    const { output, run } = await withDownload(t, { bytes: '<html>expired</html>', contentType: 'image/jpeg' });
    await assert.rejects(run(), /Media payload does not match expected jpg format/);
    assert.deepEqual(await fs.readdir(output), []);
});

test('rejects empty, truncated and partial CDN responses', async (t) => {
    const empty = await withDownload(t, { bytes: '', contentType: 'image/jpeg' });
    await assert.rejects(empty.run(), /empty media body/);
    assert.deepEqual(await fs.readdir(empty.output), []);

    const short = await withDownload(t, {
        bytes: JPEG, contentType: 'image/jpeg', headers: { 'content-length': '999' },
    });
    await assert.rejects(short.run(), /Content-Length mismatch/);
    assert.deepEqual(await fs.readdir(short.output), []);

    const partial = await withDownload(t, { bytes: JPEG, contentType: 'image/jpeg', status: 206 });
    await assert.rejects(partial.run(), /partial content \(206\)/);
    assert.deepEqual(await fs.readdir(partial.output), []);
});

test('rejects media body when the signature contradicts its MIME type', async (t) => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const { run } = await withDownload(t, { bytes: png, contentType: 'image/jpeg' });
    await assert.rejects(run(), /expected jpg format \(png\)/);
});

test('accepts common image/video signatures and streams without changing the bytes', async (t) => {
    const cases = [
        ['jpg', 'image/jpeg', JPEG, false],
        ['png', 'image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]), false],
        ['gif', 'image/gif', Buffer.from('GIF89a----'), false],
        ['webp', 'image/webp', Buffer.from('RIFF0000WEBP----'), false],
        ['avif', 'image/avif', ftyp('avif', ['mif1']), false],
        ['heic', 'image/heic', ftyp('heic', ['mif1']), false],
        ['heif', 'image/heif', ftyp('mif1'), false],
        ['mp4', 'video/mp4', ftyp('isom', ['mp42']), true],
        ['mov', 'video/quicktime', ftyp('qt  '), true],
    ];
    for (const [format, contentType, bytes, isVideo] of cases) {
        const { run } = await withDownload(t, { bytes, contentType, format, isVideo });
        const result = await run();
        assert.deepEqual(await fs.readFile(result.path), bytes, format);
        assert.equal(result.bytes, bytes.length, format);
        assert.ok(result.path.endsWith('.' + format), format);
    }
});
