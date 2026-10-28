import { normalizeUrl, assertPublicHost } from './url-guard.js';
import { fetchPage } from './page-scan.js';
import { generatePreview } from './preview.js';
import { sendLeadEmail } from './mail.js';

export const LEAD_TTL = 90 * 86400;
const MAX_ATTEMPTS = 24;
const RETRY_GAP_MS = 3600 * 1000;
const MAX_PER_RUN = 5;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function newPreviewKey() {
  const out = [];
  while (out.length < 32) {
    for (const b of crypto.getRandomValues(new Uint8Array(48))) {
      if (b < 248 && out.length < 32) out.push(BASE62[b % 62]); // 248 = 62*4, so no modulo bias
    }
  }
  return out.join('');
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const saveLead = (env, lead) => env.MW.put(`lead:${lead.id}`, JSON.stringify(lead), { expirationTtl: LEAD_TTL });

export async function createLead(env, f) {
  const lead = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    website: f.website, name: f.name, email: f.email, phone: f.phone, business: f.business, extras: f.extras,
    reportId: f.reportId,
    previewKey: newPreviewKey(),
    emailed: false, attempts: 0, lastAttemptAt: null, failedReason: null,
  };
  await saveLead(env, lead);
  return lead;
}

async function readFacts(website) {
  try {
    const url = normalizeUrl(website);
    await assertPublicHost(url);
    return (await fetchPage(url)).facts ?? null;
  } catch {
    return null;
  }
}

export async function processLead(env, id) {
  const raw = await env.MW.get(`lead:${id}`);
  if (!raw) return;
  const lead = JSON.parse(raw);
  if (lead.emailed) return;

  let preview = await env.MW.get(`preview:${id}`);
  if (!preview && !lead.failedReason) {
    try {
      const html = await generatePreview(lead, await readFacts(lead.website), env);
      await env.MW.put(`preview:${id}`, html, { expirationTtl: LEAD_TTL });
      preview = html;
    } catch (e) {
      lead.failedReason = String(e?.message || 'preview-failed').slice(0, 100);
      await saveLead(env, lead);
    }
  }

  let report = null;
  if (lead.reportId) {
    try { report = JSON.parse(await env.MW.get(`report-id:${lead.reportId}`)); } catch { report = null; }
  }
  const link = preview ? `https://api.marveloweb.com/p/${id}?k=${lead.previewKey}` : null;
  lead.lastAttemptAt = new Date().toISOString();
  try {
    await sendLeadEmail(env, { lead, report, link, failedReason: lead.failedReason });
    lead.emailed = true;
  } catch (e) {
    lead.attempts += 1;
    console.error('lead email failed', id, e?.message);
  }
  await saveLead(env, lead);
}

export async function runCron(env, now) {
  const t = now.getTime();
  const cutoff = t - LEAD_TTL * 1000;
  const due = [];
  let cursor;
  do {
    const page = await env.MW.list({ prefix: 'lead:', cursor });
    for (const { name } of page.keys) {
      const id = name.slice(5);
      try {
        const raw = await env.MW.get(name);
        if (!raw) continue;
        const lead = JSON.parse(raw);
        if (lead.createdAt < cutoff) {
          await Promise.all([env.MW.delete(name), env.MW.delete(`preview:${id}`)]);
        } else if (!lead.emailed && lead.attempts < MAX_ATTEMPTS && (!lead.lastAttemptAt || t - Date.parse(lead.lastAttemptAt) >= RETRY_GAP_MS)) {
          due.push({ id, createdAt: lead.createdAt });
        }
      } catch {
        console.error('cron: bad lead record', id);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  due.sort((a, b) => a.createdAt - b.createdAt);
  for (const { id } of due.slice(0, MAX_PER_RUN)) {
    try {
      await processLead(env, id);
    } catch {
      console.error('cron: lead failed', id);
    }
  }
}
