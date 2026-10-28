import { GuardError, normalizeUrl, assertPublicHost } from './url-guard.js';

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10_000;
const TEXT_CAP = 4000;
const ACTION_RE = /\b(book|quote|call|contact|appointment|schedule|estimate)\b/i;

async function readCapped(body) {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(total, MAX_BYTES));
  let off = 0;
  for (const c of chunks) {
    const part = c.subarray(0, out.length - off);
    out.set(part, off);
    off += part.length;
    if (off >= out.length) break;
  }
  return out;
}

const clean = (s) => s.replace(/\s+/g, ' ').trim();

function ldValues(node, key, out = []) {
  if (Array.isArray(node)) node.forEach((n) => ldValues(n, key, out));
  else if (node && typeof node === 'object') {
    if (key in node) out.push(node[key]);
    Object.values(node).forEach((v) => typeof v === 'object' && ldValues(v, key, out));
  }
  return out;
}

export async function scanHtml(res, finalUrl = res.url) {
  const bytes = await readCapped(res.body);
  const f = {
    title: '', description: '', viewport: false,
    https: /^https:/i.test(finalUrl || ''),
    indexable: !/noindex/i.test(res.headers.get('x-robots-tag') || ''),
    h1Count: 0, telLinks: 0, forms: 0, actionButton: false,
    jsonLdTypes: [], copyrightYear: null, headings: [], phone: null, address: null, text: '',
  };
  let skip = false;
  let text = '';
  let ldRaw = '';
  let titleRaw = '';
  let actionSeen = 0;
  let action = null; // { text }
  let heading = null;

  const onEnd = (el, fn) => el.onEndTag(fn);
  const rewriter = new HTMLRewriter()
    .on('title', { text: (t) => { titleRaw += t.text; } })
    .on('meta', {
      element(el) {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const content = el.getAttribute('content') || '';
        if (name === 'description') f.description = clean(content);
        else if (name === 'viewport') f.viewport = true;
        else if (name === 'robots' && /noindex/i.test(content)) f.indexable = false;
      },
    })
    .on('script, style, noscript', {
      element(el) {
        skip = true;
        onEnd(el, () => { skip = false; });
      },
    })
    .on('script[type="application/ld+json" i]', { text: (t) => { ldRaw += t.text; if (t.lastInTextNode) ldRaw += '\n\u0000'; } })
    .on('form', { element() { f.forms++; } })
    .on('a[href^="tel:" i]', {
      element(el) {
        f.telLinks++;
        if (!f.phone) f.phone = decodeURIComponent(el.getAttribute('href').slice(4)).replace(/\s+/g, '') || null;
      },
    })
    .on('a, button', {
      element(el) {
        if (++actionSeen > 40 || f.actionButton) return;
        action = { text: '' };
        const mine = action;
        onEnd(el, () => { if (ACTION_RE.test(mine.text)) f.actionButton = true; if (action === mine) action = null; });
      },
      text(t) { if (action) action.text += t.text; },
    })
    .on('h1, h2, h3', {
      element(el) {
        if (el.tagName === 'h1') f.h1Count++;
        heading = { text: '' };
        const mine = heading;
        onEnd(el, () => { const s = clean(mine.text); if (s) f.headings.push(s); if (heading === mine) heading = null; });
      },
      text(t) { if (heading) heading.text += t.text; },
    })
    .on('body', { text(t) { if (!skip) text += t.text; } });

  await rewriter.transform(new Response(bytes, { headers: { 'content-type': 'text/html' } })).arrayBuffer();

  f.title = clean(titleRaw);
  const fullText = clean(text.replace(/&copy;/gi, '©').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&'));
  f.text = fullText.slice(0, TEXT_CAP);

  const types = new Set();
  for (const block of ldRaw.split('\u0000')) {
    if (!block.trim()) continue;
    let data;
    try { data = JSON.parse(block); } catch { continue; }
    for (const t of ldValues(data, '@type').flat()) if (typeof t === 'string') types.add(t);
    if (!f.phone) f.phone = ldValues(data, 'telephone').find((v) => typeof v === 'string') || null;
    if (!f.address) {
      const a = ldValues(data, 'address')[0];
      if (typeof a === 'string') f.address = a;
      else if (a && typeof a === 'object') {
        f.address = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(', ') || null;
      }
    }
  }
  f.jsonLdTypes = [...types];

  let year = null;
  for (const m of fullText.matchAll(/(?:©|copyright)[^0-9]{0,20}((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/gi)) {
    for (const y of [m[1], m[2]]) if (y && (year === null || Number(y) > year)) year = Number(y);
  }
  f.copyrightYear = year;
  return f;
}

const guard = async (url, resolve) => {
  await assertPublicHost(url, resolve);
  return url;
};

export async function fetchPage(url, deps = {}) {
  const doFetch = deps.fetch ?? ((...a) => fetch(...a));
  const resolve = deps.resolve; // undefined -> Task 1 default
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    let current = await guard(normalizeUrl(url.href), resolve);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await doFetch(current.href, { redirect: 'manual', signal, headers: { accept: 'text/html' } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        if (hop === MAX_REDIRECTS) return { facts: null, error: 'redirects' };
        const next = new URL(res.headers.get('location'), current);
        current = await guard(normalizeUrl(next.href), resolve);
        continue;
      }
      if (!res.ok) return { facts: null, error: 'fetch-failed' };
      if (!/html/i.test(res.headers.get('content-type') || '')) return { facts: null, error: 'not-html' };
      return { facts: await scanHtml(res, current.href), error: null };
    }
    return { facts: null, error: 'redirects' };
  } catch (e) {
    if (e instanceof GuardError) return { facts: null, error: e.code };
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return { facts: null, error: 'timeout' };
    return { facts: null, error: 'fetch-failed' };
  }
}
