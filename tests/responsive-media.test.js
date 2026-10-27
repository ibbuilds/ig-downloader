'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const CLI = path.resolve('bin/ig-downloader.js');

test('public web -A downloads one highest-resolution responsive image, not a thumbnail', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sget-responsive-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const proc = spawnSync(process.execPath, [
        '--require', path.resolve('test-support/mock-responsive-network.js'),
        CLI, '-AJ', 'https://gallery.example.org/post', '-o', root,
    ], { encoding: 'utf8' });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.saved.length, 1);
    assert.equal(parsed.saved[0].bytes, 4);
    assert.equal(parsed.saved[0].sourceKind, 'page-image');
    assert.equal((await fs.readdir(root)).length, 1);
});
