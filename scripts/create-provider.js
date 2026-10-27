#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const name = process.argv[2];
const idPattern = /^[a-z][a-z0-9-]{1,39}$/;

function createProvider(id) {
    if (!idPattern.test(id || '')) {
        throw new Error('Usage: npm run create:provider -- <lowercase-id> (2–40 characters)');
    }
    const registryPath = path.join(root, 'providers', 'registry.json');
    const ids = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (ids.includes(id)) throw new Error(`Provider ${id} already exists.`);
    const files = [
        ['index.js.tpl', `providers/${id}/index.js`],
        ['test.js.tpl', `tests/providers/${id}.test.js`],
        ['README.md.tpl', `providers/${id}/README.md`],
        ['live.yml.tpl', `.github/workflows/${id}-live.yml`],
    ];
    for (const [, relative] of files) {
        if (fs.existsSync(path.join(root, relative))) throw new Error(`File already exists: ${relative}`);
    }
    const env = id.replace(/-/g, '_').toUpperCase();
    const created = [];
    try {
        for (const [template, relative] of files) {
            const source = fs.readFileSync(path.join(root, 'templates/provider', template), 'utf8');
            const output = path.join(root, relative);
            fs.mkdirSync(path.dirname(output), { recursive: true });
            fs.writeFileSync(output, source.replaceAll('__ID__', id).replaceAll('__ENV__', env), { flag: 'wx' });
            created.push(output);
            console.log('Created ' + relative);
        }
        fs.writeFileSync(registryPath, JSON.stringify([...ids, id], null, 2) + '\n');
        console.log(`Registered ${id}. Implement TODOs before opening a PR.`);
    } catch (error) {
        for (const file of created) fs.rmSync(file, { force: true });
        throw error;
    }
}

try { createProvider(name); } catch (error) { console.error(error.message); process.exitCode = 1; }
