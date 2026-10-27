'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { downloadMedia } = require('../lib/download.js');
const { parseArgs, mapLimit } = require('../bin/ig-downloader.js');

test('download streams verified image and never overwrites files', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igd-test-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const calls = [];
    const data = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const fakeFetch = async (url, opts) => {
        calls.push({ url, opts });
        return new Response(data, { headers: { 'content-type': 'image/jpeg', 'content-length': String(data.length) } });
    };
    const item = { url: 'https://scontent.cdninstagram.com/image', id: '42', isVideo: false, takenAt: 1760000000, format: 'jpg' };
    const a = await downloadMedia(item, { output: root, username: 'person', index: 0, fetchImpl: fakeFetch });
    const b = await downloadMedia(item, { output: root, username: 'person', index: 0, fetchImpl: fakeFetch });
    assert.notEqual(a.path, b.path);
    assert.deepEqual(await fs.readFile(a.path), data);
    assert.deepEqual(await fs.readFile(b.path), data);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].opts.headers.cookie, undefined);
});

test('CDN redirect to untrusted server is refused', async () => {
    const fakeFetch = async () => new Response(null, { status: 302, headers: { location: 'https://example.net/private' } });
    await assert.rejects(
        downloadMedia({ url: 'https://scontent.cdninstagram.com/image', isVideo: false }, { fetchImpl: fakeFetch }),
        /Refusing non-Instagram/,
    );
});

test('CLI argument handling is deterministic', async () => {
    assert.equal(parseArgs(['--concurrency', '4', '--mode', 'image', '@test']).concurrency, 4);
    assert.throws(() => parseArgs(['--concurrency', '99']), /Concurrency/);
    assert.throws(() => parseArgs(['--what']), /Unknown option/);
    assert.throws(() => parseArgs(['--mode', 'jpg']), /Mode/);
    assert.deepEqual(await mapLimit([3, 1], 2, async (n) => n + 1), [
        { ok: true, value: 4 }, { ok: true, value: 2 },
    ]);
});

test('CLI works with a saved Instagram response without making network requests', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igd-fixture-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const jsonFile = path.join(root, 'fixture.json');
    await fs.writeFile(jsonFile, JSON.stringify({
        user: { username: 'example' },
        items: [{
            media_type: 2, pk: '1234567890',
            image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/img.jpg', width: 1080, height: 1920 }] },
            video_versions: [{ url: 'https://video.fbcdn.net/vid.mp4', width: 1080, height: 1920 }],
        }],
    }));
    const result = spawnSync(process.execPath, [path.resolve('bin/ig-downloader.js'), '--input-json', jsonFile, '--dry-run', '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.media[0].sourceKind, 'video-poster');
    assert.equal(report.media[0].mediaType, 'image');
});

test('extension references valid local files and preserves upstream license', async () => {
    const manifest = JSON.parse(await fs.readFile(path.resolve('manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    for (const script of manifest.content_scripts) {
        for (const filename of script.js) await fs.access(path.resolve(filename));
    }
    const first = manifest.content_scripts[0].js;
    assert.ok(first.indexOf('shared/media.js') < first.indexOf('src/js/story-media-preferences.js'));
    const license = await fs.readFile(path.resolve('LICENSE'), 'utf8');
    assert.match(license, /MIT License/);
    assert.match(license, /HOAI AN LE/);
});

test('offline post fixtures default to auto, keeping video Posts as video', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igd-post-fixture-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const jsonFile = path.join(root, 'post.json');
    await fs.writeFile(jsonFile, JSON.stringify({
        data: { xdt_api__v1__media__shortcode__web_info: { items: [{
            media_type: 2, pk: '9876543210', user: { username: 'example' },
            image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/post.jpg', width: 1080, height: 1920 }] },
            video_versions: [{ url: 'https://video.fbcdn.net/video.mp4', width: 1080, height: 1920 }],
        }] } },
    }));
    const result = spawnSync(process.execPath, [path.resolve('bin/ig-downloader.js'), '--input-json', jsonFile, '--dry-run', '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, 'auto');
    assert.equal(report.media[0].sourceKind, 'video');
    assert.equal(report.media[0].mediaType, 'video');
});
