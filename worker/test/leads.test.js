import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { createLead } from '../src/leads.js';

const ORIGIN = 'https://marveloweb.com';
let calls;

function mockNetwork() {
  calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push({ url, init });
    if (url.startsWith('https://challenges.cloudflare.com/')) return Response.json({ success: true });
    return new Response('unexpected', { status: 599 });
  });
}
const otherCalls = () => calls.filter((c) => !c.url.startsWith('https://challenges.cloudflare.com/')).length;

const form = { website: 'rivera-plumbing.com', name: 'Ana <b>Rivera</b>', email: 'ana@example.com', phone: '555-0100', business: 'Rivera Plumbing', extras: 'more', turnstileToken: 't' };
function enhance(body, { ip = '2.2.2.2', origin = ORIGIN, raw } = {}) {
  return SELF.fetch('https://api.test/enhance', {
    method: 'POST',
    headers: { origin, 'cf-connecting-ip': ip, 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}
const leadIds = async () => (await env.MW.list({ prefix: 'lead:' })).keys.map((k) => k.name.slice(5));
const getLead = async (id) => JSON.parse(await env.MW.get(`lead:${id}`));

beforeEach(async () => {
  mockNetwork();
  const { keys } = await env.MW.list();
  await Promise.all(keys.map((k) => env.MW.delete(k.name)));
});
afterEach(() => vi.restoreAllMocks());

test('enhance replies 202 and only stores the lead (no email, nothing else fetched)', async () => {
  const res = await enhance(form);
  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({ ok: true });
  const [id] = await leadIds();
  const lead = await getLead(id);
  expect(lead.email).toBe('ana@example.com');
  expect('emailed' in lead).toBe(false);
  expect(otherCalls()).toBe(0);
});

test('a lead is stored for 365 days', async () => {
  const put = vi.spyOn(env.MW, 'put');
  await createLead(env, { ...form, reportId: null });
  expect(put).toHaveBeenCalledWith(expect.stringMatching(/^lead:/), expect.any(String), { expirationTtl: 31536000 });
});

test('trade, issues, city and report id reach the stored lead', async () => {
  await env.MW.put('report-id:r1', JSON.stringify({ id: 'r1', score: 55 }));
  await enhance({ ...form, trade: 'Plumbing', issues: 'Slow site; <i>no calls</i>', city: 'Austin, TX', reportId: 'r1' });
  const [id] = await leadIds();
  expect(await getLead(id)).toMatchObject({ trade: 'Plumbing', issues: 'Slow site; <i>no calls</i>', city: 'Austin, TX', reportId: 'r1', report: { id: 'r1', score: 55 } });
});

test('missing phone -> 400', async () => {
  const res = await enhance({ ...form, phone: '  ' }, { ip: '3.3.3.1' });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'invalid' });
  expect((await enhance({ ...form, email: 'nope' }, { ip: '3.3.3.2' })).status).toBe(400);
  expect((await enhance({ ...form, website: '' }, { ip: '3.3.3.3' })).status).toBe(400);
  expect((await enhance(null, { raw: '{bad', ip: '3.3.3.4' })).status).toBe(400);
  expect(await leadIds()).toEqual([]);
});

test('third enhance in a day -> 429', async () => {
  expect((await enhance(form, { ip: '9.9.9.9' })).status).toBe(202);
  expect((await enhance(form, { ip: '9.9.9.9' })).status).toBe(202);
  const res = await enhance(form, { ip: '9.9.9.9' });
  expect(res.status).toBe(429);
  expect(await res.json()).toEqual({ error: 'limit' });
});

test('bad turnstile -> 403', async () => {
  expect((await enhance({ ...form, turnstileToken: '' })).status).toBe(403);
});

test('a failed KV counter write still lets the request through', async () => {
  const { rateLimit, capDaily } = await import('../src/limits.js');
  const broken = { MW: { get: async () => null, put: async () => { throw new Error('kv down'); } } };
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await rateLimit(broken, 'enhance:1.1.1.1', 2, 86400)).toBe(true);
  expect(await capDaily(broken, 'check', 200)).toBe(true);
  expect(err.mock.calls.flat().join(' ')).not.toContain('1.1.1.1');
});
