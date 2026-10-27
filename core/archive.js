'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;

/** No raw target URLs, cookies or ephemeral signed CDN addresses are persisted. */
function archiveKey(providerId, target, media, mode) {
    if (!providerId || !target || !media || !mode) throw new TypeError('Incomplete archive identity.');
    const stableId = media.id == null || media.id === '' ? media.url : String(media.id);
    const identity = JSON.stringify([
        providerId, target, stableId, mode, Boolean(media.isVideo), media.kind || '', media.sourceKind, media.format,
    ]);
    return createHash('sha256').update(identity).digest('hex');
}

async function openArchive(filename) {
    const location = path.resolve(filename);
    let text = '';
    try {
        const stat = await fs.stat(location);
        if (!stat.isFile() || stat.size > MAX_ARCHIVE_BYTES) {
            throw new Error('Download archive is not a regular file or exceeds 16 MB.');
        }
        text = await fs.readFile(location, 'utf8');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const seen = new Set();
    for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        if (!HASH.test(line)) throw new Error('Invalid download archive entry. Expected a SHA-256 fingerprint per line.');
        seen.add(line);
    }
    const inFlight = new Map();
    return Object.freeze({
        path: location,
        has: (key) => seen.has(key),
        /** Duplicate concurrent resources share an in-flight operation. Failed jobs are retriable. */
        async run(key, task) {
            if (!HASH.test(key)) throw new TypeError('Invalid download archive key.');
            if (seen.has(key)) return { skipped: true };
            if (inFlight.has(key)) {
                try { await inFlight.get(key); } catch { /* A failed earlier task is retriable. */ }
                if (seen.has(key)) return { skipped: true };
            }
            const pending = (async () => {
                const value = await task();
                await fs.mkdir(path.dirname(location), { recursive: true });
                await fs.appendFile(location, key + '\n', { mode: 0o600 });
                seen.add(key);
                return { skipped: false, value };
            })();
            inFlight.set(key, pending);
            try { return await pending; }
            finally { if (inFlight.get(key) === pending) inFlight.delete(key); }
        },
    });
}

module.exports = { archiveKey, openArchive };
