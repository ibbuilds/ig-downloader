#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { parseTarget } = require('../lib/targets.js');
const { readCookie, getInstagramItems, getRawItemsFromResponse } = require('../lib/instagram.js');
const { downloadMedia, validateMediaUrl } = require('../lib/download.js');
const { MODES, selectMedia } = require('../shared/media.js');
const { version } = require('../package.json');

const HELP = `ig-downloader v${version}
Cross-platform CLI for Instagram Stories, highlights, posts and Reels (Node.js 20+).

Usage:
  ig-downloader <instagram-url-or-username> [options]
  ig-downloader --input-json <file> [options]

Options:
  --mode image|auto|video   Stories default to image; posts default to auto
  --output <directory>      Download destination (default: current directory)
  --cookie-file <file>      Netscape cookie export or raw Cookie header
  --input-json <file>       Read Instagram API JSON instead of requesting the API
  --url-only                Print the exact selected CDN URL(s) without downloading
  --dry-run                 Show source kind and filename, without downloading
  --json                    Print structured results as JSON
  --concurrency <1..4>      Parallel downloads (default: 2)
  -h, --help                Show help
  -v, --version             Show version

Environment: IG_COOKIE provides an optional Cookie header (do not commit cookies).
A public Instagram URL may require authenticated access. No login bypass is attempted.
For video Stories, image mode saves Instagram's preview/poster (not necessarily the original uploaded photo).
`;

function parseArgs(argv) {
    const opts = { positional: [], concurrency: 2 };
    const valueFlags = {
        '--mode': 'mode',
        '--output': 'output',
        '--cookie-file': 'cookieFile',
        '--input-json': 'inputJson',
        '--concurrency': 'concurrency',
    };
    const toggles = { '--url-only': 'urlOnly', '--dry-run': 'dryRun', '--json': 'json', '--help': 'help', '-h': 'help', '--version': 'version', '-v': 'version' };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (Object.hasOwn(toggles, arg)) {
            opts[toggles[arg]] = true;
        } else if (Object.hasOwn(valueFlags, arg)) {
            if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Missing value for ' + arg);
            opts[valueFlags[arg]] = argv[++i];
        } else if (arg.startsWith('-')) {
            throw new Error('Unknown option: ' + arg);
        } else {
            opts.positional.push(arg);
        }
    }
    if (opts.positional.length > 1) throw new Error('Supply only one Instagram URL or username.');
    if (opts.mode && !Object.values(MODES).includes(opts.mode)) throw new Error('Mode must be image, auto or video.');
    if (!/^[1-4]$/.test(String(opts.concurrency))) throw new Error('Concurrency must be between 1 and 4.');
    opts.concurrency = Number(opts.concurrency);
    if (opts.inputJson && opts.positional.length) throw new Error('Do not combine --input-json with an Instagram URL.');
    return opts;
}

async function loadItems(args, target) {
    if (args.inputJson) {
        const data = JSON.parse(await fs.readFile(args.inputJson, 'utf8'));
        const result = getRawItemsFromResponse(data, data?.data?.xdt_api__v1__media__shortcode__web_info ? 'post' : 'story');
        if (!result?.items?.length) throw new Error('JSON has no recognizable Instagram media items.');
        return result;
    }
    const cookie = await readCookie(args);
    return getInstagramItems(target, { cookie });
}

async function mapLimit(items, limit, mapper) {
    const results = new Array(items.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(items.length, limit) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            try {
                results[index] = { ok: true, value: await mapper(items[index], index) };
            } catch (error) {
                results[index] = { ok: false, error: error.message };
            }
        }
    }));
    return results;
}

async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    if (args.help) {
        process.stdout.write(HELP);
        return 0;
    }
    if (args.version) {
        process.stdout.write(version + '\n');
        return 0;
    }
    if (!args.inputJson && !args.positional[0]) throw new Error('Missing URL. Run ig-downloader --help.');
    const target = args.inputJson ? null : parseTarget(args.positional[0]);
    const mode = args.mode || (target?.type === 'post' ? MODES.AUTO : MODES.IMAGE);
    const result = await loadItems(args, target);
    const planned = result.items.map((item, index) => ({ index, media: selectMedia(item, mode) }));
    const unavailable = planned.filter((entry) => !entry.media).length;
    const available = planned.filter((entry) => entry.media);
    if (!available.length) throw new Error('No media with the requested format was available. Try --mode auto.');
    const mediaInfo = available.map(({ index, media }) => {
        validateMediaUrl(media.url);
        return {
            index,
            id: media.id,
            url: media.url,
            mediaType: media.isVideo ? 'video' : 'image',
            sourceKind: media.sourceKind,
            resolution: media.width && media.height ? `${media.width}x${media.height}` : null,
            format: media.format,
        };
    });

    if (args.urlOnly) {
        for (const item of mediaInfo) process.stdout.write(item.url + '\n');
        if (unavailable) process.stderr.write(`Skipped ${unavailable} item(s) with no requested media type.\n`);
        return unavailable ? 1 : 0;
    }
    if (args.dryRun) {
        if (args.json) process.stdout.write(JSON.stringify({ mode, username: result.username, unavailable, media: mediaInfo }, null, 2) + '\n');
        else for (const item of mediaInfo) process.stdout.write(`${item.id} ${item.sourceKind} ${item.resolution || 'unknown'} ${item.url}\n`);
        return unavailable ? 1 : 0;
    }

    const downloaded = await mapLimit(available, args.concurrency, async ({ index, media }) => {
        const outcome = await downloadMedia(media, { username: result.username, index, output: args.output || '.' });
        return { ...mediaInfo.find((x) => x.index === index), path: path.resolve(outcome.path), bytes: outcome.bytes, contentType: outcome.contentType };
    });
    const success = downloaded.filter((entry) => entry.ok).map((entry) => entry.value);
    const errors = downloaded.map((entry, index) => !entry.ok ? { index: available[index].index, error: entry.error } : null).filter(Boolean);
    if (args.json) {
        process.stdout.write(JSON.stringify({ mode, username: result.username, saved: success, unavailable, errors }, null, 2) + '\n');
    } else {
        for (const item of success) process.stdout.write(`Saved ${item.path} [${item.sourceKind}, ${item.bytes} bytes]\n`);
        for (const item of errors) process.stderr.write(`Failed item ${item.index + 1}: ${item.error}\n`);
        if (unavailable) process.stderr.write(`Skipped ${unavailable} item(s) lacking a requested image/video resource.\n`);
    }
    return errors.length || unavailable ? 1 : 0;
}

if (require.main === module) {
    main().then((code) => { process.exitCode = code; }).catch((error) => {
        process.stderr.write(`Error: ${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = { parseArgs, main, mapLimit };
