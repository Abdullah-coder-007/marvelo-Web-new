import { describe, expect, test } from 'vitest';
import { buildReport, verdictFor } from '../src/report.js';
import { runPsi } from '../src/psi.js';

const psi = { performance: 42, seo: 80, accessibility: 70, bestPractices: 90, lcpMs: 6200, audits: {} };
const facts = {
  title: 'Rivera Plumbing | Austin plumbers', titleLength: 33, description: '', descriptionLength: 0, viewport: true, https: true, indexable: true,
  h1Count: 1, telLinks: 2, forms: 0, actionButton: true, jsonLdTypes: [], copyrightYear: 2026,
  canonical: true, favicon: true, datedMarkup: false, images: 5, imagesWithAlt: 5, robotsTxt: true, sitemap: true,
};
const RANK = { status: 'ok', results: [
  { keyword: 'plumber near me', position: 2, inMaps: false },
  { keyword: 'best plumber near me', position: 7, inMaps: false },
  { keyword: 'plumber in Austin TX', position: null, inMaps: false },
  { keyword: 'plumber Austin', position: null, inMaps: false },
  { keyword: 'emergency plumber near me', position: null, inMaps: false },
] };
const NOW = new Date('2026-10-28');
const NO_CITY = "We couldn't check rankings for that city.";
const scores = (r) => Object.fromEntries(r.categories.map((c) => [c.key, c.score]));
const cat = (r, key) => r.categories.find((c) => c.key === key);
const problems = (c) => c.issues.map((i) => i.problem).join('\n');
const seoIssues = (f) => problems(cat(buildReport('https://r.example/', { ...facts, ...f }, null, NOW), 'seo'));
const designIssues = (f, p = null) => problems(cat(buildReport('https://r.example/', { ...facts, ...f }, p, NOW), 'design'));

test('scores categories and total, in order', () => {
  const r = buildReport('https://rivera.example/', facts, psi, NOW, RANK);
  expect(r.categories.map((c) => c.key)).toEqual(['design', 'seo', 'rankings', 'speed', 'cta']);
  expect(scores(r)).toEqual({ design: 90, seo: 75, rankings: 34, speed: 42, cta: 66 });
  expect(r.score).toBe(Math.round((90 + 75 + 34 + 42 + 66) / 5));
  expect(r.verdict).toBe('Your website is holding you back.');
  expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(r.url).toBe('https://rivera.example/');
  expect(r.checkedAt).toBe(NOW.toISOString());
});
test('speed issue uses seconds', () => {
  const speed = cat(buildReport('https://r.example/', facts, psi), 'speed');
  expect(speed.issues[0].problem).toMatch('6.2 seconds');
});
test('no PSI marks speed unavailable and scores the rest', () => {
  const r = buildReport('https://r.example/', facts, null, NOW);
  const speed = cat(r, 'speed');
  expect(speed).toMatchObject({ score: null, status: 'unavailable' });
  expect(speed.issues[0].problem).toMatch("Couldn't measure right now");
  expect(r.score).toBe(Math.round((100 + 70 + 66) / 3));
});
test('no facts but PSI: cta unavailable, others PSI-only', () => {
  const r = buildReport('https://r.example/', null, psi, NOW, { status: 'no-trade' });
  expect(scores(r)).toEqual({ design: 80, seo: 80, rankings: null, speed: 42, cta: null });
  const cta = cat(r, 'cta');
  expect(cta.status).toBe('unavailable');
  expect(cta.issues[0].problem).toMatch("couldn't read your homepage");
  expect(r.score).toBe(Math.round((42 + 80 + 80) / 3));
});
test('nothing reachable', () => {
  expect(buildReport('https://x.example/', null, null)).toMatchObject({ score: null, verdict: "We couldn't reach that website.", categories: [], pitch: { points: [] } });
});
test('never promises rankings', () => {
  const awful = { ...facts, title: '', titleLength: 0, description: '', h1Count: 0, indexable: false, viewport: false, https: false, copyrightYear: 2020, telLinks: 0, actionButton: false, canonical: false, favicon: false, datedMarkup: true, imagesWithAlt: 0, robotsTxt: false, sitemap: false };
  const audits = { 'uses-responsive-images': { score: 0 }, 'modern-image-formats': { score: 0 }, 'font-size': { score: 0 }, 'tap-targets': { score: 0 } };
  for (const rank of [RANK, { status: 'no-city' }, { status: 'no-trade' }, { status: 'failed' }]) {
    const r = buildReport('https://r.example/', awful, { ...psi, audits }, NOW, rank);
    const issues = r.categories.flatMap((c) => c.issues).filter((i) => i.problem !== NO_CITY);
    const copy = JSON.stringify([r.verdict, r.pitch, r.categories.map((c) => c.title), issues]);
    expect(copy).not.toMatch(/rank|#1|top of google/i);
  }
});
test('floors at 0 and caps issues at 4', () => {
  const bad = { ...facts, title: '', titleLength: 0, description: '', h1Count: 0, jsonLdTypes: [], indexable: false, canonical: false, imagesWithAlt: 0, robotsTxt: false, sitemap: false };
  const g = cat(buildReport('https://r.example/', bad, { ...psi, seo: 0 }), 'seo');
  expect(g.score).toBe(0);
  expect(g.issues.length).toBeLessThanOrEqual(4);
});
test('LocalBusiness subtype counts and old copyright fails', () => {
  const f = { ...facts, description: 'x'.repeat(80), descriptionLength: 80, jsonLdTypes: ['Plumber', 'LocalBusiness'], copyrightYear: 2024 };
  const r = buildReport('https://r.example/', f, null, NOW);
  expect(scores(r).seo).toBe(100);
  expect(scores(r).design).toBe(90);
});

describe('deeper SEO and design checks', () => {
  test('title must be 30 to 65 characters', () => {
    expect(seoIssues({ title: 'x'.repeat(25), titleLength: 25 })).toMatch(/title is too short/);
    expect(seoIssues({ title: 'x'.repeat(40), titleLength: 40 })).not.toMatch(/title/i);
    expect(seoIssues({ title: 'x'.repeat(70), titleLength: 70 })).toMatch(/title is too long/);
    expect(seoIssues({ title: '', titleLength: 0 })).toMatch(/no title/);
  });
  test('description must be 70 to 160 characters', () => {
    expect(seoIssues({ description: 'x'.repeat(50), descriptionLength: 50 })).toMatch(/description is too short/);
    expect(seoIssues({ description: 'x'.repeat(100), descriptionLength: 100 })).not.toMatch(/description/);
  });
  test('alt text on at least 80% of images', () => {
    expect(seoIssues({ images: 5, imagesWithAlt: 3 })).toMatch(/images have no description/);
    expect(seoIssues({ images: 5, imagesWithAlt: 4 })).not.toMatch(/images have no description/);
    expect(seoIssues({ images: 0, imagesWithAlt: 0 })).not.toMatch(/images have no description/);
  });
  test('canonical, robots.txt and sitemap', () => {
    expect(seoIssues({ canonical: false })).toMatch(/main address/);
    expect(seoIssues({ robotsTxt: false })).toMatch(/robots\.txt/);
    expect(seoIssues({ sitemap: false })).toMatch(/sitemap/);
    expect(seoIssues({ robotsTxt: null, sitemap: null })).not.toMatch(/robots\.txt|sitemap/);
  });
  test('favicon, dated markup and PageSpeed image and text audits', () => {
    expect(designIssues({ favicon: false })).toMatch(/small icon/);
    expect(designIssues({ datedMarkup: true })).toMatch(/old-fashioned code/);
    const audits = { 'uses-responsive-images': { score: 0.3 }, 'modern-image-formats': { score: 0.5 }, 'font-size': { score: 0 }, 'tap-targets': { score: 0.6 } };
    const r = buildReport('https://r.example/', facts, { ...psi, audits }, NOW);
    expect(cat(r, 'design').issues.length).toBe(4);
    expect(cat(r, 'design').score).toBe(Math.round((80 + 80) / 2));
    expect(designIssues({}, { ...psi, audits: { 'font-size': { score: 0 } } })).toMatch(/text is too small/);
  });
});

describe('rankings category', () => {
  test('score is the average of the per-search points', () => {
    const c = cat(buildReport('https://r.example/', facts, psi, NOW, RANK), 'rankings');
    expect(c).toMatchObject({ score: 34, status: 'ok', title: 'Found on Google', depth: 10 });
    expect(c.results).toEqual(RANK.results);
  });
  test('Maps presence adds 10, capped at 100', () => {
    const maps = { status: 'ok', results: RANK.results.map((x, i) => ({ ...x, inMaps: i === 3 })) };
    expect(cat(buildReport('https://r.example/', facts, psi, NOW, maps), 'rankings').score).toBe(44);
    const top = { status: 'ok', results: RANK.results.map((x) => ({ ...x, position: 1, inMaps: true })) };
    const c = cat(buildReport('https://r.example/', facts, psi, NOW, top), 'rankings');
    expect(c.score).toBe(100);
    expect(c.issues).toEqual([]);
  });
  test('issues are plain words, without positions', () => {
    const c = cat(buildReport('https://r.example/', facts, psi, NOW, RANK), 'rankings');
    expect(c.issues[0]).toEqual({ problem: "You're not on Google's first page for 'plumber in Austin TX', where most people click.", fix: 'We build pages for the searches your customers use, so you get found on Google.' });
    expect(JSON.stringify(c.issues)).not.toMatch(/#\d/);
    expect(problems(c)).toMatch(/Google Maps/);
  });
  test('unavailable reasons', () => {
    const c = (status) => cat(buildReport('https://r.example/', facts, psi, NOW, { status }), 'rankings');
    expect(c('no-city')).toMatchObject({ score: null, status: 'unavailable', reason: 'no-city', results: [], depth: 10 });
    expect(c('no-city').issues[0].problem).toBe(NO_CITY);
    expect(c('failed').issues[0].problem).toBe(NO_CITY);
    expect(c('no-trade').issues[0].problem).toBe("We couldn't tell what your business does.");
    expect(cat(buildReport('https://r.example/', facts, psi, NOW), 'rankings').reason).toBe('failed');
  });
});

describe('pitch', () => {
  test('first issue from each of the three lowest-scoring available categories', () => {
    const r = buildReport('https://r.example/', facts, psi, NOW, RANK);
    expect(r.pitch.headline).toBe("Here's what's costing you customers");
    expect(r.pitch.points).toEqual([cat(r, 'rankings').issues[0], cat(r, 'speed').issues[0], cat(r, 'cta').issues[0]]);
    expect(JSON.stringify(r.pitch)).not.toMatch(/rank|#1|top of google/i);
  });
  test('skips unavailable categories and ones with nothing to fix', () => {
    const fine = { ...facts, forms: 1, description: 'x'.repeat(80), descriptionLength: 80, jsonLdTypes: ['Plumber'] };
    expect(buildReport('https://r.example/', fine, null, NOW, { status: 'no-city' }).pitch.points).toEqual([]);
    const r = buildReport('https://r.example/', { ...fine, favicon: false }, null, NOW, { status: 'no-city' });
    expect(r.pitch.points).toEqual([cat(r, 'design').issues[0]]);
  });
});

test('verdict boundaries', () => {
  expect(verdictFor(49)).toBe('Your website is costing you customers.');
  expect(verdictFor(50)).toBe('Your website is holding you back.');
  expect(verdictFor(79)).toBe('Your website is holding you back.');
  expect(verdictFor(80)).toBe("A solid start. Here's what's left.");
});

describe('runPsi', () => {
  const body = { lighthouseResult: {
    categories: { performance: { score: 0.42 }, seo: { score: 0.8 }, accessibility: { score: 0.7 }, 'best-practices': { score: 0.9 } },
    audits: { 'largest-contentful-paint': { numericValue: 6200, score: 0.1, title: 'LCP' }, 'good-one': { score: 1, title: 'Fine' }, 'img-alt': { score: 0.5, title: 'Alt text' } },
  } };
  test('maps PSI json', async () => {
    let called;
    const f = async (u) => { called = String(u); return new Response(JSON.stringify(body), { status: 200 }); };
    const r = await runPsi(new URL('https://r.example/'), { PSI_API_KEY: 'k' }, f);
    expect(r).toMatchObject({ performance: 42, seo: 80, accessibility: 70, bestPractices: 90, lcpMs: 6200 });
    expect(Object.keys(r.audits).sort()).toEqual(['img-alt', 'largest-contentful-paint']);
    expect(r.audits['img-alt']).toEqual({ score: 0.5, title: 'Alt text' });
    expect(called).toContain('strategy=mobile');
    expect(called).toContain('key=k');
  });
  test('null on error or non-OK', async () => {
    expect(await runPsi(new URL('https://r.example/'), {}, async () => { throw new Error('x'); })).toBeNull();
    expect(await runPsi(new URL('https://r.example/'), {}, async () => new Response('no', { status: 500 }))).toBeNull();
  });
});
