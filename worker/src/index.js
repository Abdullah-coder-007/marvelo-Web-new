import { GuardError, normalizeUrl, assertPublicHost } from './url-guard.js';
import { fetchPage } from './page-scan.js';
import { runPsi } from './psi.js';
import { buildReport } from './report.js';
import { verifyTurnstile, rateLimit, capDaily } from './limits.js';
import { parseCity, detectTrade, runRankings } from './rankings.js';
import { createLead } from './leads.js';
import { handleLeads } from './admin.js';

const REPORT_TTL = 86400;
const REPORT_ID_TTL = 90 * 86400;
const CHECK_MAX = 5;
const CHECK_WINDOW = 3600;
const CHECK_DAILY_CAP = 200;

function respond(data, status, origin, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }
  return new Response(data === null ? null : typeof data === 'string' ? data : JSON.stringify(data), { status, headers });
}

async function rankingsFor(url, facts, city, env) {
  const loc = parseCity(city);
  if (!loc) return { status: 'no-city' };
  const trade = detectTrade(facts);
  if (!trade) return { status: 'no-trade' };
  const r = await runRankings(url.hostname, trade, loc, env);
  return r ? { status: 'ok', results: r.results } : { status: 'failed' };
}

async function handleCheck(request, env, origin) {
  const err = (error, status) => respond({ error }, status, origin);
  let body;
  try {
    body = await request.json();
  } catch {
    return err('invalid', 400);
  }
  if (!body || typeof body !== 'object') return err('invalid', 400);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await verifyTurnstile(body.turnstileToken, ip, env))) return err('bot', 403);

  let url;
  try {
    url = normalizeUrl(body.url);
  } catch (e) {
    return err(e instanceof GuardError ? e.code : 'invalid', 400);
  }
  const city = typeof body.city === 'string' ? body.city.replace(/\s+/g, ' ').trim() : '';
  if (!city || city.length > 100) return err('invalid', 400);

  // Cache hits are free, so they come before both limits.
  // "Columbus, OH" and "columbus, ohio" share an entry; unparsed cities fall back to the lowercased text.
  const loc = parseCity(city);
  const cacheKey = `report:${url.href}|${loc ? `${loc.city.toLowerCase()},${loc.state}` : city.toLowerCase()}`;
  const cached = await env.MW.get(cacheKey);
  if (cached) return respond(cached, 200, origin);

  try {
    await assertPublicHost(url);
  } catch {
    return err('private', 400);
  }
  if (!(await rateLimit(env, `check:${ip}`, CHECK_MAX, CHECK_WINDOW))) return err('limit', 429);
  if (!(await capDaily(env, 'check', CHECK_DAILY_CAP))) return err('busy', 429);

  // Rankings need the business type from the page, so they start as soon as the page is read.
  const pageP = fetchPage(url);
  const rankP = pageP.then((page) => rankingsFor(url, page.facts, city, env));
  const [page, psi, rank] = await Promise.allSettled([pageP, runPsi(url, env), rankP]);
  const facts = page.status === 'fulfilled' ? page.value.facts : null;
  const report = buildReport(
    url.href,
    facts,
    psi.status === 'fulfilled' ? psi.value : null,
    new Date(),
    rank.status === 'fulfilled' ? rank.value : { status: 'failed' },
  );
  report.city = city;
  if (report.score !== null) {
    const json = JSON.stringify(report);
    const writes = [env.MW.put(`report-id:${report.id}`, json, { expirationTtl: REPORT_ID_TTL })];
    // A failed rankings lookup may be a passing outage, so that report isn't cached for others.
    if (rank.status === 'fulfilled' && rank.value.status !== 'failed') writes.push(env.MW.put(cacheKey, json, { expirationTtl: REPORT_TTL }));
    await Promise.all(writes);
  }
  return respond(report, 200, origin);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ENHANCE_MAX = 2;
const ENHANCE_WINDOW = 86400;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function handleEnhance(request, env, origin) {
  const err = (error, status) => respond({ error }, status, origin);
  let body;
  try {
    body = await request.json();
  } catch {
    return err('invalid', 400);
  }
  if (!body || typeof body !== 'object') return err('invalid', 400);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await verifyTurnstile(body.turnstileToken, ip, env))) return err('bot', 403);
  if (!(await rateLimit(env, `enhance:${ip}`, ENHANCE_MAX, ENHANCE_WINDOW))) return err('limit', 429);

  const f = {
    website: str(body.website, 300), name: str(body.name, 200), email: str(body.email, 200),
    phone: str(body.phone, 50), business: str(body.business, 200), extras: str(body.extras, 2000),
    trade: str(body.trade, 100), issues: str(body.issues, 1000), city: str(body.city, 100),
    reportId: null,
  };
  if (!EMAIL_RE.test(f.email) || !f.phone || !f.website) return err('invalid', 400);

  const rid = str(body.reportId, 100);
  if (rid && (await env.MW.get(`report-id:${rid}`))) f.reportId = rid;

  await createLead(env, f);
  return respond({ ok: true }, 202, origin);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return respond({ error: 'forbidden' }, 403, null);
    const o = origin || null;

    if (request.method === 'OPTIONS') {
      return respond(null, 204, o, {
        'access-control-allow-methods': 'POST, GET, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-max-age': '86400',
      });
    }

    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/check' && request.method === 'POST') return await handleCheck(request, env, o);
      if (pathname === '/enhance' && request.method === 'POST') return await handleEnhance(request, env, o);
      if (pathname === '/leads' && request.method === 'GET') return await handleLeads(request, env, o, respond);
      return respond({ error: 'not-found' }, 404, o);
    } catch (e) {
      console.error(e);
      return respond({ error: 'server' }, 500, o);
    }
  },
};
