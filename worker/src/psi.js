const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function runPsi(url, env, fetchImpl = fetch) {
  try {
    const q = new URLSearchParams({ url: String(url), strategy: 'mobile' });
    for (const c of ['performance', 'seo', 'accessibility', 'best-practices']) q.append('category', c);
    if (env?.PSI_API_KEY) q.set('key', env.PSI_API_KEY);
    const res = await fetchImpl(`${ENDPOINT}?${q}`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const lh = (await res.json()).lighthouseResult;
    const cat = (k) => Math.round((lh.categories[k].score ?? 0) * 100);
    const audits = {};
    for (const [id, a] of Object.entries(lh.audits || {})) {
      if (typeof a.score === 'number' && a.score < 0.9) audits[id] = { score: a.score, title: a.title };
    }
    return {
      performance: cat('performance'),
      seo: cat('seo'),
      accessibility: cat('accessibility'),
      bestPractices: cat('best-practices'),
      lcpMs: lh.audits?.['largest-contentful-paint']?.numericValue ?? null,
      audits,
    };
  } catch {
    return null;
  }
}
