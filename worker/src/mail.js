const RESEND_URL = 'https://api.resend.com/emails';
const FROM = 'MarveloWeb Leads <leads@marveloweb.com>';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export async function sendLeadEmail(env, { lead, report, link, failedReason }, fetchImpl = fetch) {
  const fields = [
    ['Business', lead.business], ['Name', lead.name], ['Email', lead.email], ['Phone', lead.phone],
    ['Website', lead.website], ['Notes', lead.extras],
  ].filter(([, v]) => v);

  const reportLines = [];
  if (report) {
    reportLines.push(`Website check score: ${report.score ?? 'n/a'}${report.verdict ? ` (${report.verdict})` : ''}`);
    for (const c of report.categories || []) {
      reportLines.push(`- ${c.title}: ${c.score ?? 'n/a'}`);
      for (const i of (c.issues || []).slice(0, 2)) reportLines.push(`    * ${i.problem}`);
    }
  } else {
    reportLines.push('No website check was run.');
  }

  const status = link
    ? `Private preview link: ${link}`
    : `The preview could not be built (${failedReason || 'unknown reason'}). Build it by hand.`;
  const text = [...fields.map(([k, v]) => `${k}: ${v}`), '', ...reportLines, '', status].join('\n');
  const html = [
    '<h2>New website lead</h2>',
    `<table>${fields.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table>`,
    `<p>${reportLines.map(esc).join('<br>')}</p>`,
    link ? `<p><a href="${esc(link)}">Open private preview</a></p>` : `<p>${esc(status)}</p>`,
  ].join('\n');

  const base = `New lead: ${lead.business || lead.website}`;
  const res = await fetchImpl(RESEND_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY ?? ''}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [env.LEAD_EMAIL_TO],
      reply_to: lead.email,
      subject: link ? base : `Preview failed: ${base}`,
      text,
      html,
    }),
  });
  if (!res.ok) throw new Error(`resend-${res.status}`);
}
