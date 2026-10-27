'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { archiveKey, openArchive } = require('../core/archive.js');
const { parseArgs } = require('../bin/ig-downloader.js');

const CLI = path.resolve('bin/ig-downloader.js');
const SOURCE = 'https://example.test/post/42?session=NOT_FOR_ARCHIVE';
const MEDIA = { id: '42', url: 'https://media.example.test/pic.jpg?token=SECRET',
    sourceKind: 'image', format: 'jpg', isVideo: false };

test('archive identity is stable across signed CDN URL rotations and never persists raw links', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sget-archive-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const file = path.join(root, 'archive.txt');
    const archive = await openArchive(file);
    const key = archiveKey('example', SOURCE, MEDIA, 'auto');
    const rotated = archiveKey('example', SOURCE, { ...MEDIA, url: 'https://media.example.test/pic.jpg?token=ROTATED' }, 'auto');
    assert.equal(key, rotated);
    assert.notEqual(key, archiveKey('example', SOURCE, MEDIA, 'image'));
    assert.notEqual(key, archiveKey('reddit', SOURCE, MEDIA, 'auto'));
    assert.equal((await archive.run(key, async () => ({ path: 'download.jpg' }))).skipped, false);
    assert.equal((await archive.run(key, async () => { throw Error('Must not run'); })).skipped, true);
    const contents = await fs.readFile(file, 'utf8');
    assert.match(contents, /^[0-9a-f]{64}\n$/);
    assert.doesNotMatch(contents, /SECRET|NOT_FOR_ARCHIVE|example/);
    const reopened = await openArchive(file);
    assert.equal(reopened.has(key), true);
});

test('concurrent duplicate archive tasks share work; failure does not record a download', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sget-archive-race-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const file = path.join(root, 'history.txt');
    const archive = await openArchive(file);
    const key = archiveKey('example', SOURCE, MEDIA, 'auto');
    let transfers = 0;
    const results = await Promise.all(Array.from({ length: 16 }, () => archive.run(key, async () => {
        transfers++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 'done';
    })));
    assert.equal(transfers, 1);
    assert.equal(results.filter((result) => result.skipped).length, 15);
    const failed = archiveKey('example', SOURCE, { ...MEDIA, id: 'failure' }, 'auto');
    await assert.rejects(archive.run(failed, async () => { throw Error('Network failed'); }), /Network failed/);
    assert.equal(archive.has(failed), false);
    assert.equal((await archive.run(failed, async () => 'recovered')).value, 'recovered');
    assert.equal((await fs.readFile(file, 'utf8')).trim().split('\n').length, 2);
});

test('archive rejects corrupt and oversized files, and preview/URL modes cannot use it', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sget-archive-invalid-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const file = path.join(root, 'history.txt');
    await fs.writeFile(file, 'not-a-hash\n');
    await assert.rejects(openArchive(file), /Invalid download archive entry/);
    assert.throws(() => parseArgs(['-s', file, '-n', SOURCE]), /only available when downloading/);
    assert.throws(() => parseArgs(['-s', file, '-u', SOURCE]), /only available when downloading/);
    assert.equal(parseArgs(['-s' + file, SOURCE]).archive, file);
});

test('CLI stores only successful resources and skips repeat downloads across runs', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sget-archive-cli-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const archive = path.join(root, 'history.txt');
    const output = path.join(root, 'media');
    const args = ['--require', path.resolve('test-support/mock-generic-network.js'), CLI,
        '--plugin', path.resolve('test-support/example-provider.js'), SOURCE, '-s', archive, '-o', output, '-J'];
    const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const one = JSON.parse(first.stdout);
    assert.equal(one.saved.length, 1);
    assert.deepEqual(one.skipped, []);
    const second = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    const two = JSON.parse(second.stdout);
    assert.equal(two.saved.length, 0);
    assert.equal(two.skipped.length, 1);
    assert.equal((await fs.readdir(output)).length, 1);
    assert.match(await fs.readFile(archive, 'utf8'), /^[a-f0-9]{64}\n$/);
});

test('one failed transfer is shared by every concurrent duplicate, then a later attempt can retry', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sget-archive-failure-fanout-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const file = path.join(root, 'history.txt');
    const archive = await openArchive(file);
    const key = archiveKey('example', SOURCE, MEDIA, 'auto');
    let transfers = 0;
    const results = await Promise.allSettled(Array.from({ length: 32 }, () => archive.run(key, async () => {
        transfers++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('upstream unavailable');
    })));
    assert.equal(transfers, 1, 'concurrent failures must not fan out into multiple retries');
    assert.ok(results.every((result) => result.status === 'rejected' && result.reason.message === 'upstream unavailable'));
    assert.equal(archive.has(key), false);
    assert.equal((await archive.run(key, async () => { transfers++; return 'retry succeeded'; })).value, 'retry succeeded');
    assert.equal(transfers, 2);
    assert.match(await fs.readFile(file, 'utf8'), /^[a-f0-9]{64}\n$/);
});
