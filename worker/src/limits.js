const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token, ip, env, fetchImpl = fetch) {
  if (!token || typeof token !== 'string') return false;
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET ?? '', response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetchImpl(SITEVERIFY, { method: 'POST', body });
    if (!res.ok) return false;
    return (await res.json()).success === true;
  } catch {
    return false;
  }
}

// A failed counter write must not fail the request; the request goes ahead as allowed.
async function putCounter(env, kvKey, count, ttl) {
  try {
    await env.MW.put(kvKey, String(count), { expirationTtl: ttl });
  } catch {
    console.error('counter write failed', kvKey.split(':').slice(0, 2).join(':'));
  }
}

// KV is eventually consistent, so this is approximate; that is acceptable here.
export async function rateLimit(env, key, max, windowSec) {
  const kvKey = `rl:${key}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  const count = parseInt((await env.MW.get(kvKey)) ?? '0', 10) + 1;
  if (count > max) return false;
  await putCounter(env, kvKey, count, Math.max(windowSec, 60));
  return true;
}

// Site-wide cap per UTC day, key cap:<name>:<YYYY-MM-DD>. Approximate for the same KV reason as above.
export async function capDaily(env, name, max, now = new Date()) {
  const kvKey = `cap:${name}:${now.toISOString().slice(0, 10)}`;
  const count = parseInt((await env.MW.get(kvKey)) ?? '0', 10) + 1;
  if (count > max) return false;
  await putCounter(env, kvKey, count, 2 * 86400);
  return true;
}
