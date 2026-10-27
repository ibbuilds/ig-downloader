#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function bundledPath(filename) {
    if (typeof filename !== 'string' || !filename || path.isAbsolute(filename)) {
        throw new Error(`Invalid extension asset path: ${filename}`);
    }
    const resolved = path.resolve(root, filename);
    if (!resolved.startsWith(root + path.sep)) throw new Error(`Asset escapes extension root: ${filename}`);
    return resolved;
}

function checkFile(filename) {
    const resolved = bundledPath(filename);
    if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) {
        throw new Error(`Missing extension asset: ${filename}`);
    }
    return resolved;
}

function checkExtension() {
    if (manifest.manifest_version !== 3) throw new Error('Expected Manifest V3.');
    if (!Array.isArray(manifest.content_scripts) || !manifest.content_scripts.length) {
        throw new Error('Extension has no content scripts.');
    }

    const scriptFiles = new Set();
    const files = new Set([...Object.values(manifest.icons || {}), manifest.action?.default_icon].filter(Boolean));
    for (const contentScript of manifest.content_scripts) {
        if (!Array.isArray(contentScript.js) || !contentScript.js.length) {
            throw new Error('A content script entry has no JavaScript files.');
        }
        for (const filename of contentScript.js) {
            files.add(filename);
            scriptFiles.add(filename);
        }
        for (const filename of contentScript.css || []) files.add(filename);
    }
    for (const filename of files) checkFile(filename);

    let resourceCount = 0;
    for (const resource of manifest.web_accessible_resources || []) {
        for (const glob of resource.resources || []) {
            if (!glob.endsWith('/*')) {
                checkFile(glob);
                resourceCount++;
                continue;
            }
            const directory = bundledPath(glob.slice(0, -2));
            if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory() ||
                !fs.readdirSync(directory).length) {
                throw new Error(`Empty or missing web-accessible resource directory: ${glob}`);
            }
            resourceCount++;
        }
    }

    for (const filename of scriptFiles) {
        try {
            execFileSync(process.execPath, ['--check', checkFile(filename)], { stdio: 'pipe' });
        } catch (error) {
            throw new Error(`Invalid extension JavaScript: ${filename}\n${String(error.stderr || error.message)}`);
        }
    }

    console.log(`Extension static check passed: ${scriptFiles.size} JS files, ${files.size} required assets, ${resourceCount} resource globs.`);
}

try {
    checkExtension();
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
