'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { Readable } = require('node:stream');
const { loadTargets, parseArgs } = require('../bin/ig-downloader.js');

test('mixed provider batch never sends Instagram session to Facebook (or reverse)', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sget-cookies-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const log = path.join(directory, 'requests.json');
    const result = spawnSync(process.execPath, [
        '--require', path.resolve('test-support/mock-sites-network.js'),
        path.resolve('bin/ig-downloader.js'), '-nJ',
        'https://www.instagram.com/p/ABC12/', 'https://www.facebook.com/user/posts/123',
    ], { cwd: path.resolve('.'), encoding: 'utf8', env: {
        ...process.env, SGET_FIXTURE_LOG: log, IG_COOKIE: 'Cookie: sessionid=ig-test',
        SGET_COOKIE_FACEBOOK: 'fb-session=fb-test',
    } });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.results.length, 2);
    const requests = JSON.parse(await fs.readFile(log, 'utf8'));
    assert.ok(requests.some((r) => r.host === 'www.instagram.com' && r.cookie === 'sessionid=ig-test'));
    assert.ok(requests.some((r) => r.host === 'www.facebook.com' && r.cookie === 'fb-session=fb-test'));
    assert.ok(requests.every((r) => r.host !== 'www.facebook.com' || !r.cookie.includes('ig-test')));
    assert.ok(requests.every((r) => r.host !== 'www.instagram.com' || !r.cookie.includes('fb-test')));
    assert.doesNotMatch(result.stdout + result.stderr, /ig-test|fb-test/);
});

test('streaming target input limits oversized pipes before unbounded buffering', async () => {
    const chunks = Readable.from([Buffer.alloc(2 * 1024 * 1024, 'a'), Buffer.alloc(2, 'b')]);
    await assert.rejects(loadTargets(parseArgs(['-']), chunks), /2 MB safety limit/);
});


test('provider rate limiting stops further requests to that site but permits other providers', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sget-throttle-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const log = path.join(directory, 'requests.json');
    const result = spawnSync(process.execPath, [
        '--require', path.resolve('test-support/mock-sites-network.js'),
        path.resolve('bin/ig-downloader.js'), '-nJ', '-j1',
        'https://www.facebook.com/rate-limited',
        'https://www.facebook.com/posts/another',
        'https://www.instagram.com/p/ABC12/',
    ], { cwd: path.resolve('.'), encoding: 'utf8', env: {
        ...process.env, SGET_FIXTURE_LOG: log,
    } });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].provider, 'instagram');
    assert.equal(report.errors.length, 2);
    assert.match(report.errors[0].error, /429/);
    assert.match(report.errors[1].error, /paused after HTTP 429/);
    const calls = JSON.parse(await fs.readFile(log, 'utf8'));
    assert.equal(calls.filter((entry) => entry.host === 'www.facebook.com').length, 1);
    assert.ok(calls.some((entry) => entry.host === 'www.instagram.com'));
});
