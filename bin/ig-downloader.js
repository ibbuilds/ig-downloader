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
const HELP = `igd v${version} — Instagram downloads, one command (Node.js 20+)

Usage:
  igd URL [URL...]             Download images/videos
  igd @username               Download accessible Stories
  igd -u URL                  Print direct media URLs
  igd -n URL                  Inspect without downloading
  igd -a URL                  Keep original Story media type
  igd -i URL                  Images only (posters on video Stories)
  igd -V URL                  Prefer video
  igd -f links.txt            Batch from a file
  cat links.txt | igd         Batch from stdin

Options:
  -u, --url-only              URL(s), no download
  -n, --dry-run               Inspect media without saving
  -a / -i / -V                Auto / image / prefer video
  -m, --mode i|a|v            Image / auto / video (full names accepted)
  -o, --output DIR            Destination directory
  -j, --concurrency 1..8      Parallel transfers (default 4)
  -f, --input-file FILE       Targets, one per line (- for stdin)
  -J, --json                  JSON output
  -q, --quiet                 Suppress successful download messages
  -h, --help                  Show help
  -v, --version               Show version

Also supported: get, urls, inspect, providers, --cookie-file, --input-json,
             ig-downloader (legacy executable). Inline flags such as -j8 work.
Downloads require legitimate access. Image mode never falls back to MP4;
for video Stories, the image may be a poster, not the original photograph.
`;
const MODE_ALIASES = Object.freeze({ i: MODES.IMAGE, a: MODES.AUTO, v: MODES.VIDEO });

function parseArgs(argv) {
    const opts = { command: 'get', positional: [], concurrency: 4 };
    const valueFlags = {
        '--mode': 'mode', '-m': 'mode', '--output': 'output', '-o': 'output',
        '--cookie-file': 'cookieFile', '--input-json': 'inputJson',
        '--input-file': 'inputFile', '-f': 'inputFile',
        '--concurrency': 'concurrency', '-j': 'concurrency',
    };
    const toggles = {
        '--url-only': 'urlOnly', '-u': 'urlOnly',
        '--dry-run': 'dryRun', '-n': 'dryRun',
        '--json': 'json', '-J': 'json',
        '--quiet': 'quiet', '-q': 'quiet', '--help': 'help', '-h': 'help',
        '--version': 'version', '-v': 'version',
    };
    const quickModes = { '-a': MODES.AUTO, '-i': MODES.IMAGE, '-V': MODES.VIDEO };
    function setMode(raw) {
        const mode = MODE_ALIASES[raw] || raw;
        if (!Object.values(MODES).includes(mode)) throw new Error('Mode must be image, auto or video (i, a, v).');
        if (opts.mode && opts.mode !== mode) throw new Error('Conflicting media modes. Choose one of image, auto or video.');
        opts.mode = mode;
    }
    function assignValue(flag, value) {
        if (value === '' || value === undefined || (value.startsWith('-') && value !== '-')) {
            throw new Error('Missing value for ' + flag);
        }
        const name = valueFlags[flag];
        if (name === 'mode') setMode(value);
        else opts[name] = value;
    }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (i === 0 && Object.hasOwn(COMMANDS, arg)) {
            opts.command = COMMANDS[arg];
        } else if (arg === '--') {
            opts.positional.push(...argv.slice(i + 1));
            break;
        } else if (Object.hasOwn(toggles, arg)) {
            opts[toggles[arg]] = true;
        } else if (Object.hasOwn(quickModes, arg)) {
            setMode(quickModes[arg]);
        } else if (Object.hasOwn(valueFlags, arg)) {
            assignValue(arg, argv[++i]);
        } else if (/^-[^-].+$/.test(arg) && Object.hasOwn(valueFlags, arg.slice(0, 2))) {
            // Common POSIX-style compact values: -j8, -o./media, -mi.
            assignValue(arg.slice(0, 2), arg.slice(2));
        } else if (/^-[^-]{2,}$/.test(arg) && [...arg.slice(1)].every((letter) =>
            Object.hasOwn(toggles, '-' + letter) || Object.hasOwn(quickModes, '-' + letter))) {
            // Combine switch-only flags, e.g. -uq, -nJ or -aq.
            for (const letter of arg.slice(1)) {
                const flag = '-' + letter;
                if (Object.hasOwn(toggles, flag)) opts[toggles[flag]] = true;
                else setMode(quickModes[flag]);
            }
        } else if (arg.startsWith('-') && arg !== '-') {
            throw new Error('Unknown option: ' + arg);
        } else {
            opts.positional.push(arg);
        }
    }
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
    if (!args.positional.length && !args.inputFile && !stdin.isTTY) readLines(await readSource('-'));
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

/** FIFO semaphore: bound CDN traffic across target workers, without waiting for all target lookups. */
function createLimiter(limit) {
    let running = 0;
    const pending = [];
    return (task) => new Promise((resolve, reject) => {
        const start = () => {
            running++;
            Promise.resolve().then(task).then(resolve, reject).finally(() => {
                running--;
                if (pending.length) pending.shift()();
            });
        };
        if (running < limit) start();
        else pending.push(start);
    });
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

    if (!args.inputJson && !args.positional.length && !args.inputFile && process.stdin.isTTY) {
        process.stdout.write(HELP);
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
    const scheduleDownload = createLimiter(args.concurrency);
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
        const entry = { target: raw, provider: providerId, mode, username: result.username, unavailable, available, saved: [], errors: [] };
        if (!args.urlOnly && !args.dryRun) {
            // Start transferring as soon as this target resolves. Awaiting per target
            // provides backpressure instead of accumulating expiring CDN links.
            const downloaded = await Promise.all(available.map((asset) => scheduleDownload(async () => {
                const outcome = await downloadMedia(asset.media, {
                    username: entry.username, index: asset.info.index, output: args.output || '.',
                });
                return { ...asset.info, path: path.resolve(outcome.path), bytes: outcome.bytes, contentType: outcome.contentType };
            }).then((value) => ({ ok: true, value }), (error) => ({ ok: false, error: error?.message || String(error) }))));
            downloaded.forEach((result, index) => {
                if (result.ok) entry.saved.push(result.value);
                else entry.errors.push({ index: available[index].info.index, error: result.error });
            });
        }
        return entry;
    });

    const successes = resolved.map((value, index) => value.ok ? { ...value.value, index } : null).filter(Boolean);
    const failures = resolved.map((value, index) => !value.ok ? { target: rawTargets[index], error: value.error } : null).filter(Boolean);

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

module.exports = { parseArgs, loadTargets, planMedia, main, mapLimit, createLimiter };
