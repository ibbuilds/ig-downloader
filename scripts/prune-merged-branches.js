#!/usr/bin/env node
'use strict';

// Runs only on trusted pushes to the default branch; no PR code or third-party
// action receives the write-scoped GitHub token. Never removes an unmerged branch.
const MAX_PAGES = 20;
const PAGE_SIZE = 100;
const MAX_DELETIONS = 100;

function encodeRef(ref) {
    if (typeof ref !== 'string' || !ref || ref.startsWith('/') || ref.endsWith('/') || ref.includes('..')) {
        throw new Error('Invalid branch reference.');
    }
    return ref.split('/').map(encodeURIComponent).join('/');
}

async function pruneMergedBranches({ repository, token, defaultBranch = 'main', fetchImpl = fetch, dryRun = false }) {
    if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
        throw new Error('GITHUB_REPOSITORY must be a repository owner/name.');
    }
    if (!token) throw new Error('GITHUB_TOKEN is required.');
    const base = `https://api.github.com/repos/${repository}`;
    async function request(path, method = 'GET', optional = false) {
        const response = await fetchImpl(base + path, {
            method,
            redirect: 'error',
            headers: {
                accept: 'application/vnd.github+json',
                authorization: `Bearer ${token}`,
                'x-github-api-version': '2022-11-28',
            },
        });
        if (response.status === 404 && optional) return null;
        if (!response.ok) throw new Error(`GitHub ${method} ${path} failed: HTTP ${response.status}.`);
        if (method === 'DELETE') return null;
        return response.json();
    }
    async function listPulls(state) {
        const pulls = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
            const batch = await request(`/pulls?state=${state}&per_page=${PAGE_SIZE}&page=${page}`);
            if (!Array.isArray(batch)) throw new Error('GitHub PR listing did not return an array.');
            pulls.push(...batch);
            if (batch.length < PAGE_SIZE) return pulls;
        }
        throw new Error('PR pagination limit reached; refusing partial branch cleanup.');
    }
    const [closed, open] = await Promise.all([listPulls('closed'), listPulls('open')]);
    const openRefs = new Set(open.filter((pr) => pr.head?.repo?.full_name === repository).map((pr) => pr.head.ref));
    const deleted = [];
    const failures = [];
    const processed = new Set();
    for (const pr of closed) {
        if (!pr.merged_at || pr.head?.repo?.full_name !== repository || !pr.head?.sha || !pr.head?.ref) continue;
        const name = pr.head.ref;
        if (name === defaultBranch || openRefs.has(name) || processed.has(name)) continue;
        const url = `/git/ref/heads/${encodeRef(name)}`;
        const current = await request(url, 'GET', true);
        if (!current || current.object?.type !== 'commit' || current.object.sha !== pr.head.sha) continue;
        // HEAD must match the exact commit that was reviewed and merged. Skip
        // reused or modified branches rather than deleting unrelated work.
        if (deleted.length >= MAX_DELETIONS) throw new Error('Branch cleanup safety limit reached.');
        processed.add(name);
        if (dryRun) {
            deleted.push(name);
            continue;
        }
        try {
            await request(`/git/refs/heads/${encodeRef(name)}`, 'DELETE', true);
            deleted.push(name);
        } catch (error) {
            failures.push(`${name}: ${error.message}`);
        }
    }
    if (failures.length) throw new Error('Unable to clean merged branches: ' + failures.join('; '));
    return { dryRun, deleted, skippedOpen: [...openRefs].length };
}

if (require.main === module) {
    pruneMergedBranches({
        repository: process.env.GITHUB_REPOSITORY,
        token: process.env.GITHUB_TOKEN,
        defaultBranch: process.env.GITHUB_DEFAULT_BRANCH || 'main',
        dryRun: process.argv.includes('--dry-run'),
    }).then((result) => {
        console.log(`${result.dryRun ? 'Would remove' : 'Removed'} ${result.deleted.length} merged branches.`);
        for (const name of result.deleted) console.log(`  ${name}`);
    }).catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { encodeRef, pruneMergedBranches };
