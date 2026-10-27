#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { pack, npm } = require('./package-release.js');
const { packageExtension } = require('./package-extension.js');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sget-package-'));
try {
    const result = pack(path.join(temp, 'artifacts'));
    const first = fs.readFileSync(path.join(result.output, result.extension));
    packageExtension(root, result.output);
    assert.deepEqual(fs.readFileSync(path.join(result.output, result.extension)), first, 'ZIP must be reproducible');
    const prefix = path.join(temp, 'installed');
    npm(['install', '--global', '--prefix', prefix, '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
        path.join(result.output, result.cli)]);
    const moduleRoot = path.join(prefix, ...(process.platform === 'win32' ? [] : ['lib']), 'node_modules', 'ig-downloader');
    const installed = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'package.json')));
    for (const command of ['sget', 'igd', 'ig-downloader']) {
        const shim = process.platform === 'win32' ? path.join(prefix, command + '.cmd') : path.join(prefix, 'bin', command);
        assert.ok(fs.existsSync(shim), `Missing installed executable: ${command}`);
        const output = execFileSync(process.execPath, [path.join(moduleRoot, installed.bin[command]), '-v'], { encoding: 'utf8' });
        assert.equal(output.trim(), installed.version);
    }
    const input = path.join(temp, 'input.json');
    fs.writeFileSync(input, JSON.stringify({ items: [{ pk: '42', media_type: 1,
        image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/fixture.jpg', width: 2, height: 2 }] },
    }] }));
    const preview = execFileSync(process.execPath, [path.join(moduleRoot, installed.bin.sget), '-nJ', '--input-json', input], { encoding: 'utf8' });
    assert.equal(JSON.parse(preview).media[0].sourceKind, 'image');
    console.log(`Package smoke passed: ${result.files.length} CLI files; ${result.extensionFiles.length} extension files; three aliases; offline preview; reproducible ZIP.`);
} catch (error) {
    console.error(error.message);
    if (error.stderr) console.error(String(error.stderr));
    process.exitCode = 1;
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
