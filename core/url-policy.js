'use strict';

/** Host allowlists are per adapter. Validate every redirect, not only initial URLs. */
function createUrlPolicy(hosts) {
    if (!Array.isArray(hosts) || !hosts.length || hosts.some((host) =>
        typeof host !== 'string' || !/^[a-z0-9.-]+$/i.test(host) || host.includes('..'))) {
        throw new TypeError('Provide at least one exact hostname or domain suffix.');
    }
    const normalized = hosts.map((host) => host.toLowerCase());
    return (value) => {
        let url;
        try { url = new URL(value); } catch { throw new Error('Invalid provider media URL.'); }
        const hostname = url.hostname.toLowerCase();
        if (url.protocol !== 'https:' || url.username || url.password || url.port ||
            !normalized.some((domain) => hostname === domain || hostname.endsWith('.' + domain))) {
            throw new Error('Refusing URL outside the provider HTTPS CDN allowlist.');
        }
        return url.toString();
    };
}

module.exports = { createUrlPolicy };
