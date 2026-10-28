import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { listLeadKeys } from '../src/admin.js';

const ORIGIN = 'https://marveloweb.com';
const KEY = 'test-admin-key';

function getLeads({ key = KEY, ip = '4.4.4.4', origin = ORIGIN } = {}) {
  const headers = { 'cf-connecting-ip': ip };
  if (origin) headers.origin = origin;
  if (key !== null) headers.authorization = `Bearer ${key}`;
  return SELF.fetch('https://api.test/leads', { headers });
}

const REPORT = { id: 'r1', score: 55, verdict: 'Your website is holding you back.', categories: [{ key: 'speed', title: 'Speed on phones', score: 40, issues: [{ problem: 'Slow page', fix: 'f' }] }] };

async function seed(id, over = {}) {
  await env.MW.put(`lead:${id}`, JSON.stringify({
    id, createdAt: 1000, website: 'a.com', name: 'N', email: 'n@example.com', phone: '1', business: 'B',
    trade: 'Plumbing', city: 'Austin, TX', issues: 'Slow site', extras: 'secret extras', reportId: null, ...over,
  }));
}

beforeEach(async () => {
  const { keys } = await env.MW.list();
  await Promise.all(keys.map((k) => env.MW.delete(k.name)));
});
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
  await env.MW.put('report-id:r1', JSON.stringify(REPORT));
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
    trade: 'Plumbing', city: 'Austin, TX', issues: 'Slow site', report: REPORT,
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

test('over 1000 leads (several real KV pages) all come back', async () => {
  await Promise.all(Array.from({ length: 1005 }, (_, i) => seed(`l${i}`, { createdAt: i })));
  const { leads } = await (await getLeads()).json();
  expect(leads).toHaveLength(1005);
  expect(leads[0].createdAt).toBe(1004);
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
