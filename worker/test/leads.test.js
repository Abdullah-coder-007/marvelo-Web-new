import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { runCron } from '../src/leads.js';

const ORIGIN = 'https://marveloweb.com';
const HTML = '<html><head><title>Rivera Plumbing</title></head><body><h1>Hi</h1></body></html>';
const GOOD = '```html\n<html><body>New site<script>x()</script></body></html>\n```';
let calls, claude, resendOk;

function mockNetwork() {
  calls = [];
  claude = () => Response.json({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: GOOD }] });
  resendOk = true;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push({ url, init });
    if (url.startsWith('https://challenges.cloudflare.com/')) return Response.json({ success: true });
    if (url.startsWith('https://cloudflare-dns.com/')) {
      const type = new URL(url).searchParams.get('type');
      return Response.json({ Answer: type === 'A' ? [{ type: 1, data: '93.184.215.14' }] : [] });
    }
    if (url.startsWith('https://api.anthropic.com/')) return claude();
    if (url.startsWith('https://api.resend.com/')) return resendOk ? Response.json({ id: 'm1' }) : new Response('no', { status: 500 });
    return new Response(HTML, { headers: { 'content-type': 'text/html' } });
  });
}
const emails = () => calls.filter((c) => c.url.startsWith('https://api.resend.com/')).map((c) => JSON.parse(c.init.body));
const cron = (now = new Date()) => runCron(env, now);
const anthropicCalls = () => calls.filter((c) => c.url.startsWith('https://api.anthropic.com/')).length;

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

test('enhance replies 202 and does no preview work itself', async () => {
  const res = await enhance(form);
  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({ ok: true });
  const [id] = await leadIds();
  const lead = await getLead(id);
  expect(lead.emailed).toBe(false);
  expect(lead.attempts).toBe(0);
  expect(lead.previewKey).toMatch(/^[0-9A-Za-z]{32}$/);
  expect(lead.email).toBe('ana@example.com');
  expect(anthropicCalls()).toBe(0);
  expect(await env.MW.get(`preview:${id}`)).toBeNull();
});

test('a fresh lead gets its preview and email on the first cron run', async () => {
  await enhance(form);
  const [id] = await leadIds();
  await cron();
  expect(anthropicCalls()).toBe(1);
  expect((await getLead(id)).emailed).toBe(true);
  expect((await getLead(id)).lastAttemptAt).toBeTruthy();
  expect(emails().length).toBe(1);
});

test('enhance builds preview, emails owner with link, escapes HTML', async () => {
  await env.MW.put('report-id:r1', JSON.stringify({ id: 'r1', url: 'https://rivera-plumbing.com/', score: 55, verdict: 'v', categories: [{ title: 'Speed on phones', score: 40, issues: [{ problem: 'Slow page', fix: 'f' }] }] }));
  const res = await enhance({ ...form, reportId: 'r1' });
  expect(res.status).toBe(202);
  const [id] = await leadIds();
  await cron();
  const lead = await getLead(id);
  expect(lead.emailed).toBe(true);
  expect(await env.MW.get(`preview:${id}`)).toBe('<html><body>New site</body></html>');
  const [mail] = emails();
  expect(mail.from).toContain('leads@marveloweb.com');
  expect(mail.to).toEqual(['owner@test.example']);
  expect(mail.reply_to).toBe('ana@example.com');
  expect(mail.subject).toContain('Rivera Plumbing');
  expect(mail.subject.startsWith('Preview failed:')).toBe(false);
  expect(mail.text).toContain(`https://api.marveloweb.com/p/${id}?k=${lead.previewKey}`);
  expect(mail.text).toContain('55');
  expect(mail.text).toContain('Slow page');
  expect(mail.html).toContain('&lt;b&gt;Rivera&lt;/b&gt;');
  expect(mail.html).not.toContain('<b>Rivera</b>');
  const auth = calls.find((c) => c.url.startsWith('https://api.resend.com/')).init.headers.authorization;
  expect(auth).toBe('Bearer test-resend');
  const cl = calls.find((c) => c.url.startsWith('https://api.anthropic.com/'));
  const body = JSON.parse(cl.init.body);
  expect(body.model).toBe('claude-sonnet-5-5');
  expect(body.max_tokens).toBe(16000);
  expect(cl.init.headers['anthropic-version']).toBe('2023-06-01');
  expect(cl.init.headers['x-api-key']).toBe('test-anthropic');
});

test('without a report the email says so', async () => {
  await enhance(form);
  const [id] = await leadIds();
  await cron();
  expect(emails()[0].text).toContain('No website check was run.');
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

test('Claude failure still emails with "Preview failed:" subject', async () => {
  claude = () => new Response('boom', { status: 500 });
  await enhance(form);
  const [id] = await leadIds();
  await cron();
  const [mail] = emails();
  expect(mail.subject.startsWith('Preview failed:')).toBe(true);
  expect(mail.text).not.toContain('/p/');
  expect(await env.MW.get(`preview:${id}`)).toBeNull();
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

async function seedLead(id, over) {
  const lead = { id, createdAt: Date.now(), website: 'a.com', name: 'N', email: 'n@example.com', phone: '1', business: 'B', extras: '', reportId: null, previewKey: 'p'.repeat(32), emailed: false, attempts: 0, failedReason: null, ...over };
  await env.MW.put(`lead:${id}`, JSON.stringify(lead));
  await env.MW.put(`preview:${id}`, '<html></html>');
}

test('email failure is retried by cron, max 24', async () => {
  resendOk = false;
  await enhance(form);
  const [id] = await leadIds();
  await cron();
  expect((await getLead(id)).attempts).toBe(1);
  expect((await getLead(id)).emailed).toBe(false);

  resendOk = true;
  await seedLead('t23', { attempts: 23 });
  await seedLead('t24', { attempts: 24 });
  const before = emails().length;
  await cron(new Date(Date.now() + 2 * 3600 * 1000)); // an hour+ later, so the failed one is due again
  expect(emails().length - before).toBe(2); // the failed one above and t23, not t24
  expect((await getLead(id)).emailed).toBe(true);
  expect((await getLead('t23')).emailed).toBe(true);
  expect((await getLead('t24')).emailed).toBe(false);
  expect((await getLead('t24')).attempts).toBe(24);
  expect(anthropicCalls()).toBe(1); // Claude not called again on the email retry
});

test('cron skips a lead attempted 30 min ago and retries one attempted 61 min ago', async () => {
  const now = new Date();
  await seedLead('recent', { attempts: 1, lastAttemptAt: new Date(now.getTime() - 30 * 60000).toISOString() });
  await seedLead('stale', { attempts: 1, lastAttemptAt: new Date(now.getTime() - 61 * 60000).toISOString() });
  await cron(now);
  expect((await getLead('recent')).emailed).toBe(false);
  expect((await getLead('recent')).attempts).toBe(1);
  expect((await getLead('stale')).emailed).toBe(true);
  expect(emails().length).toBe(1);
});

test('cron processes at most 5 due leads per run, oldest first', async () => {
  const now = Date.now();
  for (let i = 0; i < 7; i++) await seedLead(`l${i}`, { createdAt: now - (100 - i) * 1000 });
  await cron(new Date(now));
  const done = [];
  for (let i = 0; i < 7; i++) done.push((await getLead(`l${i}`)).emailed);
  expect(done).toEqual([true, true, true, true, true, false, false]);
  expect(emails().length).toBe(5);
});

test('a corrupt lead record does not stop the others', async () => {
  await env.MW.put('lead:bad', '{not json');
  await seedLead('good', {});
  await cron();
  expect((await getLead('good')).emailed).toBe(true);
  expect(await env.MW.get('lead:bad')).toBe('{not json');
});

test('cron deletes leads older than 90 days with their previews', async () => {
  const now = new Date();
  await seedLead('old', { createdAt: now.getTime() - 91 * 86400000, emailed: true });
  await seedLead('new', { createdAt: now.getTime() - 10 * 86400000, emailed: true });
  await runCron(env, now);
  expect(await env.MW.get('lead:old')).toBeNull();
  expect(await env.MW.get('preview:old')).toBeNull();
  expect(await env.MW.get('lead:new')).not.toBeNull();
  expect(await env.MW.get('preview:new')).not.toBeNull();
});
