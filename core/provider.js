'use strict';

/** A small, dependency-free provider contract, shared by the CLI and extensions. */
const PROVIDER_ID = /^[a-z][a-z0-9-]{1,39}$/;
const MODES = new Set(['auto', 'image', 'video']);

function assertProvider(provider) {
    if (!provider || typeof provider !== 'object' || !PROVIDER_ID.test(provider.id || '')) {
        throw new TypeError('Provider must have a lowercase, hyphenated id (2–40 characters).');
    }
    if (typeof provider.name !== 'string' || !provider.name.trim()) {
        throw new TypeError(`Provider ${provider.id} must have a display name.`);
    }
    for (const method of ['match', 'parse', 'resolve', 'select', 'validateUrl']) {
        if (typeof provider[method] !== 'function') {
            throw new TypeError(`Provider ${provider.id} requires ${method}().`);
        }
    }
    if (provider.fallback !== undefined && typeof provider.fallback !== 'boolean') {
        throw new TypeError(`Provider ${provider.id} fallback must be boolean.`);
    }
    if (provider.createSession !== undefined && typeof provider.createSession !== 'function') {
        throw new TypeError(`Provider ${provider.id} createSession must be a function.`);
    }
    return provider;
}

function createRegistry(initialProviders = []) {
    const providers = new Map();
    function register(provider) {
        assertProvider(provider);
        if (providers.has(provider.id)) throw new Error(`Duplicate provider: ${provider.id}`);
        providers.set(provider.id, Object.freeze({ ...provider }));
        return providers.get(provider.id);
    }
    function resolveTarget(raw) {
        const matches = [...providers.values()].filter((provider) => provider.match(raw));
        const specialized = matches.filter((provider) => !provider.fallback);
        const chosen = specialized.length ? specialized : matches;
        if (chosen.length > 1) throw new Error('Ambiguous URL: multiple providers matched this target.');
        if (!matches.length) {
            let detail = '';
            try { detail = new URL(raw).hostname; } catch { /* bare usernames are provider-specific */ }
            throw new Error(`Unsupported provider or target${detail ? ` (${detail})` : ''}. Install an adapter to support it.`);
        }
        return { provider: chosen[0], target: chosen[0].parse(raw) };
    }
    for (const provider of initialProviders) register(provider);
    return Object.freeze({ register, resolveTarget, get: (id) => providers.get(id), list: () => [...providers.values()] });
}

/** Validate provider output before it can reach the downloader or CLI JSON. */
function normalizeResource(media) {
    if (media == null) return null;
    if (!media || typeof media !== 'object') throw new TypeError('Provider returned a non-object resource.');
    let url;
    try { url = new URL(media.url); } catch { throw new TypeError('Provider resource has an invalid URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) {
        throw new TypeError('Provider resource requires HTTPS without embedded credentials.');
    }
    if (media.kind !== undefined && !['image', 'video', 'audio'].includes(media.kind)) {
        throw new TypeError('Provider resource has unsupported kind.');
    }
    if (typeof media.isVideo !== 'boolean') throw new TypeError('Provider resource requires isVideo boolean.');
    if (media.kind && (media.kind === 'video') !== media.isVideo) {
        throw new TypeError('Provider resource kind must agree with isVideo.');
    }
    if (typeof media.sourceKind !== 'string' || !media.sourceKind) {
        throw new TypeError('Provider resource requires sourceKind provenance.');
    }
    if (typeof media.format !== 'string' || !/^[a-z0-9]{2,8}$/.test(media.format)) {
        throw new TypeError('Provider resource requires a safe extension format.');
    }
    for (const key of ['width', 'height']) {
        if (media[key] != null && (!Number.isFinite(media[key]) || media[key] < 0)) {
            throw new TypeError(`Provider resource has invalid ${key}.`);
        }
    }
    return media;
}

function assertMode(mode) {
    if (!MODES.has(mode)) throw new TypeError('Unknown media mode: ' + mode);
}

module.exports = { assertProvider, createRegistry, normalizeResource, assertMode };
