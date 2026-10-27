#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertProvider } = require('../core/provider.js');
const { PROVIDERS } = require('../lib/providers.js');
const ids = require('../providers/registry.json');

function check(id) {
    if (!ids.includes(id) || !PROVIDERS[id]) throw new Error(`Unknown built-in provider: ${id}`);
    const provider = assertProvider(PROVIDERS[id]);
    const fixture = path.join(__dirname, '..', 'tests', 'providers', id + '.test.js');
    if (!fs.existsSync(fixture)) throw new Error(`Missing provider fixture tests: ${fixture}`);
    const result = spawnSync(process.execPath, ['--test', fixture], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${provider.id} fixture tests failed.`);
}

try {
    const [action, id] = process.argv.slice(2);
    if (action === '--matrix') {
        process.stdout.write(JSON.stringify({ include: ids.map((provider) => ({ provider })) }) + '\n');
    } else if (action === '--list') {
        process.stdout.write(ids.join('\n') + '\n');
    } else if (action === '--check') {
        check(id);
    } else if (action === '--all') {
        for (const name of ids) check(name);
    } else {
        throw new Error('Usage: check-providers.js --list|--matrix|--all|--check <id>');
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
