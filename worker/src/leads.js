import { sendLeadEmail } from './mail.js';

export const LEAD_TTL = 90 * 86400;
const MAX_ATTEMPTS = 24;
const RETRY_GAP_MS = 3600 * 1000;
const MAX_PER_RUN = 5;

const saveLead = (env, lead) => env.MW.put(`lead:${lead.id}`, JSON.stringify(lead), { expirationTtl: LEAD_TTL });

export async function createLead(env, f) {
  const lead = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    website: f.website, name: f.name, email: f.email, phone: f.phone, business: f.business, extras: f.extras,
    trade: f.trade, issues: f.issues, city: f.city,
    reportId: f.reportId,
    emailed: false, attempts: 0, lastAttemptAt: null,
  };
  await saveLead(env, lead);
  return lead;
}

export async function processLead(env, id) {
  const raw = await env.MW.get(`lead:${id}`);
  if (!raw) return;
  const lead = JSON.parse(raw);
  if (lead.emailed) return;

  let report = null;
  if (lead.reportId) {
    try { report = JSON.parse(await env.MW.get(`report-id:${lead.reportId}`)); } catch { report = null; }
  }
  lead.lastAttemptAt = new Date().toISOString();
  try {
    await sendLeadEmail(env, { lead, report });
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
          // preview:<id> is from before the AI preview was removed; delete it too if it is still there.
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

  if (!env.LEAD_EMAIL_TO) {
    console.error('LEAD_EMAIL_TO not set');
    return;
  }
  due.sort((a, b) => a.createdAt - b.createdAt);
  for (const { id } of due.slice(0, MAX_PER_RUN)) {
    try {
      await processLead(env, id);
    } catch {
      console.error('cron: lead failed', id);
    }
  }
}
