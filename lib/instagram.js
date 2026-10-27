'use strict';

const fs = require('node:fs/promises');
const { matchStoryId } = require('./targets.js');

const GRAPHQL = 'https://www.instagram.com/graphql/query';
const HOME = 'https://www.instagram.com/';
const APP_ID = '936619743392459';
const DOC = Object.freeze({
    userSearch: '27706427925724183',
    story: '28262315486766731',
    highlight: '28325328583775973',
    post: '27852811784380813',
});

function parseCookies(content) {
    const text = String(content || '').trim().replace(/^Cookie:\s*/i, '');
    if (!text) return '';
    const cookies = new Map();
    if (!text.includes('\n') && /(?:^|;)\s*[A-Za-z_][\w-]*=/.test(text)) {
        for (const chunk of text.replace(/^Cookie:\s*/i, '').split(';')) {
            const index = chunk.indexOf('=');
            if (index > 0) cookies.set(chunk.slice(0, index).trim(), chunk.slice(index + 1).trim());
        }
    } else {
        for (const line of text.split(/\r?\n/)) {
            const normalized = line.replace(/^#HttpOnly_/, '');
            if (!normalized || (normalized.startsWith('#') && !line.startsWith('#HttpOnly_'))) continue;
            const parts = normalized.split('\t');
            if (parts.length < 7) continue;
            const domain = parts[0].replace(/^\./, '').toLowerCase();
            if (domain !== 'instagram.com' && !domain.endsWith('.instagram.com')) continue;
            const name = parts[5];
            if (/^[\w-]+$/.test(name)) cookies.set(name, parts.slice(6).join('\t'));
        }
    }
    return [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
}

function getFbDtsg(html) {
    return String(html).match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1] ||
        String(html).match(/"dtsg":\s*\{\s*"token":"([^"]+)"/)?.[1] || '';
}

async function readCookie(options) {
    if (options.cookieFile) return parseCookies(await fs.readFile(options.cookieFile, 'utf8'));
    return parseCookies(process.env.IG_COOKIE || '');
}

function ensureResponse(response, label) {
    if (response.status === 429) throw new Error(`${label}: Instagram rate-limited the request (429). Stop and retry later.`);
    if (response.status === 401 || response.status === 403) {
        throw new Error(`${label}: authentication/access denied (${response.status}). Export cookies for an account authorized to view the media.`);
    }
    if (!response.ok) throw new Error(`${label}: Instagram returned HTTP ${response.status}.`);
}

async function fetchDocument(cookie, fetchImpl = fetch) {
    const response = await fetchImpl(HOME, {
        headers: {
            accept: 'text/html',
            ...(cookie ? { cookie } : {}),
            'user-agent': 'Mozilla/5.0 (compatible; ig-downloader/1.0)',
        },
        signal: AbortSignal.timeout(20000),
    });
    ensureResponse(response, 'Session');
    return getFbDtsg(await response.text());
}

async function queryInstagram(query, variables, { cookie, dtsg = '', fetchImpl = fetch }) {
    const csrf = cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] || '';
    const body = new URLSearchParams({
        fb_dtsg: dtsg,
        fb_api_caller_class: 'RelayModern',
        fb_api_req_friendly_name: query.name,
        doc_id: query.doc,
        variables: JSON.stringify(variables),
        server_timestamps: 'true',
    });
    const response = await fetchImpl(GRAPHQL, {
        method: 'POST',
        body,
        headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
            'x-ig-app-id': APP_ID,
            'x-csrftoken': csrf,
            'x-fb-friendly-name': query.name,
            'x-requested-with': 'XMLHttpRequest',
            origin: HOME.slice(0, -1),
            referer: HOME,
            ...(cookie ? { cookie } : {}),
        },
        signal: AbortSignal.timeout(20000),
    });
    ensureResponse(response, query.name);
    let json;
    try {
        json = await response.json();
    } catch {
        throw new Error('Instagram returned a non-JSON response. The upstream GraphQL query may have changed.');
    }
    if (json.errors?.length || json.status === 'fail') {
        throw new Error('Instagram rejected its GraphQL query. The query document ID may need updating.');
    }
    return json;
}

/** Cache session metadata and identical GraphQL results only for the lifetime of a CLI command. */
function createInstagramSession({ cookie = '', fetchImpl = fetch } = {}) {
    let tokenPromise;
    const responses = new Map();
    return {
        cookie,
        fetchImpl,
        getDtsg() {
            if (!tokenPromise) {
                tokenPromise = fetchDocument(cookie, fetchImpl).catch((error) => {
                    tokenPromise = null;
                    throw error;
                });
            }
            return tokenPromise;
        },
        cached(key, loader) {
            if (responses.has(key)) return responses.get(key);
            const pending = Promise.resolve().then(loader).catch((error) => {
                responses.delete(key);
                throw error;
            });
            responses.set(key, pending);
            return pending;
        },
    };
}

function buildReelVariables(reelId) {
    return {
        initial_reel_id: reelId,
        reel_ids: [reelId],
        first: 3,
        last: 2,
        __relay_internal__pv__PolarisCommunityNoteStoriesLabelEnabledrelayprovider: true,
    };
}

function getRawItemsFromResponse(json, type) {
    if (type === 'post') {
        const post = json?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0] || json?.items?.[0] || null;
        if (!post) return null;
        return { items: post.carousel_media?.length ? post.carousel_media : [post], username: post.user?.username || 'unknown' };
    }
    const reel = json?.data?.xdt_api__v1__feed__reels_media__connection?.edges?.[0]?.node ||
        json?.data?.xdt_api__v1__feed__reels_media?.reels_media?.[0] || json?.node || json;
    if (!Array.isArray(reel?.items)) return null;
    return { items: reel.items, username: reel.user?.username || 'unknown' };
}

async function getInstagramItems(target, { cookie = '', fetchImpl = fetch, session } = {}) {
    if (session && (session.cookie !== cookie || session.fetchImpl !== fetchImpl)) {
        throw new Error('Instagram session must use the same cookie and fetch implementation.');
    }
    const dtsg = session ? await session.getDtsg() : await fetchDocument(cookie, fetchImpl);
    const query = (name, doc, vars) => queryInstagram({ name, doc }, vars, { cookie, dtsg, fetchImpl });
    const cached = (key, loader) => session ? session.cached(key, loader) : loader();
    let json;
    if (target.type === 'post') {
        json = await cached(`post:${target.shortcode}`, () => query('PolarisPostRootQuery', DOC.post, {
            shortcode: target.shortcode,
            __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false,
            __relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider: false,
        }));
    } else if (target.type === 'highlight') {
        json = await cached(`highlight:${target.id}`, () => query('PolarisStoriesV3HighlightsPageQuery', DOC.highlight, buildReelVariables(`highlight:${target.id}`)));
    } else {
        const search = await cached(`user:${target.username.toLowerCase()}`, () => query('PolarisSearchBoxRefetchableQuery', DOC.userSearch, {
            data: {
                context: 'blended',
                include_reel: 'true',
                query: target.username,
                rank_token: '',
                search_surface: 'web_top_search',
            },
            hasQuery: true,
        }));
        const users = search?.data?.xdt_api__v1__fbsearch__topsearch_connection?.users || [];
        const user = users.find((u) => u.user?.username?.toLowerCase() === target.username.toLowerCase());
        if (!user?.user?.id) throw new Error('Could not resolve the specified Instagram username.');
        json = await cached(`story:${user.user.id}`, () => query('PolarisStoriesV3ReelPageGalleryQuery', DOC.story, buildReelVariables(user.user.id)));
    }

    const result = getRawItemsFromResponse(json, target.type);
    if (!result || !result.items.length) {
        throw new Error('No media returned. It may have expired, be private, or Instagram may have changed its API.');
    }
    if (target.type === 'story' && target.id) {
        result.items = result.items.filter((item) => matchStoryId(item, target.id));
        if (!result.items.length) throw new Error('Requested Story ID was not present in the accessible Story data.');
    }
    return result;
}

module.exports = { parseCookies, readCookie, getFbDtsg, getRawItemsFromResponse, getInstagramItems, buildReelVariables, createInstagramSession };
