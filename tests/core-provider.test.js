'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRegistry, assertProvider, normalizeResource } = require('../core/provider.js');
const { createUrlPolicy } = require('../core/url-policy.js');
const { downloadMedia } = require('../lib/download.js');
const example = require('../test-support/example-provider.js');

const CLI = path.resolve('bin/ig-downloader.js');

test('registry isolates providers and rejects collisions, ambiguity and invalid contracts', () => {
    const registry = createRegistry([example]);
    assert.equal(registry.resolveTarget('https://example.test/post/1').provider.id, 'example');
    assert.equal(registry.list().length, 1);
    assert.throws(() => registry.register(example), /Duplicate provider/);
    assert.throws(() => registry.register({ id: 'bad!' }), /lowercase/);
    assert.throws(() => assertProvider({ id: 'test', name: 'Test', match: () => true }), /requires parse/);
    const alt = { ...example, id: 'example-alt' };
    registry.register(alt);
    assert.throws(() => registry.resolveTarget('https://example.test/post/1'), /Ambiguous URL/);
    assert.throws(() => registry.resolveTarget('https://unknown.test/post/1'), /Unsupported provider/);
});

test('normalized resources have HTTPS URLs and explicit provenance', () => {
    const sample = example.select({ id: 'a', url: 'https://media.example.test/a.jpg' });
    assert.equal(normalizeResource(sample).sourceKind, 'image');
    assert.equal(normalizeResource(null), null);
    assert.throws(() => normalizeResource({ ...sample, url: 'http://media.example.test/a.jpg' }), /HTTPS/);
    assert.throws(() => normalizeResource({ ...sample, isVideo: 'no' }), /isVideo/);
    assert.throws(() => normalizeResource({ ...sample, format: '../../etc' }), /extension/);
    assert.throws(() => normalizeResource({ ...sample, width: -2 }), /width/);
});

test('per-provider URL policies validate every redirect, including redirects to another host', async (t) => {
    const policy = createUrlPolicy(['media.example.test']);
    assert.equal(policy('https://media.example.test/photo.jpg'), 'https://media.example.test/photo.jpg');
    assert.throws(() => policy('https://media.example.test.evil.test/file.jpg'), /Refusing/);
    assert.throws(() => policy('https://media.example.test:8443/file.jpg'), /Refusing/);
    assert.throws(() => policy('http://media.example.test/a.jpg'), /Refusing/);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igd-policy-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await assert.rejects(downloadMedia(example.select({ id: 'a', url: 'https://media.example.test/a.jpg' }), {
        output: root,
        validateUrl: policy,
        fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/photo.jpg' } }),
    }), /Refusing/);
    const files = await fs.readdir(root);
    assert.deepEqual(files, []);
});

test('explicit plugin works end-to-end without modifying the CLI or Instagram adapter', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igd-plugin-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const plugin = path.resolve('test-support/example-provider.js');
    const proc = spawnSync(process.execPath, [
        '--require', path.resolve('test-support/mock-generic-network.js'), CLI,
        'https://example.test/post/123', '--plugin', plugin, '-o', root, '--json',
    ], { encoding: 'utf8' });
    assert.equal(proc.status, 0, proc.stderr);
    const report = JSON.parse(proc.stdout);
    assert.equal(report.saved[0].mediaType, 'image');
    assert.equal((await fs.readdir(root)).length, 1);
    assert.throws(() => createRegistry([{ ...example, validateUrl: null }]), /requires validateUrl/);
});
