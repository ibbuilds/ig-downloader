#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { packageExtension } = require('./package-extension.js');
const ROOT = path.resolve(__dirname, '..');

function npm(args) {
    if (!process.env.npm_execpath) throw new Error('Run this script through npm run pack:release or npm run check:package.');
    return execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
}
function pack(output = path.join(ROOT, 'dist')) {
    fs.mkdirSync(output, { recursive: true });
    const [report] = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', output]));
    const files = report.files.map((f) => f.path);
    const forbidden = files.filter((file) => /(^|\/)(?:\.env(?:\.|$)|cookies?(?:\.|$)|node_modules\/|test-support\/|tests\/|dist\/)/i.test(file));
    if (forbidden.length) throw new Error('Refusing unsafe package contents: ' + forbidden.join(', '));
    for (const expected of ['LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'SECURITY.md',
        'bin/ig-downloader.js', 'core/provider.js', 'providers/registry.json', 'types/provider.d.ts']) {
        if (!files.includes(expected)) throw new Error('Missing package file: ' + expected);
    }
    const extension = packageExtension(ROOT, output);
    const artifacts = [report.filename, extension.filename];
    const checksums = artifacts.map((filename) =>
        `${createHash('sha256').update(fs.readFileSync(path.join(output, filename))).digest('hex')}  ${filename}`);
    fs.writeFileSync(path.join(output, 'SHA256SUMS'), checksums.join('\n') + '\n');
    return { output, cli: report.filename, extension: extension.filename, files, extensionFiles: extension.files };
}
if (require.main === module) {
    try { console.log(JSON.stringify(pack(process.argv[2] ? path.resolve(process.argv[2]) : undefined), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { pack, npm, ROOT };
