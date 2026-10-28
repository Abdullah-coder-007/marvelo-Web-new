# Website check and AI preview for the redesign page

Date: 2026-10-28
Page: `redesign.html` ("I already have a website")
Status: approved in conversation, awaiting written-spec review

## Goal

A business owner who already has a website types its address and, within about 20 seconds, sees a plain-language report of what is holding it back: speed, Google visibility, design on phones, and calls to action. Each problem comes with how MarveloWeb fixes it. If they then ask to have it enhanced and leave their contact details, an AI builds a custom one-page preview of their new website. That preview goes to the MarveloWeb owner by email to check before it is sent to the visitor.

Success means:

- the report uses real measurements, not made-up numbers
- every lead reaches the owner's inbox, even when parts of the system fail
- no API key is ever exposed in the website's code
- the owner pays only for previews of real leads, never for bots

## Decisions already made

| Decision | Choice |
|---|---|
| Who sees the AI preview first | The owner. The visitor is told it arrives within 24 hours. |
| How leads reach the owner | Email, with the report and a private preview link |
| Domain | The owner owns marveloweb.com. The server lives at `api.marveloweb.com` and emails come from `leads@marveloweb.com`. |
| Hosting | One Cloudflare Worker. The site itself stays on GitHub Pages. |
| What judges the instant check | Fixed rules plus Google PageSpeed, with no AI, so every check is free |
| What builds the preview | Claude, called only after a visitor leaves contact details |

## What we will not claim

- We never promise "rank #1" or "top of Google". The copy says "get found on Google".
- The report does not show search positions. That needs a paid search-data service, which is out of scope. "Google visibility" means whether Google can find, read and understand the site.

## 1. Visitor experience

### 1.1 Check

- The hero form `#url-form` keeps its field `#u-site`. Its button text changes from "Show me my redesign" to "Check my website".
- On submit, the form keeps today's behaviour (address validation, filling the before/after mock) and also starts the check.
- A progress list appears under the form with five steps:
  - Opening your site
  - Measuring speed
  - Checking Google
  - Looking at design
  - Finding your call buttons
  
  Each step ticks off when its data comes back. A check is expected to take 15 to 25 seconds, mostly PageSpeed.
- The page does not move or reload. The report renders in a new section `#report`, placed straight after the hero, and the page scrolls to it once it is ready.

### 1.2 Report card

- **Overall score** out of 100, with a verdict:
  - 0 to 49: "Your website is costing you customers."
  - 50 to 79: "Your website is holding you back."
  - 80 to 100: "A solid start. Here's what's left."
- **Four category cards**, each with a score out of 100 and up to 4 issues. Each issue has a one-line problem in plain words and a "How we fix it" line.
  - **Speed:** PageSpeed performance score (mobile), shown with load time in seconds (Largest Contentful Paint). Example: "Takes 6.2 seconds to show on a phone. Most visitors leave after 3."
  - **Google visibility:** PageSpeed SEO score, plus our checks on the page title, meta description, one clear main heading, LocalBusiness structured data, and whether search engines are allowed to index the page.
  - **Design and phones:** viewport meta, HTTPS, PageSpeed accessibility and best-practices flags (small text, tap targets too close, oversized images), and a copyright year two or more years old.
  - **Calls to action:** a `tel:` link, a contact or quote form, and an action button near the top. That means a link or button whose text matches book, quote, call, contact, appointment, schedule or estimate, among the first 40 links and buttons in page order.
- **The overall score** is the average of the four category scores, rounded.
- **Under the cards:** an "Enhance my website" button that scrolls to the existing 2-step form `#funnel` with the website already filled in (`#s-site`, as today).

### 1.3 Enhance

- The existing 2-step `#funnel` form stays.
- The submit handler for this page sends the form to the server (`POST /enhance`) instead of opening the email app.
- On success it shows: "Your custom preview is being built. We'll email it to you within 24 hours."
- The existing `mailto:` behaviour remains as the fallback when the server cannot be reached (see 3.1).

### 1.4 What stays

The before/after slider, warning-signs checklist, 3D assembly, keep/change section, pricing, FAQ and footer are unchanged.

## 2. Server (Cloudflare Worker at `api.marveloweb.com`)

Code lives in `worker/` in this repository, deployed with `wrangler deploy`. The folder holds no secrets.

### 2.1 `POST /check`

Request: `{ url, turnstileToken }`

1. Verify the Turnstile token.
2. Apply the rate limit: 5 checks per IP per hour.
3. Normalise and validate the URL:
   - `http` or `https` only, default `https://`
   - the hostname must resolve to a public address
   - refuse `localhost`, IP literals in private, loopback or link-local ranges, and non-standard ports
4. Look in the 24-hour cache, keyed by normalised URL. Return the cached report if present.
5. Run two jobs in parallel:
   - **PageSpeed Insights API**, mobile strategy, with the performance, seo, accessibility and best-practices categories. Timeout 30 s.
   - **Fetch the homepage.** Timeout 10 s, follow at most 5 redirects, read at most 2 MB, and run the address check again on each redirect target. Parse with HTMLRewriter for: title, meta description, viewport, robots meta, h1 count, `tel:` links, forms, action-button text near the top, JSON-LD types, and the copyright year.
6. Build the report: four categories, issues and fixes. Mark any category whose data did not arrive as `unavailable`. Cache it and return it.

Response:

```
{ id, url, score, verdict, categories: [ { key, title, score|null, status, issues: [ { problem, fix } ] } ] }
```

### 2.2 `POST /enhance`

Request: `{ website, name, email, phone, business?, reportId?, extras..., turnstileToken }`

1. Verify the Turnstile token.
2. Apply the rate limit: 2 per IP per day.
3. Validate the request: email format, phone present, website present.
4. Store the lead in KV as `lead:<id>`, together with the report if `reportId` is known. Reply `202 { ok: true }` straight away.
5. In the background (`ctx.waitUntil`):
   - Extract the business facts from the fetched page: name, headings, services, phone, address.
   - Call the Claude API (model `claude-sonnet-5-5`) with a fixed prompt. It returns one self-contained HTML page (inline CSS, no external scripts) for the business. Sample content (reviews, photos, numbers) must be visibly labelled as sample, for example "Sample review, replace with a real one".
   - Store the page in KV as `preview:<id>` with a random 32-character key.
   - Email the owner via Resend, from `leads@marveloweb.com` to `LEAD_EMAIL_TO`. The email contains:
     - the lead details
     - the report summary
     - the private link `https://api.marveloweb.com/p/<id>?k=<key>`
   - If the preview step fails, send the email anyway, subject prefixed "Preview failed:", with the reason.
   - If sending the email fails, keep the lead and retry the email on the next run of a scheduled cron trigger (hourly), up to 24 attempts.

### 2.3 `GET /p/<id>?k=<key>`

- Serves the preview HTML when the key matches, otherwise 404.
- Headers:
  - `X-Robots-Tag: noindex, nofollow`
  - a Content-Security-Policy that blocks scripts
  - `Cache-Control: private`

### 2.4 Configuration

- **Secrets** (set by the owner in Cloudflare, never in code or chat):
  - `ANTHROPIC_API_KEY`
  - `PSI_API_KEY`
  - `RESEND_API_KEY`
  - `TURNSTILE_SECRET`
- **Variables:**
  - `LEAD_EMAIL_TO`
  - `ALLOWED_ORIGINS`: `https://abdullah-coder-007.github.io` and `https://marveloweb.com`
- **Bindings:** one KV namespace `MW`, holding leads, previews, the report cache and rate-limit counters.
- **CORS:** only `ALLOWED_ORIGINS`, with POST and GET.

### 2.5 Front-end changes

- `redesign.js` gains:
  - the check request and progress list
  - report rendering
  - the Turnstile widget (invisible mode)
  - the `/enhance` submit, with the mailto fallback
- `redesign.html` gains the `#report` section and the Turnstile script tag.
- `redesign.css` gains the report styles.
- The API base URL is one constant at the top of `redesign.js`. While it is empty, the page behaves exactly as today.

## 3. Failure handling

### 3.1 Failure behaviour

| Failure | What happens |
|---|---|
| Their site does not load or times out | The report shows the PageSpeed parts it got, and says which checks could not run |
| PageSpeed times out | The report shows our own checks. Speed is marked "Couldn't measure right now". |
| Both fail | "We couldn't reach that website." The Enhance form still works. |
| Worker unreachable, or a 5xx response, on `/check` | Same message as above |
| Worker unreachable, or a 5xx response, on `/enhance` | Falls back to the current `mailto:` behaviour, so the lead still reaches the owner |
| Claude fails | The lead email is still sent, marked "Preview failed", with the reason |
| Email fails | The lead stays in KV. The hourly cron retries. |
| Rate limit or Turnstile fails | "Please try again in a little while." The Enhance form still works through the mailto fallback. |

### 3.2 Privacy

- Leads are kept for 90 days, then deleted by the cron.
- The page states that the details are used only to send the preview.

## 4. Testing

- **Worker unit tests** (Vitest with the Workers pool), against saved sample HTML:
  - a good modern site
  - an old site with no viewport, no HTTPS links, an old copyright year and no `tel:` link
  - a site with no title or meta description
  - URL validation refusing `localhost`, `10.0.0.1`, `169.254.169.254`, `file:` and a non-standard port
- **A scoring test:** the category scores and the overall average for a fixed PageSpeed response.
- **Manual end-to-end** on a preview deployment:
  - check 3 real websites
  - submit Enhance with a test email
  - confirm the owner's email arrives and the preview link opens; a wrong key returns 404
- **Browser checks** at phone and desktop sizes:
  - the progress list, the report card and the failure messages
  - no horizontal scroll and no console errors

## 5. Owner setup (guided at build time)

1. Add marveloweb.com to Cloudflare, and point `api.marveloweb.com` at the Worker.
2. Create a Claude API key at console.anthropic.com, with billing turned on.
3. Create a Google PageSpeed Insights API key. It's free.
4. Create a Resend account and verify marveloweb.com for sending.
5. Create a Turnstile site key (public, goes in `redesign.js`) and secret key (goes in Cloudflare).
6. Choose the email address that leads go to.

## 6. Before building

`redesign.html`, `redesign.css` and `redesign.js` were built in another session ("Overview"). Confirm that session is not editing them before making changes.

## Out of scope

- search position tracking
- a dashboard of leads
- sending the preview to the visitor automatically
- payments
- multi-page previews

---

## Amendment 1 (2026-10-28): no AI preview, real keyword rankings, downloadable report

The owner changed direction during the build. Where this amendment conflicts with the sections above, the amendment wins.

### Removed
- There is no AI-built preview. Remove the Claude call, the `preview:` records, the preview key and `GET /p/<id>`. `ANTHROPIC_API_KEY` is no longer used.
- The lead email still goes to the owner with the visitor's details and the full report, just without a preview link. The cron keeps retrying the email (hourly, up to 24 attempts) and keeps the 90-day clean-up.
- After Enhance, the visitor copy becomes: "Thanks! We'll send your free redesign plan within 24 hours."

### Visitor experience
- **Hero form:** two fields, "Your website" and "Your city" (e.g. "Columbus, OH"). Both are required while the check is switched on.
- **Live preview:** once a check starts, the hero's right column shows a live screenshot of their homepage in a browser frame. It comes from `https://s.wordpress.com/mshots/v1/<encoded url>?w=1200&h=800`. If the screenshot fails, a panel shows the domain instead. The before/after slider moves to just below the report.
- **Report layout:** five category cards in a neatly aligned grid of equal-height cards. Each card's score badge sits in the same position. The cards appear in this order:
  - **Design:**
    - viewport
    - HTTPS
    - old copyright year
    - favicon
    - dated markup (`<font>`, `<marquee>`, `<center>`, or table-based layout)
    - PageSpeed's image and readability audits: oversized images, old image formats, small text, cramped tap targets
  - **SEO:**
    - title present, 30 to 65 characters
    - meta description present, 70 to 160 characters
    - exactly one h1
    - LocalBusiness-type structured data
    - indexable
    - canonical link
    - image alt text on at least 80 % of images
    - `/robots.txt` and `/sitemap.xml` reachable
    - PageSpeed SEO score
  - **Rankings:**
    - the five searches below, each with their position ("#14", or "Not in the top 100")
    - whether they appear in the Google Maps results
  - **Speed:** as before.
  - **Calls to action:** as before.
- **Pitch:** a block after the cards, headed "Here's what's costing you customers". It lists the three most important problems and how MarveloWeb fixes each one, then a "Fix my website" button that opens the form with their website and city filled in.
- **Download:** a "Download report (PDF)" button under the pitch. It opens the browser's print dialog on a dedicated print layout, where the visitor can choose "Save as PDF".
  - The print layout is branded:
    - MarveloWeb logo and wordmark at the top
    - the checked website, city and date
    - the overall score and verdict
    - all five cards, then the pitch
  - The footer reads "Prepared by MarveloWeb · marveloweb.com · hello@marveloweb.com".
  - Cards never split across pages.
  - No site navigation, buttons, forms or screenshots are printed, apart from a small screenshot thumbnail if it has already loaded.
  - The layout uses A4/Letter-safe margins and black text with the pink accent.

### Rankings
- **Source:** DataForSEO SERP API, Google organic, live advanced endpoint: `POST https://api.dataforseo.com/v3/serp/google/organic/live/advanced`.
  - Basic auth comes from the secrets `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`.
  - Each call carries one task. The five calls run in parallel.
  - Each task sets `language_code: "en"`, `device: "mobile"` and `depth: 100`, with a 30 s timeout.
- **Location:** `location_name` is `"<City>,<State full name>,United States"`, taken from the visitor's city field. US state abbreviations are expanded. If the location can't be parsed, or DataForSEO rejects it, the Rankings card is unavailable with "We couldn't check rankings for that city."
- **Business type:** taken from the page.
  - First from the JSON-LD type, e.g. Dentist → dentist, Plumber → plumber.
  - Otherwise from words in the title or h1:
    - dental → dentist
    - plumbing → plumber
    - roof → roofer
    - hvac / heating / air conditioning → HVAC company
    - med spa → med spa
    - attorney / law → lawyer
    - real estate → real estate agent
    - salon → hair salon
    - clinic → clinic
  - If nothing matches, the Rankings card is unavailable with "We couldn't tell what your business does."
- **The five searches**, for business type `t`, city `C` and state abbreviation `S`:
  - `t near me`
  - `best t near me`
  - `t in C S`
  - `t C`
  - `emergency t near me` for dentist, plumber, roofer, HVAC company or locksmith; otherwise `affordable t near me`
- **Match:**
  - An organic item matches when its domain, without `www.`, equals theirs.
  - Maps presence means any `local_pack` item with a matching domain.
- **Score per search:**
  - positions 1–3: 100
  - 4–10: 70
  - 11–20: 40
  - 21–100: 15
  - not found: 0
  
  The category score is the average of the five. Appearing in the Maps pack on any search adds 10, capped at 100.
- **Claims:** the pitch says "get found on Google" and never promises positions.

### Cost protection
- Rankings cost about $0.002 per search, which is about 1 cent per check.
- On top of the 5-checks-per-hour limit per visitor, there is a site-wide cap of 200 checks per UTC day, using KV key `cap:check:<YYYY-MM-DD>`. Over the cap, `/check` returns 429 `{ error: 'busy' }` and the page shows "Please try again in a little while."
- Cached reports (24 h) don't count toward either limit.

### Pitch (built by the server)
- `report.pitch = { headline: "Here's what's costing you customers", points: [{ problem, fix }] }`.
- It has at most 3 points: the first issue from each of the three lowest-scoring available categories.

### Owner setup changes
- Replace the Claude key with a DataForSEO account (dataforseo.com, about $10 credit). Set its login and password as `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`.
