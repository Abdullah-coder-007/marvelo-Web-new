import { GuardError, normalizeUrl, assertPublicHost } from './url-guard.js';
import { fetchPage } from './page-scan.js';
import { runPsi } from './psi.js';
import { buildReport } from './report.js';
import { verifyTurnstile, rateLimit } from './limits.js';

const REPORT_TTL = 86400;
const REPORT_ID_TTL = 90 * 86400;
const CHECK_MAX = 5;
const CHECK_WINDOW = 3600;

function respond(data, status, origin, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }
  return new Response(data === null ? null : typeof data === 'string' ? data : JSON.stringify(data), { status, headers });
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
  if (!(await rateLimit(env, `check:${ip}`, CHECK_MAX, CHECK_WINDOW))) return err('limit', 429);

  let url;
  try {
    url = normalizeUrl(body.url);
  } catch (e) {
    return err(e instanceof GuardError ? e.code : 'invalid', 400);
  }

  const cacheKey = `report:${url.href}`;
  const cached = await env.MW.get(cacheKey);
  if (cached) return respond(cached, 200, origin);

  try {
    await assertPublicHost(url);
  } catch {
    return err('private', 400);
  }

  const [page, psi] = await Promise.allSettled([fetchPage(url), runPsi(url, env)]);
  const facts = page.status === 'fulfilled' ? page.value.facts : null;
  const report = buildReport(url.href, facts, psi.status === 'fulfilled' ? psi.value : null);
  if (report.score !== null) {
    const json = JSON.stringify(report);
    await Promise.all([
      env.MW.put(cacheKey, json, { expirationTtl: REPORT_TTL }),
      env.MW.put(`report-id:${report.id}`, json, { expirationTtl: REPORT_ID_TTL }),
    ]);
  }
  return respond(report, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return respond({ error: 'forbidden' }, 403, null);
    const o = origin || null;

    if (request.method === 'OPTIONS') {
      return respond(null, 204, o, {
        'access-control-allow-methods': 'POST, GET, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      });
    }

    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/check' && request.method === 'POST') return await handleCheck(request, env, o);
      return respond({ error: 'not-found' }, 404, o);
    } catch {
      return respond({ error: 'server' }, 500, o);
    }
  },
};
