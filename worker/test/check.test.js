import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { verifyTurnstile } from '../src/limits.js';

const ORIGIN = 'https://marveloweb.com';
const HTML = '<html><head><title>Rivera Plumbing</title></head><body><h1>Hi</h1></body></html>';
const PSI = { lighthouseResult: { categories: { performance: { score: 0.9 }, seo: { score: 0.9 }, accessibility: { score: 0.9 }, 'best-practices': { score: 0.9 } }, audits: {} } };
const DFS = 'https://api.dataforseo.com/';
let calls;
let inits;
let turnstileOk;
let siteDown;
let dfs;

function mockNetwork() {
  calls = [];
  inits = [];
  turnstileOk = true;
  siteDown = false;
  dfs = (task) => Response.json({ tasks: [{ status_code: 20000, result: [{ items: [
    { type: 'organic', rank_group: task.keyword === 'plumber near me' ? 4 : 30, domain: 'rivera-plumbing.com' },
  ] }] }] });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push(url);
    inits.push(init);
    if (url.startsWith('https://challenges.cloudflare.com/')) return Response.json({ success: turnstileOk });
    if (url.startsWith('https://cloudflare-dns.com/')) {
      const type = new URL(url).searchParams.get('type');
      return Response.json({ Answer: type === 'A' ? [{ type: 1, data: '93.184.215.14' }] : [] });
    }
    if (url.startsWith('https://www.googleapis.com/')) return siteDown ? new Response('no', { status: 500 }) : Response.json(PSI);
    if (url.startsWith(DFS)) return dfs(JSON.parse(init.body)[0]);
    if (siteDown) return new Response('down', { status: 503 });
    return new Response(HTML, { headers: { 'content-type': 'text/html' } });
  });
}
const count = (prefix) => calls.filter((u) => u.startsWith(prefix)).length;
const today = () => new Date().toISOString().slice(0, 10);

function post(body, { origin = ORIGIN, ip = '1.1.1.1', raw } = {}) {
  const full = body && !('city' in body) ? { city: 'Columbus, OH', ...body } : body;
  return SELF.fetch('https://api.test/check', {
    method: 'POST',
    headers: { origin, 'cf-connecting-ip': ip, 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(full),
  });
}

beforeEach(async () => {
  mockNetwork();
  const { keys } = await env.MW.list();
  await Promise.all(keys.map((k) => env.MW.delete(k.name)));
});
afterEach(() => vi.restoreAllMocks());

test('OPTIONS from an allowed origin returns CORS headers', async () => {
  const res = await SELF.fetch('https://api.test/check', { method: 'OPTIONS', headers: { origin: ORIGIN } });
  expect(res.status).toBe(204);
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  expect(res.headers.get('access-control-allow-methods')).toBe('POST, GET, OPTIONS');
  expect(res.headers.get('access-control-allow-headers')).toBe('content-type, authorization');
  expect(res.headers.get('vary')).toBe('Origin');
});

test('POST from another origin is refused', async () => {
  const res = await post({ url: 'a.com', turnstileToken: 't' }, { origin: 'https://evil.example' });
  expect(res.status).toBe(403);
  expect(res.headers.get('access-control-allow-origin')).toBeNull();
});

test('bad json -> 400 invalid', async () => {
  const res = await post(null, { raw: '{nope' });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe('invalid');
});

test('bad turnstile -> 403 bot', async () => {
  turnstileOk = false;
  const res = await post({ url: 'rivera-plumbing.com', turnstileToken: 'bad' });
  expect(res.status).toBe(403);
  expect((await res.json()).error).toBe('bot');
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
});

test('missing turnstile token -> 403 bot without calling the network', async () => {
  const res = await post({ url: 'rivera-plumbing.com' });
  expect(res.status).toBe(403);
  expect(count('https://challenges.cloudflare.com/')).toBe(0);
  expect(await verifyTurnstile('', '1.1.1.1', env)).toBe(false);
});

test('sixth check in an hour -> 429 limit', async () => {
  for (let i = 0; i < 5; i++) {
    const r = await post({ url: `site${i}.example.com`, turnstileToken: 't' });
    expect(r.status).toBe(200);
  }
  const res = await post({ url: 'site9.example.com', turnstileToken: 't' });
  expect(res.status).toBe(429);
  expect((await res.json()).error).toBe('limit');
});

test('private url -> 400 private', async () => {
  const res = await post({ url: 'http://127.0.0.1/', turnstileToken: 't' });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe('private');
});

test('hostname resolving to a private ip -> 400 private', async () => {
  fetch.mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push(url);
    if (url.startsWith('https://challenges.cloudflare.com/')) return Response.json({ success: true });
    return Response.json({ Answer: [{ type: 1, data: '10.0.0.5' }] });
  });
  const res = await post({ url: 'sneaky.example.com', turnstileToken: 't' });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe('private');
});

test('missing url -> 400 invalid', async () => {
  const res = await post({ turnstileToken: 't' });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe('invalid');
});

test('missing city -> 400 invalid', async () => {
  for (const city of [undefined, '', '   ', 42]) {
    const res = await post({ url: 'rivera-plumbing.com', city, turnstileToken: 't' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid');
  }
  expect(count('https://www.googleapis.com/')).toBe(0);
});

test('same site twice hits the cache', async () => {
  const a = await post({ url: '  WWW.Rivera-Plumbing.com/ ', turnstileToken: 't' });
  expect(a.status).toBe(200);
  const first = await a.json();
  expect(first.url).toBe('https://www.rivera-plumbing.com/');
  const b = await post({ url: 'www.rivera-plumbing.com', turnstileToken: 't' });
  expect((await b.json()).id).toBe(first.id);
  expect(count('https://www.googleapis.com/')).toBe(1);
  expect(await env.MW.get(`report-id:${first.id}`)).not.toBeNull();
  expect(await env.MW.get('report:https://www.rivera-plumbing.com/|columbus,OH')).not.toBeNull();
  const c = await post({ url: 'www.rivera-plumbing.com', city: ' COLUMBUS, OH', turnstileToken: 't' });
  expect((await c.json()).id).toBe(first.id);
  const d = await post({ url: 'www.rivera-plumbing.com', city: 'Austin, TX', turnstileToken: 't' });
  expect((await d.json()).id).not.toBe(first.id);
});

test('unreachable site returns 200 with null score and is not cached', async () => {
  siteDown = true;
  const a = await post({ url: 'down.example.com', turnstileToken: 't' });
  expect(a.status).toBe(200);
  expect((await a.json()).score).toBeNull();
  expect(await env.MW.get('report:https://down.example.com/|columbus,OH')).toBeNull();
  await post({ url: 'down.example.com', turnstileToken: 't' });
  expect(count('https://www.googleapis.com/')).toBe(2);
});

test('unknown route -> 404 json', async () => {
  const res = await SELF.fetch('https://api.test/nope', { headers: { origin: ORIGIN } });
  expect(res.status).toBe(404);
  expect((await res.json()).error).toBe('not-found');
});

test('the old preview route is gone', async () => {
  const res = await SELF.fetch('https://api.test/p/abc?k=x', { headers: { origin: ORIGIN } });
  expect(res.status).toBe(404);
  expect((await res.json()).error).toBe('not-found');
});

test('cache hit carries the same CORS and vary headers', async () => {
  await post({ url: 'cachehdr.example.com', turnstileToken: 't' });
  const res = await post({ url: 'cachehdr.example.com', turnstileToken: 't' });
  expect(res.status).toBe(200);
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  expect(res.headers.get('vary')).toBe('Origin');
  expect(res.headers.get('content-type')).toBe('application/json');
});

test('an internal throw -> 500 server with CORS headers', async () => {
  vi.spyOn(env.MW, 'put').mockRejectedValue(new Error('kv down'));
  const res = await post({ url: 'boom.example.com', turnstileToken: 't' });
  expect(res.status).toBe(500);
  expect((await res.json()).error).toBe('server');
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  expect(res.headers.get('vary')).toBe('Origin');
});

test('report carries rankings, pitch and city', async () => {
  const r = await (await post({ url: 'rivera-plumbing.com', city: 'Columbus, OH', turnstileToken: 't' })).json();
  expect(r.categories.map((c) => c.key)).toEqual(['design', 'seo', 'rankings', 'speed', 'cta']);
  const rk = r.categories.find((c) => c.key === 'rankings');
  expect(rk.status).toBe('ok');
  expect(rk.results.map((x) => x.keyword)).toEqual(['plumber near me', 'best plumber near me', 'plumber in Columbus OH', 'plumber Columbus', 'emergency plumber near me']);
  expect(rk.results[0]).toEqual({ keyword: 'plumber near me', position: 4, inMaps: false });
  expect(rk.score).toBe(Math.round(70 / 5)); // position 30 is beyond the depth of 10, so it counts as not found
  expect(rk.results[1].position).toBeNull();
  expect(rk.depth).toBe(10);
  expect(JSON.parse(inits[calls.findIndex((u) => u.startsWith(DFS))].body)[0].depth).toBe(10);
  expect(r.pitch.headline).toBe("Here's what's costing you customers");
  expect(r.city).toBe('Columbus, OH');
  expect(count(DFS)).toBe(5);
  const i = calls.findIndex((u) => u.startsWith(DFS));
  expect(inits[i].headers.authorization).toBe(`Basic ${btoa('test-dfs-login:test-dfs-password')}`);
  expect(JSON.parse(inits[i].body)[0].location_name).toBe('Columbus,Ohio,United States');
});

test('rankings unavailable for an unknown city, without calling DataForSEO', async () => {
  const r = await (await post({ url: 'rivera-plumbing.com', city: 'Paris', turnstileToken: 't' })).json();
  expect(r.categories.find((c) => c.key === 'rankings')).toMatchObject({ status: 'unavailable', reason: 'no-city', score: null });
  expect(count(DFS)).toBe(0);
  expect(r.score).not.toBeNull();
});

test('a DataForSEO failure marks rankings failed and is not cached', async () => {
  dfs = () => new Response('no', { status: 500 });
  const r = await (await post({ url: 'rivera-plumbing.com', turnstileToken: 't' })).json();
  expect(r.categories.find((c) => c.key === 'rankings')).toMatchObject({ status: 'unavailable', reason: 'failed' });
  expect(await env.MW.get('report:https://rivera-plumbing.com/|columbus,OH')).toBeNull();
  expect(await env.MW.get(`report-id:${r.id}`)).not.toBeNull();
});

test('the 201st check in a day -> 429 busy, and a cache hit does not count', async () => {
  await post({ url: 'cached.example.com', turnstileToken: 't' }, { ip: '5.5.5.1' });
  expect(await env.MW.get(`cap:check:${today()}`)).toBe('1');
  await env.MW.put(`cap:check:${today()}`, '199');
  expect((await post({ url: 'n200.example.com', turnstileToken: 't' }, { ip: '5.5.5.2' })).status).toBe(200);
  const res = await post({ url: 'n201.example.com', turnstileToken: 't' }, { ip: '5.5.5.3' });
  expect(res.status).toBe(429);
  expect(await res.json()).toEqual({ error: 'busy' });
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  const hit = await post({ url: 'cached.example.com', turnstileToken: 't' }, { ip: '5.5.5.4' });
  expect(hit.status).toBe(200);
  expect(await env.MW.get(`cap:check:${today()}`)).toBe('200');
});

test('cache hits do not count toward the per-visitor limit', async () => {
  for (let i = 0; i < 7; i++) {
    expect((await post({ url: 'same.example.com', turnstileToken: 't' }, { ip: '6.6.6.6' })).status).toBe(200);
  }
  expect(count('https://www.googleapis.com/')).toBe(1);
});

test('"Columbus, OH" and "columbus, ohio" share one cache entry; unparsed cities use the lowercased text', async () => {
  const a = await (await post({ url: 'share.example.com', city: 'Columbus, OH', turnstileToken: 't' })).json();
  const b = await (await post({ url: 'share.example.com', city: 'columbus, ohio', turnstileToken: 't' })).json();
  expect(b.id).toBe(a.id);
  expect(count('https://www.googleapis.com/')).toBe(1);
  expect((await env.MW.list({ prefix: 'report:https://share.example.com/' })).keys.map((k) => k.name)).toEqual(['report:https://share.example.com/|columbus,OH']);
  await post({ url: 'share.example.com', city: 'Paris', turnstileToken: 't' });
  expect(await env.MW.get('report:https://share.example.com/|paris')).not.toBeNull();
});
