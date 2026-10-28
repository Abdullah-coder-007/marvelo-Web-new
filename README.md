# MarveloWeb

Marketing site for MarveloWeb: websites for local businesses, with a free preview before you pay.

Plain HTML, CSS and JavaScript. No build step and no dependencies apart from Google Fonts.

## Run locally

```sh
python -m http.server 8080
```

Then open http://localhost:8080.

## Files

- `index.html`: home page for businesses with no website. Brand intro, then a small "Where are you starting from?" box (once per visit) that sends people with a website to `redesign.html`. Below it: live builder with photo templates for ten trades, real work, "customers can't find you" (Google, Google Maps, Apple Maps, Bing), payback calculator, standard or rush pricing, 2-step preview form
- `new-website.html`: old address of the home page; forwards to `./?path=new`
- `redesign.html`: homepage for businesses that already have a website (before/after slider, warning-signs checklist, 3D assembly, 2-step preview form)
- `styles.css`: shared design tokens, layout, intro, chooser and 3D assembly styles
- `new.css`: homepage sections shared by both homepages (hero, steps, pricing, guarantee, 2-step form, sticky phone CTA)
- `new.js`: path chooser, rotating headline words, live builder and trade templates, WhatsApp links, real-work cards, search mock, payback calculator and rush pricing on `index.html`
- `new-extras.css`: styles for those `index.html` additions
- `redesign.css`, `redesign.js`: before/after slider, checklist and keep/change sections on `redesign.html`
- `main.js`: shared intro, nav, trade skins, 3D assembly, 2-step lead form and sticky CTA
- `worker/`: the Cloudflare Worker behind the website check (`wrangler.toml`; `src/` has `index.js` routes, `url-guard.js`, `page-scan.js`, `psi.js`, `rankings.js`, `report.js`, `limits.js`, `leads.js`, `mail.js`; `test/` has the vitest suite)
- `.nojekyll`: lets GitHub Pages serve the files as they are

When you change a CSS or JS file, bump its `?v=` number in the HTML so browsers fetch the new copy.

## Before launch

- Fill in the config block at the top of `new.js`: `WHATSAPP` (number with country code, digits only) switches on the WhatsApp buttons, and `LIVE_SITES` switches on the "Sites we've already launched" strip. Both stay hidden while empty. `STARTER_PRICE` feeds the payback calculator, so keep it in step with the pricing section.

- Prices (including the rush add-on of +$300 Starter / +$500 Growth), contact email and social links are placeholders. Rush prices live in the `data-rush` attributes in the pricing section.
- Template photos in the hero preview come from Unsplash (free to use) and load from images.unsplash.com.
- The four work examples and the niche demo are labelled concepts, not client projects.
- While `API_BASE` in `redesign.js` is empty, the free-preview form has no backend. It opens the visitor's email app with their details filled in.

## Website check (worker/)

A Cloudflare Worker (`worker/`) powers the free website check on `redesign.html`.

- `POST /check` takes a website and a city, checks Turnstile and rate limits, then reads the homepage, runs PageSpeed and looks up Google rankings (DataForSEO). It returns a scored report and caches it in KV for a day.
- `POST /enhance` takes the finished 2-step form (including trade, warning signs and city), stores it as a lead in KV and answers 202.
- The cron (every 10 minutes) emails stored leads to `LEAD_EMAIL_TO` through Resend, retrying failures, and deletes leads after 90 days.

### Set up

1. Create the KV namespace and put its id in `worker/wrangler.toml` (`id = "REPLACE_WITH_KV_ID"`):
   ```sh
   cd worker
   npx wrangler kv namespace create MW
   ```
2. Set the six secrets, one at a time, from `worker/` (each command prompts for the value; secrets survive deploys):
   ```sh
   npx wrangler secret put PSI_API_KEY
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler secret put DATAFORSEO_LOGIN
   npx wrangler secret put DATAFORSEO_PASSWORD
   npx wrangler secret put LEAD_EMAIL_TO
   ```
   Until `LEAD_EMAIL_TO` is set the cron sends nothing (it logs `LEAD_EMAIL_TO not set`); leads stay queued.
3. `ALLOWED_ORIGINS` in `wrangler.toml` lists the sites that may call the Worker (comma separated). It holds the GitHub Pages address, `https://marveloweb.com` and `https://www.marveloweb.com`; add any other address that serves the site.
4. Deploy with `npx wrangler deploy` (from `worker/`).
5. Add the custom domain `api.marveloweb.com` to the Worker (Cloudflare dashboard, Workers, Settings, Domains & Routes).
6. Switch the front end on at the top of `redesign.js`: set `API_BASE` to `https://api.marveloweb.com` and `TURNSTILE_SITE_KEY` to the Turnstile site key. While `API_BASE` is empty the page makes no network calls and the old email hand-off runs. Bump the `?v=` number on `redesign.js` in `redesign.html` afterwards.

### Cost and limits

- DataForSEO costs about 1 cent per check (5 searches, first page only). A cap of 200 checks per day limits the spend. Keep the DataForSEO account prepaid with auto top-up off, so that balance is a hard ceiling.
- The Workers free plan allows 10 ms of CPU per request. If checks hit that limit, the Paid plan ($5/month) may be needed.

### Tests

```sh
cd worker
npm test        # or: npx vitest run
```

Keep `worker/.dev.vars` absent when running the tests, so they use the test-only bindings in `vitest.config.js`.

## Deploy

GitHub Pages serves the `main` branch root. Pushes to `main` publish automatically.
