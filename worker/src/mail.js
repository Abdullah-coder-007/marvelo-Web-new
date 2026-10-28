const RESEND_URL = 'https://api.resend.com/emails';
const FROM = 'MarveloWeb Leads <leads@marveloweb.com>';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function reportLines(report) {
  if (!report) return ['No website check was run.'];
  const lines = [`Website check score: ${report.score ?? 'n/a'}${report.verdict ? ` (${report.verdict})` : ''}`];
  if (report.url) lines.push(`Checked: ${report.url}${report.city ? ` (${report.city})` : ''}`);
  for (const c of report.categories || []) {
    lines.push(`- ${c.title}: ${c.score ?? 'n/a'}`);
    for (const r of c.results || []) {
      lines.push(`    ${r.keyword}: ${r.position ? `#${r.position}` : 'Not in the top 100'}${r.inMaps ? ' (in Google Maps)' : ''}`);
    }
    for (const i of c.issues || []) lines.push(`    * ${i.problem}`);
  }
  const points = report.pitch?.points || [];
  if (points.length) {
    lines.push('', 'Top problems:');
    for (const p of points) lines.push(`- ${p.problem} -> ${p.fix}`);
  }
  return lines;
}

export async function sendLeadEmail(env, { lead, report }, fetchImpl = fetch) {
  const fields = [
    ['Business', lead.business], ['Name', lead.name], ['Email', lead.email], ['Phone', lead.phone],
    ['Website', lead.website], ['Notes', lead.extras],
  ].filter(([, v]) => v);
  const lines = reportLines(report);

  const text = [...fields.map(([k, v]) => `${k}: ${v}`), '', ...lines].join('\n');
  const html = [
    '<h2>New website lead</h2>',
    `<table>${fields.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table>`,
    `<p>${lines.map(esc).join('<br>')}</p>`,
  ].join('\n');

  const res = await fetchImpl(RESEND_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY ?? ''}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [env.LEAD_EMAIL_TO],
      reply_to: lead.email,
      subject: `New lead: ${lead.business || lead.website}`,
      text,
      html,
    }),
  });
  if (!res.ok) throw new Error(`resend-${res.status}`);
}
