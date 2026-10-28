import { SEARCH_DEPTH } from './rankings.js';

const MAX_ISSUES = 4;
// Any schema.org type that is a kind of local business: a suffix match plus an explicit list (case-insensitive).
const LOCAL_TYPE = /(Business|Service|Store|Contractor|Clinic|Office|Agency|Restaurant|Salon)$|^(Plumber|Electrician|Dentist|Locksmith|HousePainter|MovingCompany|Florist|VeterinaryCare|Attorney|Physician|AutoRepair|RoofingContractor|GeneralContractor|Notary|Optician|Pharmacy|Hospital|Bakery|Dermatology|Gym|SportsClub|DaySpa|Winery|Library|TravelAgency|InsuranceAgency|RealEstateAgent|Accountant|AutoDealer|BarOrPub|CafeOrCoffeeShop|Hotel|Motel|Resort|ChildCare|Church|Campground|Physiotherapy|MedicalBusiness|AutomotiveBusiness|TattooParlor|HairSalon|NailSalon|HealthClub)$/i;
const PITCH_HEADLINE = "Here's what's costing you customers";

const clamp = (n) => Math.max(0, Math.min(100, n));
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const len = (n, s) => (typeof n === 'number' ? n : String(s || '').length);

export function verdictFor(score) {
  if (score < 50) return "Your website is costing you customers.";
  if (score < 80) return "Your website is holding you back.";
  return "A solid start. Here's what's left.";
}

// Each check: [failed?, points, problem, fix]. A category's own score starts at 100, loses the
// points of each failed check and floors at 0. Issues keep the order of the checks.
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

function titleProblem(n) {
  if (n === 0) return 'Your page has no title, so Google shows a blank headline for you.';
  return n < 30 ? 'Your page title is too short to tell Google what you do and where.' : 'Your page title is too long, so Google cuts it off.';
}
function descriptionProblem(n) {
  if (n === 0) return 'Your page has no short description under its name in search results.';
  return n < 70 ? 'Your page description is too short to make people want to click.' : 'Your page description is too long, so Google cuts it off.';
}

// SEO points (sum 100): indexable 15, title 30-65 chars 15, description 70-160 chars 15,
// exactly one h1 10, LocalBusiness-type JSON-LD 15, canonical 10, alt text on >= 80% of images 10,
// /robots.txt 5, /sitemap.xml 5. robots/sitemap only fail when known to be missing (false, not null).
// Score = mean of this own score and PageSpeed's SEO score, or whichever one exists.
function seoCategory(facts, psi) {
  const base = { key: 'seo', title: 'Google basics' };
  if (!facts && !psi) return { ...base, score: null, status: 'unavailable', issues: noFacts('Google basics') };
  let own = null;
  let issues = [];
  if (facts) {
    const t = len(facts.titleLength, facts.title);
    const d = len(facts.descriptionLength, facts.description);
    const images = facts.images || 0;
    ({ own, issues } = runChecks([
      [!facts.indexable, 15, 'Your page is telling Google to stay away.', 'We switch that off so customers can find you.'],
      [t < 30 || t > 65, 15, titleProblem(t), 'We write a clear title with your trade and your town.'],
      [d < 70 || d > 160, 15, descriptionProblem(d), 'We write one that makes people want to call you.'],
      [facts.h1Count !== 1, 10, facts.h1Count === 0 ? 'Your page has no main heading, so Google cannot tell what you do.' : 'Your page has more than one main heading, which muddles what you do.', 'We give each page one clear heading that says what you do.'],
      [!(facts.jsonLdTypes || []).some((x) => LOCAL_TYPE.test(x)), 15, "Google doesn't know you are a local business with an address and hours.", 'We add the hidden details that tell Google who you are and where you work.'],
      [!facts.canonical, 10, "Your page doesn't tell Google its main address, so it can show up twice and split your visits.", 'We give every page one main address.'],
      [images > 0 && (facts.imagesWithAlt || 0) / images < 0.8, 10, "Most of your images have no description, so Google can't tell what they show.", 'We describe every image so Google understands your work.'],
      [facts.robotsTxt === false, 5, "Your site has no robots.txt file, which tells Google which pages to read.", 'We set it up so Google reads the right pages.'],
      [facts.sitemap === false, 5, 'Your site has no sitemap, the list Google uses to find all your pages.', 'We add a sitemap so every page gets found on Google.'],
    ]));
  }
  const score = psi && own !== null ? Math.round((psi.seo + own) / 2) : psi ? psi.seo : own;
  return { ...base, score, status: 'ok', issues: issues.slice(0, MAX_ISSUES) };
}

// Design points from the page (sum 80): viewport 20, HTTPS 20, dated markup 20, copyright year
// 2+ years old 10, favicon 10. From PageSpeed audits (sum 20, only when PageSpeed ran):
// oversized images 5, old image formats 5, small text 5, cramped tap targets 5.
// Score = mean of this own score and the PageSpeed accessibility/best-practices average.
// Without page facts the score is the PageSpeed part alone.
const DESIGN_AUDITS = [
  ['uses-responsive-images', 'Your images are bigger than they need to be, which slows the page.', 'We resize every image to fit the screen.'],
  ['modern-image-formats', 'Your images use old formats that load slowly.', 'We switch them to modern formats that load fast.'],
  ['font-size', 'Some text is too small to read on a phone.', 'We use clear text sizes that are easy to read.'],
  ['tap-targets', 'Buttons and links are too close together to tap easily.', 'We give every button room so it is easy to tap.'],
];

function designCategory(facts, psi, now) {
  const base = { key: 'design', title: 'Look and trust' };
  if (!facts && !psi) return { ...base, score: null, status: 'unavailable', issues: noFacts('design') };
  const checks = [];
  if (facts) {
    checks.push(
      [!facts.viewport, 20, "Your site isn't set up for phones, so people have to pinch and zoom.", 'We build it to fit every screen.'],
      [!facts.https, 20, 'Browsers warn visitors that your site is "not secure".', 'We set up the secure padlock so visitors trust you.'],
      [!!facts.datedMarkup, 20, 'Your site is built with old-fashioned code that looks dated and breaks on phones.', 'We rebuild it with modern, clean code.'],
      [facts.copyrightYear != null && facts.copyrightYear <= now.getFullYear() - 2, 10, `Your footer still says ${facts.copyrightYear}, which makes the site look forgotten.`, 'We keep it fresh so you look open for business.'],
      [!facts.favicon, 10, 'Your site has no small icon in the browser tab, so it looks unfinished.', 'We add your logo as the tab icon.'],
    );
  }
  if (psi) for (const [id, problem, fix] of DESIGN_AUDITS) checks.push([!!psi.audits?.[id], 5, problem, fix]);
  const { own, issues } = runChecks(checks);
  const ownScore = facts ? own : null;
  const psiPart = psi ? avg([psi.accessibility, psi.bestPractices]) : null;
  const score = psi && ownScore !== null ? Math.round((psiPart + ownScore) / 2) : psi ? Math.round(psiPart) : ownScore;
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

// Points per search: positions 1-3: 100, 4-10: 70, beyond SEARCH_DEPTH or not found (null): 0.
const searchPoints = (p) => (p == null || p > SEARCH_DEPTH ? 0 : p <= 3 ? 100 : 70);
const FOUND_FIX = 'We build pages for the searches your customers use, so you get found on Google.';

function rankingsCategory(rank) {
  const base = { key: 'rankings', title: 'Found on Google', depth: SEARCH_DEPTH };
  const results = rank?.status === 'ok' && Array.isArray(rank.results) ? rank.results : [];
  if (!results.length) {
    const reason = rank?.status === 'no-city' || rank?.status === 'no-trade' ? rank.status : 'failed';
    const problem = reason === 'no-trade' ? "We couldn't tell what your business does." : "We couldn't check rankings for that city.";
    return { ...base, score: null, status: 'unavailable', reason, results: [], issues: [{ problem, fix: 'We research the searches your customers use when we build your new site.' }] };
  }
  const inMaps = results.some((r) => r.inMaps);
  const score = Math.min(100, Math.round(avg(results.map((r) => searchPoints(r.position)))) + (inMaps ? 10 : 0));
  const words = results.filter((r) => r.position == null || r.position > SEARCH_DEPTH)
    .map((r) => ({ problem: `You're not on Google's first page for '${r.keyword}', where most people click.`, fix: FOUND_FIX }));
  const issues = inMaps
    ? words.slice(0, MAX_ISSUES)
    : [...words.slice(0, MAX_ISSUES - 1), { problem: "You don't show up in the Google Maps results for these searches.", fix: 'We set up your local business details so you get found on Google Maps.' }];
  return { ...base, score, status: 'ok', results, issues };
}

// The first issue from each of the three lowest-scoring categories that have a score and an issue.
function buildPitch(categories) {
  const points = categories
    .filter((c) => c.score !== null && c.issues.length)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((c) => ({ problem: c.issues[0].problem, fix: c.issues[0].fix }));
  return { headline: PITCH_HEADLINE, points };
}

export function buildReport(url, facts, psi, now = new Date(), rank = null) {
  const id = crypto.randomUUID();
  const checkedAt = now.toISOString();
  if (!facts && !psi) {
    return { id, url, checkedAt, score: null, verdict: "We couldn't reach that website.", categories: [], pitch: { headline: PITCH_HEADLINE, points: [] } };
  }
  const categories = [designCategory(facts, psi, now), seoCategory(facts, psi), rankingsCategory(rank), speedCategory(psi), ctaCategory(facts)];
  const scored = categories.filter((c) => c.score !== null).map((c) => c.score);
  const score = Math.round(avg(scored));
  return { id, url, checkedAt, score, verdict: verdictFor(score), categories, pitch: buildPitch(categories) };
}
