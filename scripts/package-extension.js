#!/usr/bin/env node
'use strict';

// Dependency-free, deterministic ZIP packaging. Only manifest assets and notices
// are included; never archive the checkout, credentials, or development files.
const fs = require('node:fs');
const path = require('node:path');
const MAX_BYTES = 16 * 1024 * 1024;

function readAsset(root, name) {
    if (typeof name !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(name) ||
        name.startsWith('/') || name.split('/').some((part) => !part || part === '.' || part === '..' ||
            /^(?:\.env(?:\.|$)|cookies?(?:\.|$)|credentials?(?:\.|$))/i.test(part))) {
        throw new Error(`Unsafe extension asset path: ${name}`);
    }
    let current = root;
    for (const part of name.split('/')) {
        current = path.join(current, part);
        if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symlink not allowed: ${name}`);
    }
    const stat = fs.statSync(current);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error(`Invalid extension asset: ${name}`);
    return fs.readFileSync(current);
}

function extensionEntries(root) {
    const manifest = JSON.parse(readAsset(root, 'manifest.json'));
    if (manifest.manifest_version !== 3 || !/^\d+(\.\d+){1,3}$/.test(manifest.version)) {
        throw new Error('Expected a versioned Manifest V3 extension.');
    }
    const names = new Set(['manifest.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
        'lib/js.cookie.LICENSE', 'lib/mp4box/LICENSE']);
    const icons = (value) => typeof value === 'string' ? [value] : Object.values(value || {});
    for (const name of [...icons(manifest.icons), ...icons(manifest.action?.default_icon)]) names.add(name);
    for (const group of manifest.content_scripts || []) {
        for (const name of [...(group.js || []), ...(group.css || [])]) names.add(name);
    }
    for (const group of manifest.web_accessible_resources || []) {
        for (const pattern of group.resources || []) {
            if (!pattern.endsWith('/*')) { names.add(pattern); continue; }
            const dir = pattern.slice(0, -2);
            if (!['src/muxer', 'lib/mp4box'].includes(dir)) throw new Error(`Review new resource directory: ${dir}`);
            if (fs.lstatSync(path.join(root, dir)).isSymbolicLink()) throw new Error(`Symlink not allowed: ${dir}`);
            for (const file of fs.readdirSync(path.join(root, dir))) {
                // Restrict wildcard resources to executable/assets used by the muxer.
                if (/\.(?:js|mjs|html|css)$/.test(file)) names.add(`${dir}/${file}`);
            }
        }
    }
    const entries = [...names].sort().map((name) => ({ name, data: readAsset(root, name) }));
    if (entries.length > 512 || entries.reduce((sum, e) => sum + e.data.length, 0) > MAX_BYTES) {
        throw new Error('Extension package exceeds safety limit.');
    }
    return { manifest, entries };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
});
function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
    const chunks = [], directory = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const filename = Buffer.from(name);
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x800, 6);
        local.writeUInt16LE(33, 12); // Fixed DOS date: 1980-01-01. STORE, no compression.
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(filename.length, 26);
        chunks.push(local, filename, data);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x800, 8);
        central.writeUInt16LE(33, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(filename.length, 28);
        central.writeUInt32LE(offset, 42);
        directory.push(central, filename);
        offset += local.length + filename.length + data.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.reduce((sum, b) => sum + b.length, 0), 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...chunks, ...directory, end]);
}

function packageExtension(root, output) {
    const { manifest, entries } = extensionEntries(root);
    fs.mkdirSync(output, { recursive: true });
    const filename = `sget-extension-${manifest.version}.zip`;
    fs.writeFileSync(path.join(output, filename), zip(entries));
    return { filename, files: entries.map((e) => e.name) };
}
if (require.main === module) {
    try {
        const root = path.resolve(__dirname, '..');
        console.log(packageExtension(root, path.resolve(process.argv[2] || path.join(root, 'dist'))).filename);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { readAsset, extensionEntries, crc32, zip, packageExtension };
