'use strict';

const path = require('node:path');
const { createRegistry } = require('../core/provider.js');
const builtinIds = require('../providers/registry.json');

// Built-ins are explicitly listed and reviewed. Third-party modules never load automatically.
const builtin = builtinIds.map((id) => {
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(id)) throw new Error('Invalid built-in provider id.');
    return require('../providers/' + id);
});
const registry = createRegistry(builtin);
const PROVIDERS = Object.fromEntries(registry.list().map((provider) => [provider.id, provider]));

function registerProvider(provider) {
    const registered = registry.register(provider);
    PROVIDERS[registered.id] = registered;
    return registered;
}

/** Explicit --plugin only: installing/loading an extension executes its JavaScript. */
function loadPlugin(specifier) {
    if (typeof specifier !== 'string' || !specifier.trim() || /^https?:\/\//i.test(specifier)) {
        throw new Error('Plugin must be an installed package name or local file path, not a URL.');
    }
    const file = require.resolve(specifier, { paths: [process.cwd(), path.resolve(__dirname, '..')] });
    const loaded = require(file);
    return registerProvider(loaded.provider || loaded.default || loaded);
}

module.exports = {
    PROVIDERS,
    resolveTarget: registry.resolveTarget,
    registerProvider,
    loadPlugin,
    listProviders: registry.list,
    createRegistry,
};
