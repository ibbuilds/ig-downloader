#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { readCookie, getRawItemsFromResponse } = require('../lib/instagram.js');
const { resolveTarget, PROVIDERS } = require('../lib/providers.js');
const { downloadMedia, validateMediaUrl } = require('../lib/download.js');
const { MODES, selectMedia } = require('../shared/media.js');
const { version } = require('../package.json');

const COMMANDS = Object.freeze({ get: 'get', download: 'get', dl: 'get', urls: 'urls', url: 'urls', inspect: 'inspect', info: 'inspect', providers: 'providers', help: 'help' });
const MAX_TARGETS = 2000;
const HELP = `igd v${version} — fast Instagram media downloads (Node.js 20+)

Usage:
  igd <url-or-username> [options]                Download media
  igd get <url...> [options]                     Download multiple targets
  igd urls <url...> [options]                    Print direct media URLs
  igd inspect <url...> [options]                 Preview media and provenance
  igd get - [options]                           Read URLs/usernames from stdin
  igd get --input-file links.txt [options]      Read a batch file
  igd inspect --input-json response.json --json Process saved Instagram API JSON
  igd providers                                  List supported sites

Options:
  -m, --mode image|auto|video   Stories default to image; posts default to auto
  -o, --output <directory>      Download destination (default: current directory)
  -j, --concurrency <1..8>      Concurrent downloads (default: 4)
  -f, --input-file <file>      Read newline-separated targets; - for stdin
      --input-json <file>      Read a saved Instagram response, without API requests
      --cookie-file <file>     Netscape cookie export or Cookie header
      --url-only              Same as 'urls'
      --dry-run               Same as 'inspect'
      --json                  Machine-readable results
  -q, --quiet                 Hide successful download messages
  -h, --help                  Show help
  -v, --version               Show version

The old 'ig-downloader' command remains available. 'image' never falls back to MP4;
for video Stories an image is usually a poster, not the original photograph.
Downloads require legitimate access; IG_COOKIE or --cookie-file may supply your session.
`;

function parseArgs(argv) {
    const opts = { command: 'get', positional: [], concurrency: 4 };
    const valueFlags = {
        '--mode': 'mode', '-m': 'mode', '--output': 'output', '-o': 'output',
        '--cookie-file': 'cookieFile', '--input-json': 'inputJson',
        '--input-file': 'inputFile', '-f': 'inputFile',
        '--concurrency': 'concurrency', '-j': 'concurrency',
    };
    const toggles = {
        '--url-only': 'urlOnly', '--dry-run': 'dryRun', '--json': 'json',
        '--quiet': 'quiet', '-q': 'quiet', '--help': 'help', '-h': 'help',
        '--version': 'version', '-v': 'version',
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (i === 0 && Object.hasOwn(COMMANDS, arg)) {
            opts.command = COMMANDS[arg];
        } else if (arg === '--') {
            opts.positional.push(...argv.slice(i + 1));
            break;
        } else if (Object.hasOwn(toggles, arg)) {
            opts[toggles[arg]] = true;
        } else if (Object.hasOwn(valueFlags, arg)) {
            if (argv[i + 1] === undefined || (argv[i + 1].startsWith('-') && argv[i + 1] !== '-')) {
                throw new Error('Missing value for ' + arg);
            }
            opts[valueFlags[arg]] = argv[++i];
        } else if (arg.startsWith('-') && arg !== '-') {
            throw new Error('Unknown option: ' + arg);
        } else {
            opts.positional.push(arg);
        }
    }
    if (opts.mode && !Object.values(MODES).includes(opts.mode)) throw new Error('Mode must be image, auto or video.');
    if (!/^[1-8]$/.test(String(opts.concurrency))) throw new Error('Concurrency must be between 1 and 8.');
    opts.concurrency = Number(opts.concurrency);
    if (opts.inputJson && (opts.positional.length || opts.inputFile)) {
        throw new Error('--input-json cannot be combined with URLs or --input-file.');
    }
    if (opts.command === 'urls') opts.urlOnly = true;
    if (opts.command === 'inspect') opts.dryRun = true;
    if (opts.urlOnly && opts.dryRun) throw new Error('Choose either URLs or inspect, not both.');
    return opts;
}

async function loadTargets(args, stdin = process.stdin) {
    const targets = [];
    const readLines = (text) => {
        for (const line of text.split(/\r?\n/)) {
            const target = line.trim();
            if (target && !target.startsWith('#')) targets.push(target);
        }
    };
    let stdinContent;
    async function readSource(filename) {
        if (filename !== '-') return fs.readFile(filename, 'utf8');
        if (stdinContent !== undefined) return stdinContent;
        const chunks = [];
        for await (const chunk of stdin) chunks.push(chunk);
        stdinContent = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
        return stdinContent;
    }
    for (const target of args.positional) {
        if (target === '-') readLines(await readSource('-'));
        else targets.push(target);
    }
    if (args.inputFile) readLines(await readSource(args.inputFile));
    if (!targets.length) throw new Error('Missing URL. Run igd --help or pass - for stdin.');
    const unique = [...new Set(targets)];
    if (unique.length > MAX_TARGETS) throw new Error(`Maximum ${MAX_TARGETS} targets per batch.`);
    return unique;
}

async function loadOffline(jsonFile) {
    const data = JSON.parse(await fs.readFile(jsonFile, 'utf8'));
    const sourceType = data?.data?.xdt_api__v1__media__shortcode__web_info || data?.type === 'post' ? 'post' : 'story';
    const result = getRawItemsFromResponse(data, sourceType);
    if (!result?.items?.length) throw new Error('JSON has no recognizable Instagram media items.');
    return { ...result, sourceType };
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
                results[index] = { ok: false, error: error?.message || String(error) };
            }
        }
    }));
    return results;
}

function planMedia(items, mode) {
    let unavailable = 0;
    const available = [];
    for (const [index, item] of items.entries()) {
        const media = selectMedia(item, mode);
        if (!media) {
            unavailable++;
            continue;
        }
        validateMediaUrl(media.url);
        const info = {
            index,
            id: media.id,
            url: media.url,
            mediaType: media.isVideo ? 'video' : 'image',
            sourceKind: media.sourceKind,
            resolution: media.width && media.height ? `${media.width}x${media.height}` : null,
            format: media.format,
        };
        available.push({ media, info });
    }
    if (!available.length) throw new Error('No media with the requested format was available. Try --mode auto.');
    return { available, unavailable };
}

async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    if (args.help || args.command === 'help') {
        process.stdout.write(HELP);
        return 0;
    }
    if (args.version) {
        process.stdout.write(version + '\n');
        return 0;
    }
    if (args.command === 'providers') {
        const sites = Object.keys(PROVIDERS);
        process.stdout.write(args.json ? JSON.stringify({ supported: sites }) + '\n' : sites.join('\n') + '\n');
        return 0;
    }

    const rawTargets = args.inputJson ? [args.inputJson] : await loadTargets(args);
    const parsed = args.inputJson ? null : rawTargets.map((raw) => {
        try {
            return { ok: true, ...resolveTarget(raw) };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    });
    // Authentication is loaded once. A command-scoped session shares the home
    // page token and identical requests across concurrent Story targets.
    const cookie = args.inputJson ? '' : await readCookie(args);
    const sessions = new Map();
    const resolved = await mapLimit(rawTargets, Math.min(3, args.concurrency), async (raw, targetIndex) => {
        let result;
        let providerId = 'instagram';
        let target = null;
        if (args.inputJson) {
            result = await loadOffline(args.inputJson);
        } else {
            const source = parsed[targetIndex];
            if (!source.ok) throw new Error(source.error);
            providerId = source.provider.id;
            target = source.target;
            if (!sessions.has(providerId)) sessions.set(providerId, source.provider.createSession({ cookie }));
            result = await source.provider.resolve(target, { cookie, session: sessions.get(providerId) });
        }
        const mode = args.mode || (target?.type === 'post' || result.sourceType === 'post' ? MODES.AUTO : MODES.IMAGE);
        const { available, unavailable } = planMedia(result.items, mode);
        return { target: raw, provider: providerId, mode, username: result.username, unavailable, available, saved: [], errors: [] };
    });

    const successes = resolved.map((value, index) => value.ok ? { ...value.value, index } : null).filter(Boolean);
    const failures = resolved.map((value, index) => !value.ok ? { target: rawTargets[index], error: value.error } : null).filter(Boolean);
    if (!args.urlOnly && !args.dryRun) {
        // One global worker pool bounds total CDN transfers, even for large batches.
        const queue = successes.flatMap((entry) => entry.available.map((asset) => ({ entry, asset })));
        const downloaded = await mapLimit(queue, args.concurrency, async ({ entry, asset }) => {
            const outcome = await downloadMedia(asset.media, {
                username: entry.username, index: asset.info.index, output: args.output || '.',
            });
            return { ...asset.info, path: path.resolve(outcome.path), bytes: outcome.bytes, contentType: outcome.contentType };
        });
        downloaded.forEach((result, index) => {
            const { entry, asset } = queue[index];
            if (result.ok) entry.saved.push(result.value);
            else entry.errors.push({ index: asset.info.index, error: result.error });
        });
    }

    if (args.json) {
        const toReport = (entry) => {
            const report = {
                mode: entry.mode,
                username: entry.username,
                ...(args.dryRun || args.urlOnly
                    ? { unavailable: entry.unavailable, media: entry.available.map((asset) => asset.info) }
                    : { saved: entry.saved, unavailable: entry.unavailable, errors: entry.errors }),
            };
            return report;
        };
        const response = rawTargets.length === 1 && successes.length === 1 && !failures.length
            ? toReport(successes[0])
            : {
                version: 1,
                results: successes.map((entry) => ({ target: entry.target, provider: entry.provider, ...toReport(entry) })),
                errors: failures,
            };
        process.stdout.write(JSON.stringify(response, null, 2) + '\n');
    } else {
        for (const entry of successes) {
            if (args.urlOnly) {
                for (const asset of entry.available) process.stdout.write(asset.info.url + '\n');
            } else if (args.dryRun) {
                for (const asset of entry.available) {
                    const prefix = rawTargets.length > 1 ? `${entry.target} ` : '';
                    process.stdout.write(`${prefix}${asset.info.id} ${asset.info.sourceKind} ${asset.info.resolution || 'unknown'} ${asset.info.url}\n`);
                }
            } else if (!args.quiet) {
                for (const asset of entry.saved) {
                    process.stdout.write(`Saved ${asset.path} [${asset.sourceKind}, ${asset.bytes} bytes]\n`);
                }
            }
            for (const err of entry.errors) process.stderr.write(`Failed ${entry.target} item ${err.index + 1}: ${err.error}\n`);
            if (entry.unavailable) process.stderr.write(`Skipped ${entry.unavailable} item(s) for ${entry.target}: requested media unavailable.\n`);
        }
        for (const failure of failures) process.stderr.write(`Failed ${failure.target}: ${failure.error}\n`);
    }
    return failures.length || successes.some((entry) => entry.unavailable || entry.errors.length) ? 1 : 0;
}

if (require.main === module) {
    main().then((code) => { process.exitCode = code; }).catch((error) => {
        process.stderr.write(`Error: ${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = { parseArgs, loadTargets, planMedia, main, mapLimit };
