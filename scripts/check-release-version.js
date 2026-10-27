#!/usr/bin/env node
'use strict';
const fs = require('node:fs');

function releaseKind(tag, cliVersion, extensionVersion) {
    if (tag === `cli-v${cliVersion}`) return 'cli';
    if (tag === `extension-v${extensionVersion}` || tag === `v${extensionVersion}`) return 'extension';
    throw new Error(`Version mismatch or unsupported release tag: ${tag}`);
}
if (require.main === module) {
    try {
        const tag = process.env.GITHUB_REF_NAME || process.argv[2] || '';
        if (!/^(?:cli-|extension-)?v\d+\.\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.-]+)?$/.test(tag)) {
            throw new Error('Expected cli-vVERSION or extension-vVERSION. Legacy vVERSION is extension-only.');
        }
        const kind = releaseKind(tag, require('../package.json').version, require('../manifest.json').version);
        if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `kind=${kind}\n`);
        console.log(`Validated ${kind} release ${tag}; no tags were modified.`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { releaseKind };
