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

const CHUNK = 100; // KV bulk get: up to 100 keys per call, and it counts as one operation
export const MIN_KEY_LENGTH = 24;

async function bulkGet(env, names) {
  const out = new Map();
  for (let i = 0; i < names.length; i += CHUNK) {
    const got = await env.MW.get(names.slice(i, i + CHUNK));
    for (const [k, v] of got) out.set(k, v);
  }
  return out;
}

// Only what the page needs, so a long list stays small.
function trimReport(r) {
  if (!r || typeof r !== "object") return null;
  return {
    score: r.score, verdict: r.verdict,
    categories: (Array.isArray(r.categories) ? r.categories : []).map((c) => {
      const o = { key: c.key, title: c.title, score: c.score, status: c.status, issues: c.issues };
      if (c.results !== undefined) o.results = c.results;
      if (c.depth !== undefined) o.depth = c.depth;
      return o;
    }),
    pitch: r.pitch,
  };
}

export async function loadLeads(env) {
  const names = await listLeadKeys(env);
  const raws = await bulkGet(env, names);
  const parsed = [];
  for (const name of names) {
    try {
      const l = JSON.parse(raws.get(name));
      if (l && typeof l === "object") parsed.push([name, l]);
    } catch {
      console.error("leads: bad record"); // never log the record itself
    }
  }
  // Leads from before reports were embedded only hold a reportId; read those in bulk too.
  const legacy = [...new Set(parsed.filter(([, l]) => !(l.report && typeof l.report === "object") && typeof l.reportId === "string" && l.reportId).map(([, l]) => `report-id:${l.reportId}`))];
  const reports = await bulkGet(env, legacy);
  const leads = parsed.map(([name, l]) => {
    let report = l.report && typeof l.report === "object" ? l.report : null;
    if (!report && typeof l.reportId === "string" && l.reportId) {
      try { report = JSON.parse(reports.get(`report-id:${l.reportId}`)) || null; } catch { report = null; }
    }
    return {
      id: s(l.id) || name.slice(5), createdAt: typeof l.createdAt === "number" ? l.createdAt : 0,
      website: s(l.website), name: s(l.name), email: s(l.email), phone: s(l.phone), business: s(l.business),
      trade: s(l.trade), city: s(l.city), issues: s(l.issues), extras: s(l.extras), report: trimReport(report),
    };
  });
  return leads.sort((a, b) => b.createdAt - a.createdAt);
}

// `respond` is the router's CORS-aware responder.
export async function handleLeads(request, env, origin, respond) {
  const m = /^Bearer (.+)$/.exec(request.headers.get('authorization') || '');
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < MIN_KEY_LENGTH || !(await keyMatches(m ? m[1] : '', env.ADMIN_KEY))) {
    // Only failures count, so the right key is never locked out.
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (!(await rateLimit(env, `admin-fail:${ip}`, FAIL_MAX, FAIL_WINDOW))) return respond({ error: 'limit' }, 429, origin);
    return respond({ error: 'auth' }, 401, origin);
  }
  return respond({ leads: await loadLeads(env) }, 200, origin, { 'cache-control': 'no-store' });
}
