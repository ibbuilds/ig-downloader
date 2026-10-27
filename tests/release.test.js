'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { crc32, zip, readAsset, extensionEntries, packageExtension } = require('../scripts/package-extension.js');
const { releaseKind } = require('../scripts/check-release-version.js');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sget-release-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'lib/js.cookie.LICENSE', 'lib/mp4box/LICENSE',
        'src/main.js', 'src/muxer/frame.html', 'lib/mp4box/decoder.mjs', 'icons/icon.png']) {
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        fs.writeFileSync(path.join(root, name), 'fixture:' + name);
    }
    const manifest = { manifest_version: 3, version: '1.2.3', icons: { 16: 'icons/icon.png' },
        content_scripts: [{ js: ['src/main.js'] }],
        web_accessible_resources: [{ resources: ['src/muxer/*', 'lib/mp4box/*'] }] };
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    return { root, manifest };
}

test('release tags keep CLI and extension versions independent and reject mismatches', () => {
    assert.equal(releaseKind('cli-v0.3.0', '0.3.0', '6.1.0'), 'cli');
    assert.equal(releaseKind('extension-v6.1.0', '0.3.0', '6.1.0'), 'extension');
    assert.equal(releaseKind('v6.1.0', '0.3.0', '6.1.0'), 'extension');
    for (const tag of ['v0.3.0', 'cli-v6.1.0', 'main', 'extension-v0.3.0']) {
        assert.throws(() => releaseKind(tag, '0.3.0', '6.1.0'), /mismatch/);
    }
});

test('ZIP uses correct CRC, deterministic headers, central directory and original bytes', () => {
    const data = Buffer.from('123456789');
    assert.equal(crc32(data), 0xcbf43926);
    const first = zip([{ name: 'a.txt', data }]);
    assert.deepEqual(first, zip([{ name: 'a.txt', data }]));
    assert.equal(first.readUInt32LE(0), 0x04034b50);
    assert.equal(first.readUInt32LE(14), 0xcbf43926);
    assert.deepEqual(first.subarray(35, 44), data);
    const end = first.length - 22;
    assert.equal(first.readUInt32LE(end), 0x06054b50);
    assert.equal(first.readUInt16LE(end + 10), 1);
    assert.equal(first.readUInt32LE(first.readUInt32LE(end + 16)), 0x02014b50);
});

test('extension artifact includes notices and manifest assets but excludes unrelated files', (t) => {
    const { root } = fixture(t);
    fs.writeFileSync(path.join(root, 'cookies.txt'), 'not a real credential');
    fs.writeFileSync(path.join(root, 'src/muxer/cookies.txt'), 'not a real credential');
    fs.writeFileSync(path.join(root, '.env'), 'fixture');
    const { entries } = extensionEntries(root);
    assert.ok(entries.some((entry) => entry.name === 'LICENSE'));
    assert.ok(entries.some((entry) => entry.name === 'lib/js.cookie.LICENSE'));
    assert.ok(entries.some((entry) => entry.name === 'lib/mp4box/decoder.mjs'));
    assert.ok(!entries.some((entry) => /cookies|\.env/.test(entry.name)));
    const output = path.join(root, 'dist');
    const result = packageExtension(root, output);
    const first = fs.readFileSync(path.join(output, result.filename));
    packageExtension(root, output);
    assert.deepEqual(fs.readFileSync(path.join(output, result.filename)), first);
});

test('asset reading rejects traversal, absolute paths, backslashes and missing files', (t) => {
    const { root } = fixture(t);
    for (const name of ['../escape', '/etc/passwd', 'C:/windows', 'src/../main.js', 'src\\main.js', '.env', 'cookies.txt', 'src/credentials.json']) {
        assert.throws(() => readAsset(root, name), /Unsafe/);
    }
    assert.throws(() => readAsset(root, 'missing.js'), /ENOENT/);
});

test('extension build fails on missing required license instead of silently dropping it', (t) => {
    const { root } = fixture(t);
    fs.unlinkSync(path.join(root, 'lib/js.cookie.LICENSE'));
    assert.throws(() => extensionEntries(root), /ENOENT/);
});

test('new wildcard resource directories require explicit packaging review', (t) => {
    const { root, manifest } = fixture(t);
    manifest.web_accessible_resources[0].resources.push('private/*');
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    assert.throws(() => extensionEntries(root), /Review new resource directory/);
});

test('symlinked resources are refused', (t) => {
    const { root } = fixture(t);
    const link = path.join(root, 'linked');
    try { fs.symlinkSync(path.join(root, 'src'), link, 'junction'); }
    catch (error) {
        if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Host does not allow symlink creation'); return; }
        throw error;
    }
    assert.throws(() => readAsset(root, 'linked/main.js'), /Symlink/);
});
