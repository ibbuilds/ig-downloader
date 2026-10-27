'use strict';

const { isIP } = require('node:net');

const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** This is a local CLI boundary, not a server-grade DNS-rebinding defense. */
function validatePublicUrl(value) {
    let url;
    try { url = new URL(value); } catch { throw new Error('Expected an HTTPS URL.'); }
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !host || host.startsWith('[') || isIP(host) || /(^|\.)(localhost|local|internal|invalid|test)$/.test(host) ||
        host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') ||
        !host.includes('.')) {
        throw new Error('Refusing a non-public HTTPS URL or embedded credentials.');
    }
    return url.toString();
}

/** Fetch a bounded response, manually vetting redirects and never forwarding a cookie cross-site. */
async function fetchPage(url, { fetchImpl = fetch, validateUrl = validatePublicUrl, cookie = '', authorization = '', accept = 'text/html', limit = MAX_PAGE_BYTES } = {}) {
    let current = validateUrl(url);
    const initialHost = new URL(current).hostname;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
        const headers = { accept, 'user-agent': 'sget/0.4 (local command-line resource extractor)' };
        if (new URL(current).hostname === initialHost) {
            if (cookie) headers.cookie = cookie;
            if (authorization) headers.authorization = authorization;
        }
        const response = await fetchImpl(current, { redirect: 'manual', headers, signal: AbortSignal.timeout(20000) });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location) throw new Error('Page redirected without Location.');
            current = validateUrl(new URL(location, current).toString());
            continue;
        }
        if (response.status === 429) throw new Error('Rate limited (429): stop requests and retry later.');
        if (response.status === 401 || response.status === 403) throw new Error(`Page is unavailable to this session (HTTP ${response.status}).`);
        if (response.status !== 200) throw new Error(`Page returned HTTP ${response.status}.`);
        const declared = Number(response.headers.get('content-length') || 0);
        if (declared > limit) throw new Error('Page metadata exceeds the size limit.');
        if (!response.body) throw new Error('Empty response body.');
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
            const part = Buffer.from(chunk);
            size += part.length;
            if (size > limit) throw new Error('Page metadata exceeds the size limit.');
            chunks.push(part);
        }
        return { text: Buffer.concat(chunks, size).toString('utf8'), url: current,
            contentType: (response.headers.get('content-type') || '').toLowerCase() };
    }
    throw new Error('Too many page redirects.');
}

module.exports = { validatePublicUrl, fetchPage, MAX_PAGE_BYTES };
