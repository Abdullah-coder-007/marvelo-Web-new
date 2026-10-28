import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { listLeadKeys } from '../src/admin.js';

const ORIGIN = 'https://marveloweb.com';
const KEY = 'test-admin-key-0123456789abcdef';

function getLeads({ key = KEY, ip = '4.4.4.4', origin = ORIGIN } = {}) {
  const headers = { 'cf-connecting-ip': ip };
  if (origin) headers.origin = origin;
  if (key !== null) headers.authorization = `Bearer ${key}`;
  return SELF.fetch('https://api.test/leads', { headers });
}

const FULL = { id: 'r1', score: 55, verdict: 'Your website is holding you back.', categories: [{ key: 'speed', title: 'Speed on phones', score: 40, issues: [{ problem: 'Slow page', fix: 'f' }] }] };

const REPORT = { score: 55, verdict: FULL.verdict, categories: [{ key: 'speed', title: 'Speed on phones', score: 40, status: undefined, issues: FULL.categories[0].issues }], pitch: undefined };

async function seed(id, over = {}) {
  await env.MW.put(`lead:${id}`, JSON.stringify({
    id, createdAt: 1000, website: 'a.com', name: 'N', email: 'n@example.com', phone: '1', business: 'B',
    trade: 'Plumbing', city: 'Austin, TX', issues: 'Slow site', extras: 'secret extras', reportId: null, ...over,
  }));
}

beforeEach(async () => {
  const { keys } = await env.MW.list();
  await Promise.all(keys.map((k) => env.MW.delete(k.name)));
}, 60000);
afterEach(() => vi.restoreAllMocks());

test('no key -> 401', async () => {
  const res = await getLeads({ key: null });
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: 'auth' });
});

test('wrong key -> 401', async () => {
  const res = await getLeads({ key: 'nope' });
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: 'auth' });
});

test('the 11th failed attempt in an hour -> 429, and the right key still works', async () => {
  for (let i = 0; i < 10; i++) expect((await getLeads({ key: 'bad', ip: '5.5.5.5' })).status).toBe(401);
  const res = await getLeads({ key: 'bad', ip: '5.5.5.5' });
  expect(res.status).toBe(429);
  expect(await res.json()).toEqual({ error: 'limit' });
  expect((await getLeads({ ip: '5.5.5.5' })).status).toBe(200);
});

test('successful requests are not counted against the limit', async () => {
  for (let i = 0; i < 12; i++) expect((await getLeads({ ip: '6.6.6.6' })).status).toBe(200);
  expect((await getLeads({ key: 'bad', ip: '6.6.6.6' })).status).toBe(401);
});

test('correct key returns leads newest first with the right fields and the report', async () => {
  await env.MW.put('report-id:r1', JSON.stringify(FULL));
  await seed('old', { createdAt: 1000 });
  await seed('new', { createdAt: 3000, reportId: 'r1' });
  await seed('mid', { createdAt: 2000, reportId: 'missing' });
  const res = await getLeads();
  expect(res.status).toBe(200);
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  const { leads } = await res.json();
  expect(leads.map((l) => l.id)).toEqual(['new', 'mid', 'old']);
  expect(leads[0]).toEqual({
    id: 'new', createdAt: 3000, website: 'a.com', name: 'N', email: 'n@example.com', phone: '1', business: 'B',
    trade: 'Plumbing', city: 'Austin, TX', issues: 'Slow site', extras: 'secret extras', report: JSON.parse(JSON.stringify(REPORT)),
  });
  expect(leads[1].report).toBeNull();
  expect(leads[2].report).toBeNull();
});

test('corrupt records are skipped', async () => {
  await env.MW.put('lead:bad', '{not json');
  await env.MW.put('lead:nul', 'null');
  await seed('good');
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  const res = await getLeads();
  expect(res.status).toBe(200);
  expect((await res.json()).leads.map((l) => l.id)).toEqual(['good']);
  expect(err.mock.calls.flat().join(' ')).not.toContain('not json');
});

test('a corrupt report does not drop the lead', async () => {
  await env.MW.put('report-id:rbad', '{oops');
  await seed('l1', { reportId: 'rbad' });
  const { leads } = await (await getLeads()).json();
  expect(leads).toHaveLength(1);
  expect(leads[0].report).toBeNull();
});

test('more than one KV list page is followed with the cursor, and the total is capped', async () => {
  const pages = [
    { keys: [{ name: 'lead:a' }, { name: 'lead:b' }], list_complete: false, cursor: 'c1' },
    { keys: [{ name: 'lead:c' }], list_complete: false, cursor: 'c2' },
    { keys: [{ name: 'lead:d' }, { name: 'lead:e' }], list_complete: true },
  ];
  const seen = [];
  const fake = { MW: { list: async ({ prefix, cursor }) => { seen.push([prefix, cursor]); return pages[seen.length - 1]; } } };
  expect(await listLeadKeys(fake)).toEqual(['lead:a', 'lead:b', 'lead:c', 'lead:d', 'lead:e']);
  expect(seen).toEqual([['lead:', undefined], ['lead:', 'c1'], ['lead:', 'c2']]);
  seen.length = 0;
  expect(await listLeadKeys(fake, 3)).toEqual(['lead:a', 'lead:b', 'lead:c']);
  expect(seen).toHaveLength(2);
});

test('1001 leads (more than one real KV page) all come back', async () => {
  await Promise.all(Array.from({ length: 1001 }, (_, i) => seed(`l${i}`, { createdAt: i })));
  const { leads } = await (await getLeads()).json();
  expect(leads).toHaveLength(1001);
  expect(leads[0].createdAt).toBe(1000);
}, 60000);

test('a disallowed origin -> 403', async () => {
  const res = await getLeads({ origin: 'https://evil.example' });
  expect(res.status).toBe(403);
  expect(res.headers.get('access-control-allow-origin')).toBeNull();
});

test('preflight allows the authorization header', async () => {
  const res = await SELF.fetch('https://api.test/leads', { method: 'OPTIONS', headers: { origin: ORIGIN } });
  expect(res.status).toBe(204);
  expect(res.headers.get('access-control-allow-headers')).toContain('authorization');
});

test("embedded reports are returned without any report-id reads; old leads fall back to one read", async () => {
  await env.MW.put("report-id:old", JSON.stringify(FULL));
  await seed("emb", { createdAt: 3000, report: FULL, reportId: "gone" });
  await seed("legacy", { createdAt: 2000, reportId: "old" });
  await seed("expired", { createdAt: 1000, reportId: "vanished" });
  const get = vi.spyOn(env.MW, "get");
  const { leads } = await (await getLeads()).json();
  const reads = get.mock.calls.flatMap((c) => c[0]).filter((k) => k.startsWith("report-id:"));
  expect(reads.sort()).toEqual(["report-id:old", "report-id:vanished"]);
  const R = JSON.parse(JSON.stringify(REPORT));
  expect(leads.map((l) => l.report)).toEqual([R, R, null]);
});

test('reads are bulk: few KV get calls for many leads, legacy reports in bulk too', async () => {
  await env.MW.put('report-id:old', JSON.stringify(FULL));
  await Promise.all(Array.from({ length: 250 }, (_, i) => seed('b' + i, { createdAt: i, reportId: i < 120 ? 'old' : null })));
  const get = vi.spyOn(env.MW, 'get');
  const res = await getLeads();
  expect((await res.json()).leads).toHaveLength(250);
  // 3 chunks of leads, plus one chunk for the single distinct legacy report
  expect(get.mock.calls.length).toBeLessThanOrEqual(Math.ceil(250 / 100) + 1);
  expect(get.mock.calls.every((c) => Array.isArray(c[0]))).toBe(true);
});

test('the report in the list is trimmed to the fields the page needs', async () => {
  await seed('t1', { report: { ...FULL, id: 'x', url: 'u', city: 'c', categories: [{ key: 'rankings', title: 'R', score: 1, status: 'ok', depth: 10, results: [], issues: [], extra: 'no' }] } });
  const { leads } = await (await getLeads()).json();
  expect(Object.keys(leads[0].report).sort()).toEqual(['categories', 'score', 'verdict']);
  expect(leads[0].report.categories[0]).toEqual({ key: 'rankings', title: 'R', score: 1, status: 'ok', depth: 10, results: [], issues: [] });
});

test('a too-short ADMIN_KEY fails closed with 401', async () => {
  const { handleLeads } = await import('../src/admin.js');
  const respond = (d, s) => new Response(JSON.stringify(d), { status: s });
  const short = { ...env, ADMIN_KEY: 'short-key' };
  const req = new Request('https://api.test/leads', { headers: { authorization: 'Bearer short-key' } });
  expect((await handleLeads(req, short, null, respond)).status).toBe(401);
  expect((await handleLeads(req, { ...env, ADMIN_KEY: undefined }, null, respond)).status).toBe(401);
});
