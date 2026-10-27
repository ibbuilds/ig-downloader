'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { spawnSync } = require('node:child_process');
const { parseArgs, loadTargets, mapLimit } = require('../bin/ig-downloader.js');
const { resolveTarget, PROVIDERS } = require('../lib/providers.js');
const { createInstagramSession, getInstagramItems } = require('../lib/instagram.js');

const CLI = path.resolve('bin/ig-downloader.js');

const item = (pk) => ({
    pk,
    media_type: 1,
    image_versions2: { candidates: [{ url: `https://scontent.cdninstagram.com/${pk}.jpg`, width: 1080, height: 1920 }] },
});

test('igd alias and subcommands retain backwards compatible CLI', () => {
    const pkg = require('../package.json');
    assert.equal(pkg.bin.igd, pkg.bin['ig-downloader']);
    assert.equal(parseArgs(['get', '@example']).command, 'get');
    assert.equal(parseArgs(['urls', '@example']).urlOnly, true);
    assert.equal(parseArgs(['inspect', '@example']).dryRun, true);
    assert.equal(parseArgs(['@example', '-o', 'media', '-m', 'auto', '-j', '8']).concurrency, 8);
    assert.throws(() => parseArgs(['-j', '9']), /Concurrency/);
    assert.throws(() => parseArgs(['--url-only', '--dry-run', 'https://www.instagram.com/p/abc']), /either/);
    assert.throws(() => parseArgs(['--input-json', 'fixture.json', '-f', 'links.txt']), /cannot be combined/);
    const help = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /igd/);
    const sites = spawnSync(process.execPath, [CLI, 'providers', '--json'], { encoding: 'utf8' });
    assert.equal(sites.status, 0);
    assert.deepEqual(JSON.parse(sites.stdout), { supported: ['instagram'] });
});

test('batch target input supports comments, files, stdin and stable deduplication', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igd-targets-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const file = path.join(root, 'links.txt');
    await fs.writeFile(file, '# comments ignored\n@foo\n@bar\n@foo\n');
    const args = parseArgs(['get', '@bar', '-f', file, '-']);
    const urls = await loadTargets(args, Readable.from(['# another comment\n@baz\n@foo\n']));
    assert.deepEqual(urls, ['@bar', '@baz', '@foo']); // stdin is processed at positional position
    assert.deepEqual(Object.keys(PROVIDERS), ['instagram']);
    assert.equal(resolveTarget('@test').provider.id, 'instagram');
    assert.equal(resolveTarget('https://www.patreon.com/creator').provider.id, 'web');
});

test('global pool does not exceed requested concurrency and preserves result order', async () => {
    let active = 0;
    let peak = 0;
    const jobs = Array.from({ length: 18 }, (_, i) => i);
    const values = await mapLimit(jobs, 3, async (i) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, (18 - i) % 4));
        active--;
        if (i === 7) throw new Error('expected failure');
        return i * 2;
    });
    assert.equal(peak, 3);
    assert.deepEqual(values[0], { ok: true, value: 0 });
    assert.deepEqual(values[7], { ok: false, error: 'expected failure' });
    assert.deepEqual(values[17], { ok: true, value: 34 });
});

test('command-scoped Instagram session shares homepage, search and Story GraphQL results', async () => {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
        calls.push({ url, name: new URLSearchParams(options.body || '').get('fb_api_req_friendly_name') });
        if (!options.method) return new Response('"DTSGInitialData",[],{"token":"test"}');
        if (calls.at(-1).name === 'PolarisSearchBoxRefetchableQuery') {
            return Response.json({ data: { xdt_api__v1__fbsearch__topsearch_connection: { users: [{ user: { username: 'example', id: '42' } }] } } });
        }
        return Response.json({ data: { xdt_api__v1__feed__reels_media__connection: {
            edges: [{ node: { user: { username: 'example' }, items: [item('100'), item('200')] } }],
        } } });
    };
    const session = createInstagramSession({ cookie: 'sessionid=test', fetchImpl });
    const inputs = ['100', '200', '100'];
    const results = await Promise.all(inputs.map((id) => getInstagramItems(
        { type: 'story', username: 'example', id }, { cookie: 'sessionid=test', fetchImpl, session },
    )));
    assert.deepEqual(results.map((r) => r.items[0].pk), inputs);
    assert.equal(calls.length, 3); // homepage + username + Story payload, not 9 requests
    assert.equal(calls.filter((c) => !c.name).length, 1);
});

test('JSON modes print structured metadata without downloading from CDN', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igd-json-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const file = path.join(root, 'response.json');
    await fs.writeFile(file, JSON.stringify({ user: { username: 'example' }, items: [item('100')] }));
    for (const command of ['urls', 'inspect']) {
        const run = spawnSync(process.execPath, [CLI, command, '--input-json', file, '--json'], { encoding: 'utf8' });
        assert.equal(run.status, 0, run.stderr);
        const report = JSON.parse(run.stdout);
        assert.equal(report.media[0].sourceKind, 'image');
        assert.equal(report.media[0].url, 'https://scontent.cdninstagram.com/100.jpg');
        assert.deepEqual(await fs.readdir(root), ['response.json']);
    }
});

test('full CLI batch shares requests and downloads two different Stories', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igd-batch-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const log = path.join(root, 'calls.json');
    const output = path.join(root, 'media');
    const proc = spawnSync(process.execPath, [
        '--require', path.resolve('test-support/mock-instagram-network.js'), CLI,
        'get', 'https://www.instagram.com/stories/example/100/',
        'https://www.instagram.com/stories/example/200/', '--json', '-j', '4', '-o', output,
    ], { encoding: 'utf8', env: { ...process.env, IGD_FIXTURE_LOG: log } });
    assert.equal(proc.status, 0, proc.stderr);
    const report = JSON.parse(proc.stdout);
    assert.equal(report.version, 1);
    assert.equal(report.results.length, 2);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.results.map((entry) => entry.saved[0].id), ['100', '200']);
    const names = await fs.readdir(output);
    assert.equal(names.length, 2);
    const calls = JSON.parse(await fs.readFile(log, 'utf8'));
    assert.equal(calls.filter((entry) => entry.host === 'www.instagram.com').length, 3);
    assert.equal(calls.filter((entry) => entry.host === 'scontent.cdninstagram.com').length, 2);
});

test('batch reports partial success and unsupported providers without aborting', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igd-partial-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const run = spawnSync(process.execPath, [
        '--require', path.resolve('test-support/mock-instagram-network.js'), CLI,
        'urls', 'http://www.patreon.com/creator',
        'https://www.instagram.com/stories/example/100/', '--json',
    ], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    const report = JSON.parse(run.stdout);
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].media[0].id, '100');
    assert.match(report.errors[0].error, /Unsupported provider/);
});

test('CDN semaphore globally limits active work and recovers from a rejected task', async () => {
    const { createLimiter } = require('../bin/ig-downloader.js');
    const schedule = createLimiter(2);
    let active = 0;
    let peak = 0;
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => schedule(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 3));
        active--;
        if (i === 3) throw new Error('transient');
        return i;
    }).then((v) => ({ value: v }), (error) => ({ error: error.message }))));
    assert.equal(peak, 2);
    assert.deepEqual(results[3], { error: 'transient' });
    assert.deepEqual(results[7], { value: 7 });
});

test('pipeline begins CDN transfer before slower independent target finishes resolving', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igd-pipeline-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const log = path.join(root, 'calls.json');
    const output = path.join(root, 'media');
    const proc = spawnSync(process.execPath, [
        '--require', path.resolve('test-support/mock-instagram-network.js'), CLI,
        'get', 'https://www.instagram.com/stories/example/100/',
        'https://www.instagram.com/stories/delayed/300/', '--json', '-o', output,
    ], { encoding: 'utf8', env: { ...process.env, IGD_FIXTURE_LOG: log } });
    assert.equal(proc.status, 0, proc.stderr);
    assert.equal(JSON.parse(proc.stdout).results.length, 2);
    const calls = JSON.parse(await fs.readFile(log, 'utf8'));
    const cdnFirst = calls.findIndex((call) => call.host === 'scontent.cdninstagram.com');
    const slowStory = calls.findIndex((call) => call.name === 'PolarisStoriesV3ReelPageGalleryQuery' && call.reelId === '43');
    assert.ok(cdnFirst >= 0 && slowStory >= 0 && cdnFirst < slowStory,
        `expected the first CDN request before the slow Story request: ${JSON.stringify(calls)}`);
});

test('single-letter switches make the common commands concise and unambiguous', () => {
    assert.equal(parseArgs(['@example', '-u']).urlOnly, true);
    assert.equal(parseArgs(['@example', '-n']).dryRun, true);
    assert.equal(parseArgs(['@example', '-i']).mode, 'image');
    assert.equal(parseArgs(['@example', '-a']).mode, 'auto');
    assert.equal(parseArgs(['@example', '-V']).mode, 'video');
    assert.equal(parseArgs(['@example', '-m', 'v']).mode, 'video');
    assert.equal(parseArgs(['@example', '-mi']).mode, 'image');
    assert.equal(parseArgs(['@example', '-j8']).concurrency, 8);
    assert.equal(parseArgs(['@example', '-o./media']).output, './media');
    assert.equal(parseArgs(['@example', '-nJ']).json, true);
    assert.equal(parseArgs(['@example', '-uq']).quiet, true);
    assert.equal(parseArgs(['-v']).version, true); // do not break old version flag
    assert.throws(() => parseArgs(['@example', '-i', '-V']), /Conflicting media modes/);
    assert.throws(() => parseArgs(['@example', '-u', '-n']), /either URLs or inspect/);
    assert.throws(() => parseArgs(['@example', '-jx']), /Concurrency/);
    assert.throws(() => parseArgs(['@example', '-m', 'jpeg']), /Mode must/);
});

test('piped input requires no explicit get or - argument', async () => {
    const url = 'https://www.instagram.com/stories/example/100/';
    const targets = await loadTargets(parseArgs(['-u']), Readable.from([url + '\n', '# comment\n', url + '\n']));
    assert.deepEqual(targets, [url]);
    const result = spawnSync(process.execPath, [
        '--require', path.resolve('test-support/mock-instagram-network.js'), CLI, '-u',
    ], { input: url + '\n', encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'https://scontent.cdninstagram.com/100.jpg');
});

test('short preview and compact mode work with offline media payloads', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igd-short-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const file = path.join(root, 'data.json');
    await fs.writeFile(file, JSON.stringify({
        type: 'post', data: { xdt_api__v1__media__shortcode__web_info: { items: [{
            pk: '999', media_type: 2, user: { username: 'example' },
            image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/a.jpg', width: 400, height: 500 }] },
            video_versions: [{ url: 'https://video.fbcdn.net/b.mp4', width: 1080, height: 1920 }],
        }] } },
    }));
    const result = spawnSync(process.execPath, [CLI, '-nJ', '--input-json', file, '-mi'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.mode, 'image');
    assert.equal(data.media[0].sourceKind, 'video-poster');
    assert.equal(data.media[0].mediaType, 'image');
});
