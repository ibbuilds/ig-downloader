'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeRef, pruneMergedBranches } = require('../scripts/prune-merged-branches.js');

const repository = 'ibbuilds/ig-downloader';
const head = (ref, sha, full_name = repository) => ({ ref, sha, repo: { full_name } });
const merged = (ref, sha, full_name) => ({ merged_at: '2026-10-27T10:00:00Z', head: head(ref, sha, full_name) });

function fixture({ deny = '' } = {}) {
    const refs = new Map([
        ['feat/finished', 'aaaa'],
        ['fix/reused', 'newer-than-merged'],
        ['feature/active', 'cccc'],
        ['main', 'mmmm'],
    ]);
    const deleted = [];
    const seen = [];
    const pulls = {
        closed: [
            merged('feat/finished', 'aaaa'),
            merged('fix/reused', 'bbbb'),
            merged('feature/active', 'cccc'),
            merged('main', 'mmmm'),
            merged('forked', 'dddd', 'someone/other-repo'),
            { merged_at: null, head: head('feat/not-merged', 'eeee') },
        ],
        open: [{ head: head('feature/active', 'cccc') }],
    };
    const fetchImpl = async (url, opts) => {
        const u = new URL(url);
        assert.equal(u.origin, 'https://api.github.com');
        assert.equal(opts.headers.authorization, 'Bearer TEST');
        const prefix = `/repos/${repository}`;
        assert.ok(u.pathname.startsWith(prefix));
        const suffix = u.pathname.slice(prefix.length);
        seen.push({ method: opts.method, path: suffix });
        if (suffix === '/pulls') return Response.json(pulls[u.searchParams.get('state')] || []);
        if (suffix.startsWith('/git/ref/heads/')) {
            const ref = decodeURIComponent(suffix.slice('/git/ref/heads/'.length));
            if (!refs.has(ref)) return new Response(null, { status: 404 });
            return Response.json({ ref: `refs/heads/${ref}`, object: { type: 'commit', sha: refs.get(ref) } });
        }
        if (suffix.startsWith('/git/refs/heads/') && opts.method === 'DELETE') {
            const ref = decodeURIComponent(suffix.slice('/git/refs/heads/'.length));
            if (ref === deny) return new Response(null, { status: 403 });
            assert.equal(ref, 'feat/finished');
            assert.ok(refs.delete(ref));
            deleted.push(ref);
            return new Response(null, { status: 204 });
        }
        throw new Error('Unexpected fake API request: ' + opts.method + ' ' + suffix);
    };
    return { fetchImpl, refs, deleted, seen };
}

test('branch names are encoded safely and malformed refs are rejected', () => {
    assert.equal(encodeRef('feat/one two'), 'feat/one%20two');
    assert.equal(encodeRef('fix/slug'), 'fix/slug');
    assert.throws(() => encodeRef('../danger'), /Invalid branch/);
    assert.throws(() => encodeRef(''), /Invalid branch/);
});

test('only exact-head merged branches are removed; stale, open, unmerged and foreign refs survive', async () => {
    const fx = fixture();
    const result = await pruneMergedBranches({ repository, token: 'TEST', fetchImpl: fx.fetchImpl });
    assert.deepEqual(result.deleted, ['feat/finished']);
    assert.deepEqual(fx.deleted, ['feat/finished']);
    assert.equal(fx.refs.has('feat/finished'), false);
    assert.equal(fx.refs.has('fix/reused'), true);
    assert.equal(fx.refs.has('feature/active'), true);
    assert.equal(fx.refs.has('main'), true);
    assert.equal(fx.seen.filter((x) => x.method === 'DELETE').length, 1);
});

test('dry-run never deletes any refs', async () => {
    const fx = fixture();
    const result = await pruneMergedBranches({ repository, token: 'TEST', fetchImpl: fx.fetchImpl, dryRun: true });
    assert.equal(result.dryRun, true);
    assert.deepEqual(result.deleted, ['feat/finished']);
    assert.equal(fx.refs.has('feat/finished'), true);
    assert.equal(fx.seen.some((x) => x.method === 'DELETE'), false);
});

test('permission failures surface as errors rather than claiming branch cleanup succeeded', async () => {
    const fx = fixture({ deny: 'feat/finished' });
    await assert.rejects(pruneMergedBranches({ repository, token: 'TEST', fetchImpl: fx.fetchImpl }), /HTTP 403/);
    assert.equal(fx.refs.has('feat/finished'), true);
});

test('invalid repository or missing token cannot invoke GitHub deletion', async () => {
    await assert.rejects(pruneMergedBranches({ repository: 'invalid', token: 'TEST' }), /owner\/name/);
    await assert.rejects(pruneMergedBranches({ repository, token: '' }), /GITHUB_TOKEN/);
});
