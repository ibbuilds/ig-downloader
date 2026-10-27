'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { selectMedia, MODES } = require('../shared/media.js');
const { parseTarget } = require('../lib/targets.js');
const { parseCookies, getFbDtsg, getRawItemsFromResponse, getInstagramItems } = require('../lib/instagram.js');
const { validateMediaUrl, safeName, getResponseExtension } = require('../lib/download.js');

const IMG_SMALL = 'https://scontent.cdninstagram.com/path/a_320.jpg';
const IMG_LARGE = 'https://scontent.cdninstagram.com/path/a_1080.jpg';
const VIDEO = 'https://video-1.fna.fbcdn.net/path/b.mp4';

const storyVideo = {
    media_type: 2,
    pk: '1234567890',
    taken_at: 1760000000,
    image_versions2: {
        candidates: [
            { url: IMG_SMALL, width: 320, height: 600 },
            { url: IMG_LARGE, width: 1080, height: 1920 },
        ],
    },
    video_versions: [{ url: VIDEO, width: 720, height: 1280 }],
};

test('image-first saves the largest real image candidate, not a video frame', () => {
    const image = selectMedia(storyVideo, MODES.IMAGE);
    assert.equal(image.url, IMG_LARGE);
    assert.equal(image.sourceKind, 'video-poster');
    assert.equal(image.isVideo, false);
    assert.equal(image.originalIsVideo, true);
    assert.equal(image.width, 1080);
    assert.equal(image.videoUrl, VIDEO);
});

test('auto preserves video, image mode never silently falls back to video', () => {
    assert.equal(selectMedia(storyVideo, MODES.AUTO).url, VIDEO);
    assert.equal(selectMedia(storyVideo, MODES.VIDEO).sourceKind, 'video');
    const videoOnly = { media_type: 2, video_versions: [{ url: VIDEO }] };
    assert.equal(selectMedia(videoOnly, MODES.IMAGE), null);
    assert.equal(selectMedia(videoOnly, MODES.AUTO).isVideo, true);
});

test('photo-only and fallback selection keep provenance', () => {
    const photo = { media_type: 1, image_versions2: { candidates: [{ url: IMG_LARGE }] } };
    assert.equal(selectMedia(photo, MODES.AUTO).sourceKind, 'image');
    assert.equal(selectMedia(photo, MODES.VIDEO).isVideo, false);
    assert.equal(selectMedia({ ...storyVideo, video_versions: [] }, MODES.AUTO).sourceKind, 'video-poster');
    assert.throws(() => selectMedia(photo, 'jpg'), /Unknown media mode/);
});

test('parse only supported Instagram links and usernames', () => {
    assert.deepEqual(parseTarget('https://www.instagram.com/stories/example/1234567890/?x=1'), {
        type: 'story', username: 'example', id: '1234567890',
    });
    assert.deepEqual(parseTarget('https://instagram.com/stories/highlights/987654321/'), {
        type: 'highlight', id: '987654321',
    });
    assert.deepEqual(parseTarget('https://www.instagram.com/p/ABC_def-/'), {
        type: 'post', shortcode: 'ABC_def-',
    });
    assert.deepEqual(parseTarget('https://www.instagram.com/reel/Reel123/'), {
        type: 'post', shortcode: 'Reel123',
    });
    assert.deepEqual(parseTarget('@public.user'), { type: 'story', username: 'public.user', id: '' });
    assert.throws(() => parseTarget('https://instagram.com.evil.example/stories/test/123'), /Only HTTPS/);
    assert.throws(() => parseTarget('http://www.instagram.com/p/foo'), /Only HTTPS/);
    assert.throws(() => parseTarget('12345678'), /Expected an Instagram URL/);
    assert.throws(() => parseTarget('https://www.instagram.com/stories/a/not-an-id'), /Invalid Story media ID/);
});

test('cookie export parser ignores unrelated domains and comments', () => {
    const jar = [
        '# Netscape HTTP Cookie File',
        '#HttpOnly_.instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\tSESS',
        '.instagram.com\tTRUE\t/\tTRUE\t0\tcsrftoken\tCSRF',
        '.example.com\tTRUE\t/\tTRUE\t0\tsteal\tNO',
    ].join('\n');
    assert.match(parseCookies(jar), /sessionid=SESS/);
    assert.match(parseCookies(jar), /csrftoken=CSRF/);
    assert.doesNotMatch(parseCookies(jar), /steal=/);
    assert.equal(parseCookies('Cookie: sessionid=SESS; csrftoken=CSRF'), 'sessionid=SESS; csrftoken=CSRF');
    assert.equal(parseCookies(''), '');
});

test('Instagram HTML parser locates DTSG and GraphQL response parser retains items', () => {
    assert.equal(getFbDtsg('script:"DTSGInitialData",[],{"token":"abc123"}'), 'abc123');
    assert.equal(getFbDtsg('no-token'), '');
    const json = { data: { xdt_api__v1__feed__reels_media__connection: {
        edges: [{ node: { user: { username: 'example' }, items: [storyVideo] } }],
    } } };
    assert.equal(getRawItemsFromResponse(json, 'story').items[0].pk, '1234567890');
    assert.equal(getRawItemsFromResponse(json, 'story').username, 'example');
});

test('Instagram GraphQL requests preserve cookie and select exact Story ID', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        if (options.method !== 'POST') return new Response('"DTSGInitialData",[],{"token":"foo"}', { status: 200 });
        const body = new URLSearchParams(options.body);
        const name = body.get('fb_api_req_friendly_name');
        if (name === 'PolarisSearchBoxRefetchableQuery') {
            return Response.json({ data: { xdt_api__v1__fbsearch__topsearch_connection: {
                users: [{ user: { username: 'example', id: '42' } }],
            } } });
        }
        return Response.json({ data: { xdt_api__v1__feed__reels_media__connection: {
            edges: [{ node: { user: { username: 'example' }, items: [
                storyVideo,
                { ...storyVideo, pk: '9876543210' },
            ] } }],
        } } });
    };
    const { items } = await getInstagramItems({ type: 'story', username: 'example', id: '1234567890' }, {
        cookie: 'sessionid=SESS; csrftoken=CSRF', fetchImpl,
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].pk, '1234567890');
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => call.options.headers.cookie.includes('sessionid=SESS')));
    assert.equal(new URLSearchParams(calls[1].options.body).get('fb_dtsg'), 'foo');
});

test('CDN allowlist, filename sanitization and content MIME validation', () => {
    assert.equal(validateMediaUrl(IMG_LARGE), IMG_LARGE);
    assert.throws(() => validateMediaUrl('https://example.com/pic.jpg'), /Refusing/);
    assert.throws(() => validateMediaUrl('http://scontent.cdninstagram.com/img.jpg'), /Refusing/);
    assert.throws(() => validateMediaUrl('https://cdninstagram.com.evil.net/img.jpg'), /Refusing/);
    assert.doesNotMatch(safeName('../unsafe:<name>'), /[<>:\\/?*]/);
    const jpeg = new Response('abcd', { headers: { 'content-type': 'image/jpeg' } });
    assert.equal(getResponseExtension(jpeg, { isVideo: false }).extension, 'jpg');
    assert.throws(() => getResponseExtension(
        new Response('abcd', { headers: { 'content-type': 'video/mp4' } }),
        { isVideo: false },
    ), /Expected an image/);
});

test('largest candidate selection is stable, ignores unsafe URLs and does not mutate input', () => {
    const { largest } = require('../shared/media.js');
    const a = { url: 'https://scontent.cdninstagram.com/1.jpg', width: 300, height: 600 };
    const b = { url: 'https://scontent.cdninstagram.com/2.jpg', width: 600, height: 300 };
    const candidates = Object.freeze([{ url: 'http://example.com/unsafe', width: 5000, height: 5000 }, a, b]);
    assert.equal(largest(candidates), a);
    assert.deepEqual(candidates[1], a);
    assert.equal(largest([]), null);
    assert.equal(largest(null), null);
});

test('Instagram session caches concurrent Story queries but does not share account state globally', async () => {
    const { createInstagramSession } = require('../lib/instagram.js');
    const requests = [];
    const fetchImpl = async (url, options = {}) => {
        const name = new URLSearchParams(options.body || '').get('fb_api_req_friendly_name');
        requests.push({ url, name, cookie: options.headers.cookie });
        if (!options.method) return new Response('"DTSGInitialData",[],{"token":"dtsg"}');
        if (name === 'PolarisSearchBoxRefetchableQuery') {
            return Response.json({ data: { xdt_api__v1__fbsearch__topsearch_connection: {
                users: [{ user: { username: 'example', id: '42' } }],
            } } });
        }
        return Response.json({ data: { xdt_api__v1__feed__reels_media__connection: {
            edges: [{ node: { user: { username: 'example' }, items: [storyVideo, { ...storyVideo, pk: '456' }] } }],
        } } });
    };
    const session = createInstagramSession({ cookie: 'sessionid=A', fetchImpl });
    const results = await Promise.all(['1234567890', '456'].map((id) =>
        getInstagramItems({ type: 'story', username: 'example', id }, {
            cookie: 'sessionid=A', fetchImpl, session,
        }),
    ));
    assert.deepEqual(results.map((result) => result.items[0].pk), ['1234567890', '456']);
    assert.equal(requests.length, 3, 'both targets should share homepage + search + Story payload');
    assert.ok(requests.every((request) => request.cookie === 'sessionid=A'));
    await assert.rejects(getInstagramItems({ type: 'story', username: 'example' }, {
        cookie: 'sessionid=B', fetchImpl, session,
    }), /same cookie/);
});
