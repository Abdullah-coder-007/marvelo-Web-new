# Website Check and AI Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The redesign page checks a visitor's website (speed, Google visibility, design on phones, calls to action) and, after they leave their contact details, has Claude build a private preview that is emailed to the owner.

**Architecture:**
- One Cloudflare Worker (`worker/`) at `api.marveloweb.com`, with three routes: `POST /check`, `POST /enhance` and `GET /p/<id>`.
- An hourly cron retries failed emails and deletes leads older than 90 days.
- A single KV namespace holds leads, previews, cached reports and rate-limit counters.
- The static page on GitHub Pages calls the Worker. With no API base set, it behaves exactly as today.

**Tech Stack:**
- Cloudflare Workers (ES modules), HTMLRewriter, KV, Cron Triggers, Wrangler 3
- Vitest with `@cloudflare/vitest-pool-workers`
- Google PageSpeed Insights API v5
- Claude Messages API, Resend, Turnstile
- Front end: plain HTML, CSS and JS, as in the rest of the site

**Spec:** `docs/superpowers/specs/2026-10-28-website-check-and-ai-preview-design.md`

## Global Constraints

- **Copy:**
  - Never claim "rank #1" or "top of Google". Use "get found on Google".
  - No search positions in the report.
- **API keys** exist only as Worker secrets: `ANTHROPIC_API_KEY`, `PSI_API_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET`. Never put them in code, the repo or chat.
- **Variables:**
  - `LEAD_EMAIL_TO`
  - `ALLOWED_ORIGINS = "https://abdullah-coder-007.github.io,https://marveloweb.com"`
- **Rate limits:** 5 checks per IP per hour, and 2 enhances per IP per day.
- **Timeouts and caps:**
  - PageSpeed: 30 s
  - Homepage fetch: 10 s, at most 5 redirects, at most 2 MB
  - Report cache: 24 h
  - Lead retention: 90 days
  - Email retries: hourly, up to 24 attempts
- **Claude call:**
  - model `claude-sonnet-5-5`, endpoint `https://api.anthropic.com/v1/messages`, header `anthropic-version: 2023-06-01`
  - read the `claude-api` skill before writing this call
- **Preview content:**
  - one self-contained HTML page with inline CSS and no scripts
  - all sample content visibly labelled, e.g. "Sample review, replace with a real one"
- **Preview route:**
  - 32-character random key
  - headers: `X-Robots-Tag: noindex, nofollow`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:`, `Cache-Control: private`
- **Email:** sent from `leads@marveloweb.com`. When the preview fails, the subject is prefixed `Preview failed:`.
- **Verdicts:**
  - score below 50: "Your website is costing you customers."
  - 50 to 79: "Your website is holding you back."
  - 80 or more: "A solid start. Here's what's left."
- **Visitor copy:**
  - after Enhance: "Your custom preview is being built. We'll email it to you within 24 hours."
  - errors: "We couldn't reach that website." and "Please try again in a little while."
- **Front end:** `redesign.js` starts with `const API_BASE = '';`. While it is empty, there are no network calls and today's behaviour is kept.
- **Asset versions:** bump the `?v=` query on every CSS or JS file changed (see README).

## Review Focus

1. **A messy address** such as `"  WWW.Rivera-Plumbing.com/ "` normalises to `https://www.rivera-plumbing.com/` and hits the same cache entry as `rivera-plumbing.com`. Tested in Task 1 and Task 4.
2. **A public site that redirects to a private address** (`http://10.0.0.5/`) is refused at the redirect, not fetched. Tested in Task 2.
3. **A non-HTML or huge response** (a PDF, or a 50 MB file) stops reading at 2 MB and gives `facts = null`. The report then shows "couldn't read your page", not a crash. Tested in Task 2.
4. **Pressing "Check my website" twice quickly** sends only one request. The button is disabled while a check is running. Tested in Task 6.
5. **Claude wraps its answer in code fences or adds `<script>`.** The fences are stripped, `<script>` blocks are removed before saving, and the CSP blocks anything left. Tested in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `worker/package.json`, `worker/wrangler.toml`, `worker/vitest.config.js` | Project config: KV binding `MW`, cron `0 * * * *`, vars |
| `worker/src/index.js` | Router, CORS, the `scheduled` handler |
| `worker/src/url-guard.js` | URL normalising and the public-address check |
| `worker/src/limits.js` | Turnstile verification and KV rate limits |
| `worker/src/page-scan.js` | Safe homepage fetch and HTMLRewriter facts |
| `worker/src/psi.js` | PageSpeed call, reduced to the scores and audits we use |
| `worker/src/report.js` | Pure scoring and issue copy |
| `worker/src/preview.js` | Claude prompt, the API call and output cleaning |
| `worker/src/mail.js` | Resend email |
| `worker/src/leads.js` | `/enhance`, lead processing, `/p/<id>`, cron work |
| `worker/test/*.test.js`, `worker/test/fixtures/*.html` | Tests and sample pages |
| `redesign.html`, `redesign.css`, `redesign.js` | Report section, check flow, Turnstile, Enhance submit |
| `main.js` | One hook in the funnel submit so a page can send leads to a server |

---

### Task 0: Confirm nobody else is editing the redesign page

- [ ] **Step 1:** List the linked sessions. If the "Overview" session (`local_83650ed9-4817-49e1-b003-58e4518f2690`) is running or has uncommitted changes to `redesign.*`, ask it before touching those files. Otherwise continue.
- [ ] **Step 2:** Run `git fetch && git status` in `marvelo-Web-new`. Expected: up to date with `origin/main`.

### Task 1: Worker scaffold and URL guard

**Files:**
- Create: `worker/package.json`, `worker/wrangler.toml`, `worker/vitest.config.js`, `worker/src/url-guard.js`
- Test: `worker/test/url-guard.test.js`

**Interfaces:**
- Produces:
  - `normalizeUrl(input: string) -> URL`. Throws `GuardError` with `.code`: `'invalid' | 'scheme' | 'port' | 'private'`.
  - `assertPublicHost(url: URL, resolve?: (name, type) => Promise<string[]>) -> Promise<void>`. Throws `GuardError('private')`.
  - The default `resolve` uses DNS-over-HTTPS: `https://cloudflare-dns.com/dns-query?name=<host>&type=A|AAAA`, header `accept: application/dns-json`.

- [ ] **Step 1: Write failing tests**

```js
test('normalises messy input', () => {
  expect(normalizeUrl('  WWW.Rivera-Plumbing.com/ ').href).toBe('https://www.rivera-plumbing.com/');
  expect(normalizeUrl('rivera-plumbing.com').href).toBe('https://rivera-plumbing.com/');
});
test.each(['file:///etc/passwd', 'ftp://a.com', 'javascript:alert(1)'])('refuses scheme %s', (u) =>
  expect(() => normalizeUrl(u)).toThrow(expect.objectContaining({ code: 'scheme' })));
test('refuses non-standard port', () => expect(() => normalizeUrl('https://a.com:8080')).toThrow(expect.objectContaining({ code: 'port' })));
test.each(['localhost', '10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.1', '[::1]'])('refuses %s', async (h) => {
  await expect(assertPublicHost(new URL(`http://${h}/`), async () => [])).rejects.toMatchObject({ code: 'private' });
});
test('refuses a public name that resolves to a private IP', async () => {
  await expect(assertPublicHost(new URL('https://evil.example/'), async () => ['10.1.2.3'])).rejects.toMatchObject({ code: 'private' });
});
test('accepts a public site', async () => {
  await expect(assertPublicHost(new URL('https://example.com/'), async () => ['93.184.215.14'])).resolves.toBeUndefined();
});
```

- [ ] **Step 2:** Run `cd worker && npx vitest run test/url-guard.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `url-guard.js`.**
  - Trim and lower-case the host, then add `https://` when no scheme is given.
  - Allow ports 80 and 443 only.
  - Treat these as private: 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, ::1, fc00::/7, fe80::/10, and the names `localhost` and `*.local`.
  - Add the config files. `wrangler.toml` gets `name = "marveloweb-api"`, `main = "src/index.js"`, `compatibility_date = "2026-10-01"`, `[[kv_namespaces]] binding = "MW"`, `[triggers] crons = ["0 * * * *"]`, and the `[vars]` from Global Constraints.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `git add worker && git commit -m "Add worker scaffold and URL guard"`.

### Task 2: Safe homepage fetch and page facts

**Files:**
- Create: `worker/src/page-scan.js`
- Fixtures: `worker/test/fixtures/good.html`, `old.html`, `bare.html`
- Test: `worker/test/page-scan.test.js`

**Interfaces:**
- Consumes: `normalizeUrl` and `assertPublicHost` from Task 1.
- Produces:
  - `scanHtml(res: Response) -> Promise<PageFacts>`
  - `fetchPage(url: URL, deps?: { fetch, resolve }) -> Promise<{ facts: PageFacts|null, error: string|null }>`
  - `PageFacts = { title, description, viewport: bool, https: bool, indexable: bool, h1Count, telLinks, forms, actionButton: bool, jsonLdTypes: string[], copyrightYear: number|null, headings: string[], phone: string|null, address: string|null, text: string }`
  - `text` holds the first 4,000 characters of visible text.

- [ ] **Step 1: Write failing tests**

```js
test('good page facts', async () => {
  const f = await scanHtml(htmlResponse(fixture('good.html'), 'https://good.example/'));
  expect(f).toMatchObject({ title: 'Rivera Plumbing | Austin plumbers', viewport: true, https: true, indexable: true, h1Count: 1, actionButton: true });
  expect(f.telLinks).toBeGreaterThan(0);
  expect(f.jsonLdTypes).toContain('LocalBusiness');
});
test('old page facts', async () => {
  const f = await scanHtml(htmlResponse(fixture('old.html'), 'http://old.example/'));
  expect(f).toMatchObject({ viewport: false, https: false, telLinks: 0, copyrightYear: 2014 });
});
test('bare page has no title or description', async () => {
  const f = await scanHtml(htmlResponse(fixture('bare.html'), 'https://bare.example/'));
  expect(f.title).toBe(''); expect(f.description).toBe('');
});
test('refuses a redirect to a private address', async () => {
  const fetch = async () => new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/' } });
  const r = await fetchPage(new URL('https://pub.example/'), { fetch, resolve: async (n) => n === 'pub.example' ? ['93.184.215.14'] : [] });
  expect(r).toEqual({ facts: null, error: 'private' });
});
test('stops at 2 MB and rejects non-HTML', async () => {
  const pdf = async () => new Response(new Uint8Array(3_000_000), { headers: { 'content-type': 'application/pdf' } });
  expect(await fetchPage(new URL('https://pdf.example/'), { fetch: pdf, resolve: async () => ['93.184.215.14'] })).toEqual({ facts: null, error: 'not-html' });
});
```

- [ ] **Step 2:** Run `npx vitest run test/page-scan.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement `page-scan.js`.**
  - Use `fetch` with `redirect: 'manual'`. On every hop, run the Task 1 guard. Stop after 5 hops (error `'redirects'`).
  - Use a 10 s `AbortSignal.timeout` (error `'timeout'`).
  - Accept only `content-type` values containing `html` (error `'not-html'`).
  - Read the body stream and stop at 2,000,000 bytes.
  - Parse with HTMLRewriter.
    - `actionButton` means an `a` or `button` among the first 40 whose text matches `/\b(book|quote|call|contact|appointment|schedule|estimate)\b/i`.
    - `copyrightYear` is the largest 4-digit year after `©` or `copyright`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: "Add homepage scan".

### Task 3: PageSpeed client and report scoring

**Files:**
- Create: `worker/src/psi.js`, `worker/src/report.js`
- Test: `worker/test/report.test.js`

**Interfaces:**
- Produces:
  - `runPsi(url: URL, env, fetchImpl?) -> Promise<Psi|null>`. Returns `null` on a 30 s timeout or any error.
  - `Psi = { performance, seo, accessibility, bestPractices, lcpMs, audits: { [id]: { score, title } } }`. Scores run 0 to 100.
  - `buildReport(url: string, facts: PageFacts|null, psi: Psi|null, now = new Date()) -> Report`
  - `Report = { id, url, score, verdict, categories: [{ key: 'speed'|'google'|'design'|'cta', title, score: number|null, status: 'ok'|'unavailable', issues: [{ problem, fix }] }] }`

**Scoring.** Each own check that fails takes points off. Floor every score at 0.
- `speed = psi.performance`
- `google`:
  - own score starts at 100, minus 20 each for: no title, no description, `h1Count !== 1`, no `LocalBusiness`-type JSON-LD, not indexable
  - result is `round((psi.seo + own) / 2)`, or `own` alone without PSI
- `design`:
  - own score starts at 100, minus 34 each for: no viewport, no https, `copyrightYear` two or more years before `now`
  - result is `round((avg(accessibility, bestPractices) + own) / 2)`, or `own` alone without PSI
- `cta`: 100, minus 34 each for: no `tel:`, no form, no action button
- `score = round(average of non-null category scores)`
- **Missing data:**
  - a category without its data gets `score: null, status: 'unavailable'`
  - speed with no PSI shows the issue "Couldn't measure right now"
  - with no facts and no PSI, `score: null` and verdict "We couldn't reach that website."
- **Issue copy:** one `{ problem, fix }` per failed check, at most 4 per category, in plain words. Example: "Takes 6.2 seconds to show on a phone. Most visitors leave after 3." with fix "We rebuild it to load in under 2 seconds." Never mention rank positions.

- [ ] **Step 1: Write failing tests**

```js
const psi = { performance: 42, seo: 80, accessibility: 70, bestPractices: 90, lcpMs: 6200, audits: {} };
const facts = { title: 'Rivera', description: '', viewport: true, https: true, indexable: true, h1Count: 1, telLinks: 2, forms: 0, actionButton: true, jsonLdTypes: [], copyrightYear: 2026 };
test('scores categories and total', () => {
  const r = buildReport('https://rivera.example/', facts, psi, new Date('2026-10-28'));
  expect(Object.fromEntries(r.categories.map((c) => [c.key, c.score]))).toEqual({ speed: 42, google: 70, design: 90, cta: 66 });
  expect(r.score).toBe(67);
  expect(r.verdict).toBe("Your website is holding you back.");
});
test('speed issue uses seconds', () => {
  const speed = buildReport('https://r.example/', facts, psi).categories.find((c) => c.key === 'speed');
  expect(speed.issues[0].problem).toMatch('6.2 seconds');
});
test('no PSI marks speed unavailable and scores the rest', () => {
  const r = buildReport('https://r.example/', facts, null, new Date('2026-10-28'));
  expect(r.categories.find((c) => c.key === 'speed')).toMatchObject({ score: null, status: 'unavailable' });
  expect(r.score).toBe(Math.round((60 + 100 + 66) / 3));
});
test('nothing reachable', () => {
  expect(buildReport('https://x.example/', null, null)).toMatchObject({ score: null, verdict: "We couldn't reach that website." });
});
test('never promises rankings', () => {
  const all = JSON.stringify(buildReport('https://r.example/', { ...facts, title: '', description: '' }, psi));
  expect(all).not.toMatch(/rank|#1|top of google/i);
});
```

- [ ] **Step 2:** Run `npx vitest run test/report.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement `report.js` as above, then `psi.js`.**
  - Request: GET `https://www.googleapis.com/pagespeedonline/v5/runPagespeed`, with `url`, `strategy=mobile`, `category=performance&category=seo&category=accessibility&category=best-practices`, and `key=env.PSI_API_KEY`.
  - Scores are `lighthouseResult.categories.*.score * 100`.
  - `lcpMs` is `audits['largest-contentful-paint'].numericValue`.
  - Keep the audits with a score below 0.9.
  - `Report.id` is `crypto.randomUUID()`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: "Add PageSpeed client and report scoring".

### Task 4: `POST /check` with CORS, Turnstile, limits and cache

**Files:**
- Create: `worker/src/index.js`, `worker/src/limits.js`
- Test: `worker/test/check.test.js`, using `SELF.fetch` from `cloudflare:test` with fetch mocks

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces:
  - `verifyTurnstile(token, ip, env, fetchImpl?) -> Promise<boolean>`. POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret`, `response` and `remoteip`.
  - `rateLimit(env, key, max, windowSec) -> Promise<boolean>`. Uses a KV counter `rl:<key>:<window>` with `expirationTtl = windowSec`.
  - The `/check` request and response shapes follow the spec (section 2.1).
  - Cache key: `report:<normalized href>`, with a TTL of 86,400 s.
  - Reports are also stored as `report-id:<id>` for 90 days, so `/enhance` can attach them.
  - Error responses use `{ error: 'invalid'|'private'|'limit'|'bot' }` with status 400, 403 or 429.

- [ ] **Step 1: Write failing tests**
  - `'OPTIONS from an allowed origin returns CORS headers'`. Expect `access-control-allow-origin` equal to `https://marveloweb.com`.
  - `'POST from another origin is refused'`. Expect 403.
  - `'bad turnstile -> 403 bot'`.
  - `'sixth check in an hour -> 429 limit'`.
  - `'private url -> 400 private'`.
  - `'same site twice hits the cache'`. Post `"  WWW.Rivera-Plumbing.com/ "`, then `"rivera-plumbing.com"`. PSI is fetched once.
- [ ] **Step 2:** Run `npx vitest run test/check.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement the router and `/check`.**
  - Read the IP from `cf-connecting-ip`.
  - Run `fetchPage` and `runPsi` in parallel with `Promise.allSettled`.
  - Unknown routes return 404.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: "Add check endpoint".

### Task 5: Leads, preview, email, preview route and cron

**Files:**
- Create: `worker/src/preview.js`, `worker/src/mail.js`, `worker/src/leads.js`
- Modify: `worker/src/index.js`, adding `/enhance`, `/p/<id>` and the `scheduled` handler
- Test: `worker/test/leads.test.js`, `worker/test/preview.test.js`

**Interfaces:**
- Consumes: `fetchPage`, `verifyTurnstile`, `rateLimit` and the `report-id:` records.
- Produces:
  - `cleanPreviewHtml(raw: string) -> string`. Strips code fences and every `<script>…</script>`. Throws if there is no `<html`.
  - `generatePreview(lead, facts, env, fetchImpl?) -> Promise<string>`
  - `sendLeadEmail(env, { lead, report, link, failedReason }, fetchImpl?) -> Promise<void>`. POSTs to `https://api.resend.com/emails` with `Authorization: Bearer`.
  - `processLead(env, id) -> Promise<void>`. Makes the preview if it is missing, then emails. On an email failure it increments `lead.attempts`.
  - `runCron(env, now)`. Retries leads with `emailed: false && attempts < 24`, and deletes leads (and their previews) older than 90 days.
  - KV records:
    - `lead:<id>` holds `{ id, createdAt, website, name, email, phone, business, extras, reportId, previewKey, emailed, attempts, failedReason }`
    - `preview:<id>` holds HTML. Leads and previews get an `expirationTtl` of 90 days as a backstop.

- [ ] **Step 1: Write failing tests**

```js
test('cleans fenced output and scripts', () => {
  const out = cleanPreviewHtml('```html\n<html><body>Hi<script>alert(1)</script></body></html>\n```');
  expect(out).toBe('<html><body>Hi</body></html>');
});
test('enhance replies 202 before the preview is built', async () => { /* mock Claude to hang; expect 202 and a lead:<id> record with emailed:false */ });
test('missing phone -> 400', async () => { /* expect { error: 'invalid' } */ });
test('Claude failure still emails with "Preview failed:" subject', async () => { /* assert the Resend body subject starts with 'Preview failed:' */ });
test('email failure is retried by cron, max 24', async () => { /* attempts 23 -> cron sends; attempts 24 -> cron skips */ });
test('cron deletes leads older than 90 days', async () => {});
test('preview route: right key 200 with noindex + CSP, wrong key 404', async () => {});
test('third enhance in a day -> 429', async () => {});
```

- [ ] **Step 2:** Run `npx vitest run test/leads.test.js test/preview.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The prompt (system plus user) gives Claude:
    - the facts: name, headings, services from `headings`, `phone`, `address`, the first 4,000 characters of text
    - the Global Constraints rules on preview content
    - the house style: bold, modern, built for phones first, a clear call-to-action button and a tap-to-call link
    
    Use `max_tokens: 16000`.
  - The email body has the lead fields, the report score with its four category scores and top issues, and the link `https://api.marveloweb.com/p/<id>?k=<previewKey>`.
  - Generate `previewKey` with `crypto.getRandomValues`, as 32 base62 characters.
  - Use `ctx.waitUntil(processLead(env, id))`.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all PASS.
- [ ] **Step 5:** Commit: "Add enhance, preview, email and cron".

### Task 6: Report card on the redesign page

**Files:**
- Modify: `redesign.html` (button text, `#report` section after the hero, Turnstile script `https://challenges.cloudflare.com/turnstile/v0/api.js`), `redesign.css`, `redesign.js`

**Interfaces:**
- Consumes: the `/check` response from Task 4.
- Produces:
  - `const API_BASE = ''` and `const TURNSTILE_SITE_KEY = ''` at the top of `redesign.js`
  - `window.MW.lastReportId`, which Task 7 sends with the lead

- [ ] **Step 1:** Change the hero button text to "Check my website". Keep today's validation and the before/after fill.
- [ ] **Step 2: When `API_BASE` is set,** submitting does the following:
  - disables the button
  - shows the five-step progress list. Steps tick as time passes and complete when the response arrives; the 4th and 5th steps tick on the response, not on a timer.
  - POSTs `/check`
  - renders the overall score, the verdict and four cards, each listing problem / How we fix it
  - scrolls to `#report`
  - re-enables the button
  
  On errors:
  - network error, 5xx or a `score: null` report: "We couldn't reach that website."
  - 429 or 403: "Please try again in a little while."
  - categories with `status: 'unavailable'` show their "couldn't check" line in place of a score
  
  With `API_BASE` empty, today's flow runs unchanged.
- [ ] **Step 3:** Add "Enhance my website" under the cards. It scrolls to `#start` and focuses the first empty field, with `#s-site` already filled.
- [ ] **Step 4: Verify in the browser.** Use the `marveloweb-alt` preview, with `API_BASE` pointed at `wrangler dev` on `http://localhost:8787`, and Turnstile's test site key `1x00000000000000000000AA`.
  - Check desktop and 375 px widths.
  - Expected: no horizontal scroll and no console errors.
  - A double click sends exactly one `/check` (the network panel shows 1 request).
  - With `wrangler dev` stopped, the page shows "We couldn't reach that website."
  - Expected: `API_BASE = ''` gives exactly today's behaviour.
- [ ] **Step 5:** Bump the `?v=` versions, then commit: "Add website check report to the redesign page".

### Task 7: Send leads to the server, with the email fallback

**Files:**
- Modify: `main.js` (funnel submit), `redesign.js`, `redesign.html` (two done messages)

**Interfaces:**
- Consumes: `/enhance` from Task 5, and `window.MW.lastReportId` from Task 6.
- Produces:
  - In `main.js`, the funnel submit awaits `window.MW.sendLead?.(form)`.
  - If that resolves `true`, it shows `[data-done-sent]`.
  - Otherwise (missing, `false` or rejected) it runs today's `mailto:` path and shows `[data-done-mail]`.
  - Pages without `sendLead` behave exactly as today.

- [ ] **Step 1:** Add the hook to `main.js` and the two done variants to `redesign.html`.
  - `[data-done-sent]` uses the "being built" copy from Global Constraints.
  - Under the form's submit button, add the privacy line: "We only use your details to send your preview."
- [ ] **Step 2:** In `redesign.js`, when `API_BASE` is set, define `window.MW.sendLead`.
  - It POSTs `/enhance` with every funnel field, `reportId` and the Turnstile token.
  - It resolves `true` on a 202. On a network error, a 5xx or a 429 it resolves `false`.
- [ ] **Step 3: Verify in the browser with `wrangler dev`.**
  - A submit shows the "being built" message, and `wrangler dev` logs the lead.
  - With the Worker stopped, the email app opens as today.
  - Check that `index.html`'s form still uses `mailto:`.
- [ ] **Step 4:** Bump `main.js?v=` on all three pages, then commit: "Send redesign leads to the server".

### Task 8: Owner setup, deploy and end-to-end check

- [ ] **Step 1: Guide the owner through spec section 5.**
  - Add marveloweb.com to Cloudflare.
  - Create the Claude, PageSpeed, Resend and Turnstile keys, and choose `LEAD_EMAIL_TO`.
  - The owner runs `npx wrangler secret put <NAME>` for each secret themself.
- [ ] **Step 2: Create the KV namespace and deploy.**
  - Run `npx wrangler kv namespace create MW` and put its id in `wrangler.toml`.
  - Run `npx wrangler deploy`.
  - Add the custom domain `api.marveloweb.com`.
- [ ] **Step 3: Configure and push.** Set `API_BASE = 'https://api.marveloweb.com'` and the real `TURNSTILE_SITE_KEY`, then push.
- [ ] **Step 4: End-to-end on the live site.**
  - Check 3 real websites. Each report renders in under 30 s.
  - Submit Enhance with the owner's test email. The email arrives with the report.
  - The preview link opens, and a wrong `k` gives 404.
- [ ] **Step 5:** Update `README.md` with the Worker, its secrets and how to deploy. Commit and push.
