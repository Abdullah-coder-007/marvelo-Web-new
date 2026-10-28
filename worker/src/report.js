const MAX_ISSUES = 4;
const LOCAL_TYPE = /LocalBusiness|Plumber|Electrician|Dentist|Restaurant|Store|Contractor|Salon|Attorney|Physician|AutoRepair|HomeAndConstructionBusiness/i;

const clamp = (n) => Math.max(0, Math.min(100, n));
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function verdictFor(score) {
  if (score >= 85) return 'Your website is in great shape.';
  if (score >= 70) return 'Your website is doing okay, but it could win you more customers.';
  return 'Your website is holding you back.';
}

// Each check: [failed?, points, problem, fix]
function runChecks(checks) {
  let own = 100;
  const issues = [];
  for (const [failed, pts, problem, fix] of checks) {
    if (!failed) continue;
    own -= pts;
    issues.push({ problem, fix });
  }
  return { own: clamp(own), issues };
}

const noFacts = (what) => [{ problem: "We couldn't read your homepage to check this.", fix: `We take a look at your ${what} when we build your new site.` }];

function speedCategory(psi) {
  const base = { key: 'speed', title: 'Speed on phones' };
  if (!psi) return { ...base, score: null, status: 'unavailable', issues: [{ problem: "Couldn't measure right now", fix: 'Try again in a few minutes.' }] };
  const issues = [];
  if (psi.performance < 90) {
    const secs = psi.lcpMs ? `${(psi.lcpMs / 1000).toFixed(1)} seconds` : null;
    issues.push({
      problem: secs ? `Takes ${secs} to show on a phone. Most visitors leave after 3.` : 'Loads slowly on a phone. Most visitors leave after 3 seconds.',
      fix: 'We rebuild it to load in under 2 seconds.',
    });
  }
  return { ...base, score: psi.performance, status: 'ok', issues };
}

function googleCategory(facts, psi) {
  const base = { key: 'google', title: 'Found on Google' };
  if (!facts && !psi) return { ...base, score: null, status: 'unavailable', issues: noFacts('Google basics') };
  let own = null;
  let issues = [];
  if (facts) {
    ({ own, issues } = runChecks([
      [!facts.title, 20, "Your page has no title, so Google shows a blank headline for you.", 'We write a clear title with your trade and your town.'],
      [!facts.description, 20, 'Your page has no short description under its name in search results.', 'We write one that makes people want to call you.'],
      [facts.h1Count !== 1, 20, facts.h1Count === 0 ? 'Your page has no main heading, so Google cannot tell what you do.' : 'Your page has more than one main heading, which muddles what you do.', 'We give each page one clear heading that says what you do.'],
      [!facts.jsonLdTypes.some((t) => LOCAL_TYPE.test(t)), 20, "Google doesn't know you are a local business with an address and hours.", 'We add the hidden details that tell Google who you are and where you work.'],
      [!facts.indexable, 20, 'Your page is telling Google to stay away.', 'We switch that off so customers can find you.'],
    ]));
  }
  const score = psi && own !== null ? Math.round((psi.seo + own) / 2) : psi ? psi.seo : own;
  return { ...base, score, status: 'ok', issues: issues.slice(0, MAX_ISSUES) };
}

function designCategory(facts, psi, now) {
  const base = { key: 'design', title: 'Look and trust' };
  if (!facts && !psi) return { ...base, score: null, status: 'unavailable', issues: noFacts('design') };
  let own = null;
  let issues = [];
  if (facts) {
    ({ own, issues } = runChecks([
      [!facts.viewport, 34, "Your site isn't set up for phones, so people have to pinch and zoom.", 'We build it to fit every screen.'],
      [!facts.https, 34, 'Browsers warn visitors that your site is "not secure".', 'We set up the secure padlock so visitors trust you.'],
      [facts.copyrightYear != null && facts.copyrightYear <= now.getFullYear() - 2, 34, `Your footer still says ${facts.copyrightYear}, which makes the site look forgotten.`, 'We keep it fresh so you look open for business.'],
    ]));
  }
  const psiPart = psi ? avg([psi.accessibility, psi.bestPractices]) : null;
  const score = psi && own !== null ? Math.round((psiPart + own) / 2) : psi ? Math.round(psiPart) : own;
  return { ...base, score, status: 'ok', issues: issues.slice(0, MAX_ISSUES) };
}

function ctaCategory(facts) {
  const base = { key: 'cta', title: 'Getting customers to call' };
  if (!facts) return { ...base, score: null, status: 'unavailable', issues: noFacts('call-to-action buttons') };
  const { own, issues } = runChecks([
    [!facts.telLinks, 34, "Visitors can't tap your phone number to call you.", 'We add a tap-to-call button on every page.'],
    [!facts.forms, 34, 'There is no form for customers to ask for a quote.', 'We add a short enquiry form that lands in your inbox.'],
    [!facts.actionButton, 34, 'Nothing on the page clearly says "Book" or "Get a quote".', 'We add a bold button that tells visitors what to do next.'],
  ]);
  return { ...base, score: own, status: 'ok', issues: issues.slice(0, MAX_ISSUES) };
}

export function buildReport(url, facts, psi, now = new Date()) {
  const id = crypto.randomUUID();
  if (!facts && !psi) return { id, url, score: null, verdict: "We couldn't reach that website.", categories: [] };
  const categories = [speedCategory(psi), googleCategory(facts, psi), designCategory(facts, psi, now), ctaCategory(facts)];
  const scored = categories.filter((c) => c.score !== null).map((c) => c.score);
  const score = Math.round(avg(scored));
  return { id, url, score, verdict: verdictFor(score), categories };
}
