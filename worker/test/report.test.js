import { describe, expect, test } from 'vitest';
import { buildReport } from '../src/report.js';
import { runPsi } from '../src/psi.js';

const psi = { performance: 42, seo: 80, accessibility: 70, bestPractices: 90, lcpMs: 6200, audits: {} };
const facts = { title: 'Rivera', description: '', viewport: true, https: true, indexable: true, h1Count: 1, telLinks: 2, forms: 0, actionButton: true, jsonLdTypes: [], copyrightYear: 2026 };
const scores = (r) => Object.fromEntries(r.categories.map((c) => [c.key, c.score]));

test('scores categories and total', () => {
  const r = buildReport('https://rivera.example/', facts, psi, new Date('2026-10-28'));
  expect(scores(r)).toEqual({ speed: 42, google: 70, design: 90, cta: 66 });
  expect(r.score).toBe(67);
  expect(r.verdict).toBe('Your website is holding you back.');
  expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(r.url).toBe('https://rivera.example/');
});
test('speed issue uses seconds', () => {
  const speed = buildReport('https://r.example/', facts, psi).categories.find((c) => c.key === 'speed');
  expect(speed.issues[0].problem).toMatch('6.2 seconds');
});
test('no PSI marks speed unavailable and scores the rest', () => {
  const r = buildReport('https://r.example/', facts, null, new Date('2026-10-28'));
  const speed = r.categories.find((c) => c.key === 'speed');
  expect(speed).toMatchObject({ score: null, status: 'unavailable' });
  expect(speed.issues[0].problem).toMatch("Couldn't measure right now");
  expect(r.score).toBe(Math.round((60 + 100 + 66) / 3));
});
test('no facts but PSI: cta unavailable, others PSI-only', () => {
  const r = buildReport('https://r.example/', null, psi);
  expect(scores(r)).toEqual({ speed: 42, google: 80, design: 80, cta: null });
  const cta = r.categories.find((c) => c.key === 'cta');
  expect(cta.status).toBe('unavailable');
  expect(cta.issues[0].problem).toMatch("couldn't read your homepage");
  expect(r.score).toBe(Math.round((42 + 80 + 80) / 3));
});
test('nothing reachable', () => {
  expect(buildReport('https://x.example/', null, null)).toMatchObject({ score: null, verdict: "We couldn't reach that website." });
});
test('never promises rankings', () => {
  const all = JSON.stringify(buildReport('https://r.example/', { ...facts, title: '', description: '', h1Count: 0, indexable: false, viewport: false, https: false, copyrightYear: 2020, telLinks: 0, actionButton: false }, psi, new Date('2026-10-28')));
  expect(all).not.toMatch(/rank|#1|top of google/i);
});
test('floors at 0 and caps issues at 4', () => {
  const bad = { ...facts, title: '', description: '', h1Count: 0, jsonLdTypes: [], indexable: false };
  const g = buildReport('https://r.example/', bad, { ...psi, seo: 0 }).categories.find((c) => c.key === 'google');
  expect(g.score).toBe(0);
  expect(g.issues.length).toBeLessThanOrEqual(4);
});
test('LocalBusiness subtype counts and old copyright fails', () => {
  const f = { ...facts, description: 'x', jsonLdTypes: ['Plumber', 'LocalBusiness'], copyrightYear: 2024 };
  const r = buildReport('https://r.example/', f, null, new Date('2026-10-28'));
  expect(scores(r).google).toBe(100);
  expect(scores(r).design).toBe(66);
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
