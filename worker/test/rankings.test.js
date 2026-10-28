import { test, expect } from 'vitest';
import { vi } from 'vitest';
import { detectTrade, parseCity, buildKeywords, runRankings, SEARCH_DEPTH, SEARCHES_PER_CHECK } from '../src/rankings.js';

const ENV = { DATAFORSEO_LOGIN: 'me@test.example', DATAFORSEO_PASSWORD: 'pw' };
const LOC = { city: 'Columbus', state: 'OH', stateName: 'Ohio' };
const facts = (over) => ({ title: '', h1: '', jsonLdTypes: [], ...over });
const ok = (items) => Response.json({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items }] }] });

test('parseCity', () => {
  expect(parseCity('Columbus, OH')).toEqual({ city: 'Columbus', state: 'OH', stateName: 'Ohio' });
  expect(parseCity('Newark, New Jersey').state).toBe('NJ');
  expect(parseCity('Paris')).toBeNull();
  expect(parseCity('  austin,   tx ')).toEqual({ city: 'austin', state: 'TX', stateName: 'Texas' });
  expect(parseCity('Columbus OH')).toEqual({ city: 'Columbus', state: 'OH', stateName: 'Ohio' });
  expect(parseCity('Paris, France')).toBeNull();
  expect(parseCity('')).toBeNull();
  expect(parseCity(null)).toBeNull();
  expect(parseCity('<b>x</b>, OH')).toBeNull();
});

test('detectTrade', () => {
  expect(detectTrade(facts({ jsonLdTypes: ['Dentist'] }))).toBe('dentist');
  expect(detectTrade(facts({ title: 'Rivera Plumbing | Austin' }))).toBe('plumber');
  expect(detectTrade(facts({ title: 'Welcome', h1: 'Hello there' }))).toBeNull();
  expect(detectTrade(null)).toBeNull();
  expect(detectTrade(facts({ h1: 'Heating and cooling you can trust' }))).toBe('HVAC company');
  expect(detectTrade(facts({ title: 'Smith Law Office' }))).toBe('lawyer');
  expect(detectTrade(facts({ title: 'Green Lawn Care' }))).toBeNull();
  expect(detectTrade(facts({ jsonLdTypes: ['LocalBusiness'], title: 'Glow Med Spa' }))).toBe('med spa');
});

test('buildKeywords', () => {
  expect(buildKeywords('dentist', { city: 'Columbus', state: 'OH' })).toEqual(['dentist near me', 'best dentist near me', 'dentist in Columbus OH', 'dentist Columbus', 'emergency dentist near me']);
  expect(buildKeywords('hair salon', { city: 'Columbus', state: 'OH' })[4]).toBe('affordable hair salon near me');
});

test('runRankings posts to the live advanced endpoint and reads positions', async () => {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const [task] = JSON.parse(init.body);
    if (task.keyword === 'dentist near me') {
      return ok([
        { type: 'local_pack', domain: 'rivera.com' },
        { type: 'organic', rank_group: 1, domain: 'other.com' },
        { type: 'organic', rank_group: 4, domain: 'www.rivera.com' },
      ]);
    }
    return ok([{ type: 'local_pack' }, { type: 'organic', rank_group: 3, domain: 'other.com' }]);
  };
  const r = await runRankings('www.rivera.com', 'dentist', LOC, ENV, f);
  expect(calls.length).toBe(5);
  for (const c of calls) {
    expect(c.url).toBe('https://api.dataforseo.com/v3/serp/google/organic/live/advanced');
    expect(c.init.method).toBe('POST');
    expect(c.init.headers.authorization).toBe(`Basic ${btoa('me@test.example:pw')}`);
    const body = JSON.parse(c.init.body);
    expect(body.length).toBe(1);
    expect(body[0]).toMatchObject({ location_name: 'Columbus,Ohio,United States', language_code: 'en', device: 'mobile', depth: 10 });
  }
  expect(calls.map((c) => JSON.parse(c.init.body)[0].keyword)).toEqual(buildKeywords('dentist', LOC));
  expect(r.results[0]).toEqual({ keyword: 'dentist near me', position: 4, inMaps: true });
  expect(r.results[1]).toEqual({ keyword: 'best dentist near me', position: null, inMaps: false });
  expect(r.results.length).toBe(5);
});

test('runRankings returns null on a bad status or a thrown fetch', async () => {
  const bad = async () => Response.json({ tasks: [{ status_code: 40501, result: null }] });
  expect(await runRankings('rivera.com', 'dentist', LOC, ENV, bad)).toBeNull();
  const http = async () => new Response('no', { status: 401 });
  expect(await runRankings('rivera.com', 'dentist', LOC, ENV, http)).toBeNull();
  const boom = async () => { throw new TypeError('network'); };
  expect(await runRankings('rivera.com', 'dentist', LOC, ENV, boom)).toBeNull();
  let n = 0;
  const oneFails = async () => (n++ === 2 ? Response.json({ tasks: [{ status_code: 50000 }] }) : ok([]));
  expect(await runRankings('rivera.com', 'dentist', LOC, ENV, oneFails)).toBeNull();
});

test('one page of results per search, and the count is set in one place', () => {
  expect(SEARCH_DEPTH).toBe(10);
  expect(SEARCHES_PER_CHECK).toBe(5);
  expect(buildKeywords('dentist', LOC).length).toBe(SEARCHES_PER_CHECK);
});

test('a position beyond the search depth counts as not found', async () => {
  const f = async () => ok([{ type: 'organic', rank_group: 14, domain: 'rivera.com' }]);
  const r = await runRankings('rivera.com', 'dentist', LOC, ENV, f);
  expect(r.results.every((x) => x.position === null)).toBe(true);
});

test('location_name title-cases the city', async () => {
  let body;
  const f = async (u, init) => { body = JSON.parse(init.body)[0]; return ok([]); };
  await runRankings('rivera.com', 'dentist', parseCity('austin, tx'), ENV, f);
  expect(body.location_name).toBe('Austin,Texas,United States');
  await runRankings('rivera.com', 'dentist', parseCity("o'fallon, mo"), ENV, f);
  expect(body.location_name).toBe("O'Fallon,Missouri,United States");
});

test('failures are logged with status codes only, never credentials', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await runRankings('rivera.com', 'dentist', LOC, ENV, async () => new Response('no', { status: 401 }));
    expect(spy).toHaveBeenCalledWith('dataforseo', 401, null);
    await runRankings('rivera.com', 'dentist', LOC, ENV, async () => Response.json({ tasks: [{ status_code: 40501 }] }));
    expect(spy).toHaveBeenCalledWith('dataforseo', 200, 40501);
    await runRankings('rivera.com', 'dentist', LOC, ENV, async () => { throw new TypeError('network'); });
    expect(spy).toHaveBeenCalledWith('dataforseo', null, null);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain('pw');
    expect(logged).not.toContain('me@test.example');
    expect(logged).not.toContain(btoa('me@test.example:pw'));
    expect(logged).not.toMatch(/Basic/);
  } finally {
    spy.mockRestore();
  }
});
