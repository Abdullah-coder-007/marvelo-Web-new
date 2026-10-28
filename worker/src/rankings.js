const ENDPOINT = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';
const TIMEOUT_MS = 30_000;

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const BY_NAME = Object.fromEntries(Object.entries(STATES).map(([abbr, name]) => [name.toLowerCase(), abbr]));
const CITY_RE = /^[A-Za-z][A-Za-z .'-]{0,59}$/;

function stateOf(s) {
  const t = s.trim().replace(/\.$/, '');
  if (STATES[t.toUpperCase()]) return t.toUpperCase();
  return BY_NAME[t.toLowerCase()] ?? null;
}

// "Columbus, OH", "Newark, New Jersey", "Columbus OH" -> { city, state, stateName }; US only.
export function parseCity(input) {
  if (typeof input !== 'string') return null;
  const s = input.replace(/\s+/g, ' ').trim().replace(/,?\s*(USA|US|United States)$/i, '');
  if (!s || s.length > 100) return null;
  let city = null;
  let state = null;
  const comma = s.lastIndexOf(',');
  if (comma !== -1) {
    city = s.slice(0, comma).trim();
    state = stateOf(s.slice(comma + 1));
  } else {
    // No comma: the state is the last word, or the last words of a full state name.
    const words = s.split(' ');
    for (let n = Math.min(3, words.length - 1); n >= 1 && !state; n--) {
      state = stateOf(words.slice(-n).join(' '));
      if (state) city = words.slice(0, -n).join(' ');
    }
  }
  if (!state || !city || !CITY_RE.test(city)) return null;
  return { city, state, stateName: STATES[state] };
}

const LD_TRADES = {
  dentist: 'dentist', plumber: 'plumber', roofingcontractor: 'roofer', hvacbusiness: 'HVAC company',
  attorney: 'lawyer', legalservice: 'lawyer', realestateagent: 'real estate agent', hairsalon: 'hair salon',
  beautysalon: 'hair salon', medicalclinic: 'clinic', locksmith: 'locksmith', electrician: 'electrician',
};
const WORD_TRADES = [
  [/\bdent(al|ist)/i, 'dentist'],
  [/\bplumb/i, 'plumber'],
  [/\broof/i, 'roofer'],
  [/\bhvac\b|\bheating\b|\bair conditioning\b/i, 'HVAC company'],
  [/\bmed ?spa\b/i, 'med spa'],
  [/\battorney|\blaw\b|\blawyer/i, 'lawyer'],
  [/\breal estate\b/i, 'real estate agent'],
  [/\bsalon\b/i, 'hair salon'],
  [/\blocksmith/i, 'locksmith'],
  [/\belectric(al|ian)\b/i, 'electrician'],
  [/\bclinic\b/i, 'clinic'],
];

export function detectTrade(facts) {
  if (!facts) return null;
  for (const t of facts.jsonLdTypes || []) {
    const hit = LD_TRADES[String(t).toLowerCase()];
    if (hit) return hit;
  }
  const words = `${facts.title || ''} ${facts.h1 || ''}`;
  for (const [re, trade] of WORD_TRADES) if (re.test(words)) return trade;
  return null;
}

const EMERGENCY = new Set(['dentist', 'plumber', 'roofer', 'HVAC company', 'locksmith']);

export function buildKeywords(trade, loc) {
  return [
    `${trade} near me`,
    `best ${trade} near me`,
    `${trade} in ${loc.city} ${loc.state}`,
    `${trade} ${loc.city}`,
    `${EMERGENCY.has(trade) ? 'emergency' : 'affordable'} ${trade} near me`,
  ];
}

const bare = (d) => String(d || '').toLowerCase().replace(/\.$/, '').replace(/^www\./, '');

async function oneSearch(keyword, locationName, auth, fetchImpl) {
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify([{ keyword, location_name: locationName, language_code: 'en', device: 'mobile', depth: 100 }]),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status !== 200) throw new Error(`dataforseo-${res.status}`);
  const task = (await res.json())?.tasks?.[0];
  if (task?.status_code !== 20000) throw new Error(`dataforseo-task-${task?.status_code}`);
  return task.result?.[0]?.items || [];
}

// One task per call, five calls in parallel. Any failure fails the whole check (returns null). Never throws.
export async function runRankings(domain, trade, loc, env, fetchImpl = fetch) {
  try {
    const mine = bare(domain);
    const auth = `Basic ${btoa(`${env.DATAFORSEO_LOGIN ?? ''}:${env.DATAFORSEO_PASSWORD ?? ''}`)}`;
    const locationName = `${loc.city},${loc.stateName},United States`;
    const keywords = buildKeywords(trade, loc);
    const all = await Promise.all(keywords.map((k) => oneSearch(k, locationName, auth, fetchImpl)));
    const results = keywords.map((keyword, i) => {
      const items = all[i];
      const hit = items.find((it) => it?.type === 'organic' && bare(it.domain) === mine);
      const inMaps = items.some((it) => it?.type === 'local_pack' && it.domain && bare(it.domain) === mine);
      return { keyword, position: hit && Number.isFinite(hit.rank_group) ? hit.rank_group : null, inMaps };
    });
    return { results };
  } catch {
    return null;
  }
}
