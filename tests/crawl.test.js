'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pageLinks, crawlPublicSite } = require('../core/crawl.js');
const { parseArgs } = require('../bin/ig-downloader.js');

const BASE = 'https://gallery.example.org/root';
const CLI = path.resolve('bin/ig-downloader.js');
const fixture = {
    '/root': '<img src="https://gallery.example.org/start.jpg"><a href="/child">Next</a><a href="/child#top">Duplicate</a><a href="https://evil.example.org/steal">Outside</a>',
    '/child': '<meta property="og:video" content="https://gallery.example.org/clip.mp4"><a href="/grandchild">More</a>',
    '/grandchild': '<img src="https://gallery.example.org/end.png">',
};

function pages(log) {
    return async (url) => {
        const parsed = new URL(url);
        log.push(parsed.href);
        assert.equal(parsed.hostname, 'gallery.example.org', 'never leave starting site');
        return new Response(fixture[parsed.pathname], { headers: { 'content-type': 'text/html' } });
    };
}

test('HTML crawl stays inside exact origin, strips fragments and deduplicates links', () => {
    const links = pageLinks(fixture['/root'], BASE, 'https://gallery.example.org');
    assert.deepEqual(links, ['https://gallery.example.org/child']);
    const nested = pageLinks('<a href="https://127.0.0.1/private">bad</a><a href="/child?q=1&amp;x=2">good</a>', BASE,
        'https://gallery.example.org');
    assert.deepEqual(nested, ['https://gallery.example.org/child?q=1&x=2']);
});

test('depth and page limits prevent unbounded traversals without exposing credentials', async () => {
    const log = [];
    const first = await crawlPublicSite(BASE, { fetchImpl: pages(log), depth: 0, maxPages: 20 });
    assert.equal(first.pagesVisited, 1);
    assert.equal(first.items.length, 1);
    const second = await crawlPublicSite(BASE, { fetchImpl: pages(log), depth: 2, maxPages: 2 });
    assert.equal(second.pagesVisited, 2);
    assert.equal(second.items.length, 2);
    const full = await crawlPublicSite(BASE, { fetchImpl: pages(log), depth: 2, maxPages: 3 });
    assert.equal(full.pagesVisited, 3);
    assert.equal(full.items.length, 3);
    assert.equal(full.items[0].sourceKind, 'page-image');
    assert.equal(full.items[1].isVideo, true);
    assert.equal(log.every((url) => new URL(url).origin === 'https://gallery.example.org'), true);
    await assert.rejects(crawlPublicSite(BASE, { depth: 9 }), /Crawl depth/);
    await assert.rejects(crawlPublicSite(BASE, { maxPages: 21 }), /Crawl page limit/);
});

test('cross-site redirect is rejected before requesting the redirected target', async () => {
    const visited = [];
    await assert.rejects(crawlPublicSite(BASE, { fetchImpl: async (url) => {
        visited.push(url);
        return new Response(null, { status: 302, headers: { location: 'https://evil.example.org/steal' } });
    } }), /outside the starting origin/);
    assert.deepEqual(visited, [BASE]);
});

test('CLI crawl supports short flags, real mocked transfers and hashed archive skips', async (t) => {
    assert.equal(parseArgs(['crawl', BASE, '-d2', '-L3']).crawl, true);
    assert.equal(parseArgs(['-r', BASE]).depth, 1);
    assert.throws(() => parseArgs([BASE, '-L5']), /Use -r/);
    assert.throws(() => parseArgs(['crawl', BASE, '-d3']), /depth/);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sget-crawl-cli-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const archive = path.join(root, 'seen');
    const output = path.join(root, 'media');
    const log = path.join(root, 'requests.json');
    const args = ['--require', path.resolve('test-support/mock-crawl-network.js'), CLI,
        'crawl', BASE, '-d1', '-L2', '-s', archive, '-o', output, '-J'];
    const first = spawnSync(process.execPath, args, { encoding: 'utf8',
        env: { ...process.env, SGET_CRAWL_LOG: log, IG_COOKIE: 'should-not-be-forwarded=1' } });
    assert.equal(first.status, 0, first.stderr);
    const one = JSON.parse(first.stdout);
    assert.equal(one.saved.length, 2);
    assert.equal(one.saved.filter((media) => media.mediaType === 'video').length, 1);
    const requests = JSON.parse(await fs.readFile(log, 'utf8'));
    assert.ok(requests.every((r) => r.host === 'gallery.example.org' && r.cookie === ''));
    const second = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).skipped.length, 2);
    assert.equal((await fs.readdir(output)).length, 2);
});
