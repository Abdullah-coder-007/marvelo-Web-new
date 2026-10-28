import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { verifyTurnstile } from '../src/limits.js';

const ORIGIN = 'https://marveloweb.com';
const HTML = '<html><head><title>Rivera Plumbing</title></head><body><h1>Hi</h1></body></html>';
const PSI = { lighthouseResult: { categories: { performance: { score: 0.9 }, seo: { score: 0.9 }, accessibility: { score: 0.9 }, 'best-practices': { score: 0.9 } }, audits: {} } };
let calls;
let turnstileOk;
let siteDown;

function mockNetwork() {
  calls = [];
  turnstileOk = true;
  siteDown = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push(url);
    if (url.startsWith('https://challenges.cloudflare.com/')) return Response.json({ success: turnstileOk });
    if (url.startsWith('https://cloudflare-dns.com/')) {
      const type = new URL(url).searchParams.get('type');
      return Response.json({ Answer: type === 'A' ? [{ type: 1, data: '93.184.215.14' }] : [] });
    }
    if (url.startsWith('https://www.googleapis.com/')) return siteDown ? new Response('no', { status: 500 }) : Response.json(PSI);
    if (siteDown) return new Response('down', { status: 503 });
    return new Response(HTML, { headers: { 'content-type': 'text/html' } });
  });
}
const count = (prefix) => calls.filter((u) => u.startsWith(prefix)).length;

function post(body, { origin = ORIGIN, ip = '1.1.1.1', raw } = {}) {
  return SELF.fetch('https://api.test/check', {
    method: 'POST',
    headers: { origin, 'cf-connecting-ip': ip, 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
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
  expect(res.headers.get('access-control-allow-headers')).toBe('content-type');
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

test('same site twice hits the cache', async () => {
  const a = await post({ url: '  WWW.Rivera-Plumbing.com/ ', turnstileToken: 't' });
  expect(a.status).toBe(200);
  const first = await a.json();
  expect(first.url).toBe('https://www.rivera-plumbing.com/');
  const b = await post({ url: 'www.rivera-plumbing.com', turnstileToken: 't' });
  expect((await b.json()).id).toBe(first.id);
  expect(count('https://www.googleapis.com/')).toBe(1);
  expect(await env.MW.get(`report-id:${first.id}`)).not.toBeNull();
  expect(await env.MW.get('report:https://www.rivera-plumbing.com/')).not.toBeNull();
});

test('unreachable site returns 200 with null score and is not cached', async () => {
  siteDown = true;
  const a = await post({ url: 'down.example.com', turnstileToken: 't' });
  expect(a.status).toBe(200);
  expect((await a.json()).score).toBeNull();
  expect(await env.MW.get('report:https://down.example.com/')).toBeNull();
  await post({ url: 'down.example.com', turnstileToken: 't' });
  expect(count('https://www.googleapis.com/')).toBe(2);
});

test('unknown route -> 404 json', async () => {
  const res = await SELF.fetch('https://api.test/nope', { headers: { origin: ORIGIN } });
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
