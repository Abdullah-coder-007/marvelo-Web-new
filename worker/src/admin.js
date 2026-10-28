import { rateLimit } from './limits.js';

export const MAX_LEADS = 2000;
const FAIL_MAX = 10;
const FAIL_WINDOW = 3600;

const enc = new TextEncoder();

// Compare SHA-256 digests byte by byte without early exit, so neither content nor length leaks through timing.
async function keyMatches(given, expected) {
  if (!expected || !given) return false;
  const [a, b] = await Promise.all([given, expected].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Lists lead keys page by page (cursor) until there are no more or `max` keys are collected.
export async function listLeadKeys(env, max = MAX_LEADS) {
  const names = [];
  let cursor;
  do {
    const page = await env.MW.list({ prefix: 'lead:', cursor });
    for (const k of page.keys) if (names.length < max) names.push(k.name);
    cursor = page.list_complete || names.length >= max ? undefined : page.cursor;
  } while (cursor);
  return names;
}

const s = (v) => (typeof v === 'string' ? v : '');

async function readLead(env, name) {
  try {
    const raw = await env.MW.get(name);
    if (!raw) return null;
    const l = JSON.parse(raw);
    if (!l || typeof l !== 'object') return null;
    let report = l.report && typeof l.report === "object" ? l.report : null;
    if (!report && typeof l.reportId === 'string' && l.reportId) {
      try { report = JSON.parse(await env.MW.get(`report-id:${l.reportId}`)) || null; } catch { report = null; }
    }
    return {
      id: s(l.id) || name.slice(5), createdAt: typeof l.createdAt === 'number' ? l.createdAt : 0,
      website: s(l.website), name: s(l.name), email: s(l.email), phone: s(l.phone), business: s(l.business),
      trade: s(l.trade), city: s(l.city), issues: s(l.issues), report,
    };
  } catch {
    console.error('leads: bad record'); // never log the record itself
    return null;
  }
}

export async function loadLeads(env) {
  const names = await listLeadKeys(env);
  const leads = [];
  for (let i = 0; i < names.length; i += 20) {
    const got = await Promise.all(names.slice(i, i + 20).map((n) => readLead(env, n)));
    for (const l of got) if (l) leads.push(l);
  }
  return leads.sort((a, b) => b.createdAt - a.createdAt);
}

// `respond` is the router's CORS-aware responder.
export async function handleLeads(request, env, origin, respond) {
  const m = /^Bearer (.+)$/.exec(request.headers.get('authorization') || '');
  if (!(await keyMatches(m ? m[1] : '', env.ADMIN_KEY))) {
    // Only failures count, so the right key is never locked out.
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (!(await rateLimit(env, `admin-fail:${ip}`, FAIL_MAX, FAIL_WINDOW))) return respond({ error: 'limit' }, 429, origin);
    return respond({ error: 'auth' }, 401, origin);
  }
  return respond({ leads: await loadLeads(env) }, 200, origin, { 'cache-control': 'no-store' });
}
