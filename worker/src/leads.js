// Leads are kept for a year (KV expiry); the owner reads them on the private leads page.
export const LEAD_TTL = 365 * 86400;

export async function createLead(env, f) {
  const lead = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    website: f.website, name: f.name, email: f.email, phone: f.phone, business: f.business, extras: f.extras,
    trade: f.trade, issues: f.issues, city: f.city,
    reportId: f.reportId,
  };
  await env.MW.put(`lead:${lead.id}`, JSON.stringify(lead), { expirationTtl: LEAD_TTL });
  return lead;
}
