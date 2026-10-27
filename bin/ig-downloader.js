#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { readCookie, getRawItemsFromResponse } = require('../lib/instagram.js');
const { resolveTarget, PROVIDERS, loadPlugin } = require('../lib/providers.js');
const { normalizeResource } = require('../core/provider.js');
const { archiveKey, openArchive } = require('../core/archive.js');
const { crawlPublicSite } = require('../core/crawl.js');
const { downloadMedia } = require('../lib/download.js');
const { MODES } = require('../shared/media.js');
const { version } = require('../package.json');

const COMMANDS = Object.freeze({ get: 'get', download: 'get', dl: 'get', urls: 'urls', url: 'urls', inspect: 'inspect', info: 'inspect', providers: 'providers', help: 'help', crawl: 'crawl' });
const MAX_TARGETS = 2000;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const HELP = `sget / igd v${version} — modular media extraction (Node.js 20+)

Usage:
  sget URL [URL...]            Download available media from supported sites
  sget -u URL                 Show media URL(s)
  sget -n URL                 Inspect without downloading
  sget -a URL                 Preserve original Story media type
  sget -i URL                 Images only
  sget -V URL                 Prefer video
  sget -f links.txt           Batch file
  sget -A URL                  Also scan visible page media tags
  sget -r URL                  Crawl same-origin public HTML links
  sget crawl URL -d2 -L20      Crawl to depth 2, up to 20 pages
  sget providers               List installed adapters
  cat links.txt | sget        Pipe targets from stdin
  sget --plugin ./adapter.js URL  Explicitly load a trusted provider

Options:
  -u / -n / -a / -i / -V       URLs / inspect / auto / image / video
  -m i|a|v                   Media mode, full names accepted
  -o DIR                     Output directory
  -j 1..8                    Parallel downloads (default 4)
  -f FILE                    Newline-delimited targets (- for stdin)
  -s FILE                    Skip downloads already recorded in this archive
  -r, --crawl                Follow same-origin HTML links (depth 1)
  -d, --depth 0..2           Crawl link depth (default 1)
  -L, --max-pages 1..20     Crawl page cap (default 10)
  -J                         JSON output
  -q                         Quiet output
  -A, --all                  Include page image/video tags (up to 200)
      --plugin MODULE        Opt-in third-party provider (executes its code)
  -h / -v                    Help / version

Old 'igd' and 'ig-downloader' executable names and long options remain compatible.
Site support varies. Metadata may expose a preview, not the original file.
`;
const MODE_ALIASES = Object.freeze({ i: MODES.IMAGE, a: MODES.AUTO, v: MODES.VIDEO });

function parseArgs(argv) {
    const opts = { command: 'get', positional: [], concurrency: 4, plugins: [] };
    const valueFlags = {
        '--mode': 'mode', '-m': 'mode', '--output': 'output', '-o': 'output',
        '--cookie-file': 'cookieFile', '--input-json': 'inputJson',
        '--input-file': 'inputFile', '-f': 'inputFile',
        '--archive': 'archive', '-s': 'archive',
        '--depth': 'depth', '-d': 'depth', '--max-pages': 'maxPages', '-L': 'maxPages',
        '--concurrency': 'concurrency', '-j': 'concurrency', '--plugin': 'plugin',
    };
    const toggles = {
        '--url-only': 'urlOnly', '-u': 'urlOnly', '--dry-run': 'dryRun', '-n': 'dryRun',
        '--json': 'json', '-J': 'json', '--quiet': 'quiet', '-q': 'quiet',
        '--all': 'all', '-A': 'all', '--crawl': 'crawl', '-r': 'crawl',
        '--help': 'help', '-h': 'help', '--version': 'version', '-v': 'version',
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
        else if (name === 'plugin') opts.plugins.push(value);
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
            assignValue(arg.slice(0, 2), arg.slice(2));
        } else if (/^-[^-]{2,}$/.test(arg) && [...arg.slice(1)].every((letter) =>
            Object.hasOwn(toggles, '-' + letter) || Object.hasOwn(quickModes, '-' + letter))) {
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
    if (opts.command === 'crawl') opts.crawl = true;
    if (opts.command === 'inspect') opts.dryRun = true;
    if (opts.urlOnly && opts.dryRun) throw new Error('Choose either URLs or inspect, not both.');
    if (opts.archive && (opts.urlOnly || opts.dryRun)) throw new Error('--archive is only available when downloading.');
    if (opts.crawl && opts.inputJson) throw new Error('Crawling cannot be combined with --input-json.');
    if (!opts.crawl && (opts.depth !== undefined || opts.maxPages !== undefined)) throw new Error('Use -r/--crawl with --depth or --max-pages.');
    if (opts.crawl) {
        opts.depth = opts.depth === undefined ? 1 : Number(opts.depth);
        opts.maxPages = opts.maxPages === undefined ? 10 : Number(opts.maxPages);
        if (!Number.isInteger(opts.depth) || opts.depth < 0 || opts.depth > 2) throw new Error('Crawl depth must be 0..2.');
        if (!Number.isInteger(opts.maxPages) || opts.maxPages < 1 || opts.maxPages > 20) throw new Error('Crawl page limit must be 1..20.');
    }
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
        if (filename !== '-') {
            const stat = await fs.stat(filename);
            if (stat.size > MAX_INPUT_BYTES) throw new Error('Input list exceeds the 2 MB safety limit.');
            return fs.readFile(filename, 'utf8');
        }
        if (stdinContent !== undefined) return stdinContent;
        const chunks = [];
        let size = 0;
        for await (const chunk of stdin) {
            const buffer = Buffer.from(chunk);
            size += buffer.byteLength;
            if (size > MAX_INPUT_BYTES) throw new Error('Input list exceeds the 2 MB safety limit.');
            chunks.push(buffer);
        }
        stdinContent = Buffer.concat(chunks, size).toString('utf8');
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

function planMedia(items, mode, provider = PROVIDERS.instagram) {
    let unavailable = 0;
    const available = [];
    for (const [index, item] of items.entries()) {
        const media = normalizeResource(provider.select(item, mode));
        if (!media) {
            unavailable++;
            continue;
        }
        provider.validateUrl(media.url);
        const info = {
            index,
            id: media.id,
            url: media.url,
            mediaType: media.kind || (media.isVideo ? 'video' : 'image'),
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
    for (const specifier of args.plugins) loadPlugin(specifier);
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
    if (args.crawl && rawTargets.length > 10) throw new Error('Crawl mode is limited to 10 root URLs per invocation.');
    const parsed = args.inputJson ? null : rawTargets.map((raw) => {
        try {
            return { ok: true, ...resolveTarget(raw) };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    });
    // Secrets are user-local and per-provider. Never forward IG_COOKIE to an
    // unrelated provider or a third-party plugin through a mixed URL batch.
    const credentials = new Map();
    async function cookieFor(provider) {
        if (credentials.has(provider.id)) return credentials.get(provider.id);
        const pending = (async () => {
        let cookie = '';
        if (provider.id === 'instagram') cookie = await readCookie(args);
        else if (provider.id !== 'web') {
            const envKey = `SGET_COOKIE_${provider.id.toUpperCase().replace(/-/g, '_')}`;
            cookie = process.env[envKey] || '';
            if (args.cookieFile) {
                const active = new Set(parsed.filter((item) => item.ok).map((item) => item.provider.id));
                if (active.size !== 1) throw new Error('--cookie-file is ambiguous for mixed providers; use separate provider-specific environment variables.');
                cookie = (await fs.readFile(args.cookieFile, 'utf8')).trim().replace(/^Cookie:\s*/i, '');
                if (cookie.includes('\n') || cookie.includes('\r')) throw new Error('Non-Instagram cookies must be a single raw Cookie header.');
            }
        }
        return cookie;
        })().catch((error) => { credentials.delete(provider.id); throw error; });
        credentials.set(provider.id, pending);
        return pending;
    }
    const sessions = new Map();
    const throttledProviders = new Set();
    function guard(provider) {
        if (throttledProviders.has(provider.id)) {
            throw new Error(`${provider.name} requests paused after HTTP 429. Retry later.`);
        }
    }
    function noticeRateLimit(provider, error) {
        if (/429|rate.?limit/i.test(String(error?.message || ''))) throttledProviders.add(provider.id);
    }
    const scheduleDownload = createLimiter(args.concurrency);
    const archive = args.archive ? await openArchive(args.archive) : null;
    const resolved = await mapLimit(rawTargets, Math.min(3, args.concurrency), async (raw, targetIndex) => {
        let result;
        let provider = PROVIDERS.instagram;
        let target = null;
        if (args.crawl) {
            provider = PROVIDERS.web;
            guard(provider);
            try {
                result = await crawlPublicSite(raw, { depth: args.depth, maxPages: args.maxPages });
            } catch (error) {
                noticeRateLimit(provider, error);
                throw error;
            }
        } else if (args.inputJson) {
            result = await loadOffline(args.inputJson);
        } else {
            const source = parsed[targetIndex];
            if (!source.ok) throw new Error(source.error);
            provider = source.provider;
            target = source.target;
            const cookie = await cookieFor(provider);
            if (!sessions.has(provider.id)) sessions.set(provider.id, provider.createSession?.({ cookie }) || {});
            guard(provider);
            try {
                result = await provider.resolve(target, { cookie, session: sessions.get(provider.id), all: Boolean(args.all) });
            } catch (error) {
                noticeRateLimit(provider, error);
                throw error;
            }
        }
        const mode = args.mode || (provider.id !== 'instagram' || target?.type === 'post' || result.sourceType === 'post' ? MODES.AUTO : MODES.IMAGE);
        const { available, unavailable } = planMedia(result.items, mode, provider);
        const entry = { target: raw, provider: provider.id, validateUrl: provider.validateUrl, mode, username: result.username, unavailable, available, saved: [], skipped: [], errors: [] };
        if (!args.urlOnly && !args.dryRun) {
            // Start transferring as soon as this target resolves. Awaiting per target
            // provides backpressure instead of accumulating expiring CDN links.
            const downloaded = await Promise.all(available.map((asset) => {
                const transfer = () => scheduleDownload(async () => {
                    guard(provider);
                    try {
                        const outcome = await downloadMedia(asset.media, {
                            username: entry.username, index: asset.info.index, output: args.output || '.',
                            validateUrl: entry.validateUrl,
                        });
                        return { ...asset.info, path: path.resolve(outcome.path), bytes: outcome.bytes, contentType: outcome.contentType };
                    } catch (error) {
                        noticeRateLimit(provider, error);
                        throw error;
                    }
                });
                const task = archive
                    ? archive.run(archiveKey(provider.id, raw, asset.media, mode), transfer)
                    : transfer().then((value) => ({ skipped: false, value }));
                return task.then((value) => ({ ok: true, value }),
                    (error) => ({ ok: false, error: error?.message || String(error) }));
            }));
            downloaded.forEach((result, index) => {
                if (!result.ok) entry.errors.push({ index: available[index].info.index, error: result.error });
                else if (result.value.skipped) entry.skipped.push(available[index].info);
                else entry.saved.push(result.value.value);
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
                    : { saved: entry.saved, ...(archive ? { skipped: entry.skipped } : {}), unavailable: entry.unavailable, errors: entry.errors }),
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
                if (entry.skipped.length) process.stdout.write(`Skipped ${entry.skipped.length} previously downloaded resource(s).\n`);
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
