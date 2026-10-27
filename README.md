# MarveloWeb

Marketing site for MarveloWeb: websites for local businesses, with a free preview before you pay.

Plain HTML, CSS and JavaScript. No build step and no dependencies apart from Google Fonts.

## Run locally

```sh
python -m http.server 8080
```

Then open http://localhost:8080.

## Files

- `index.html`: brand intro, then the chooser: "I need a website" or "I already have a website"
- `new-website.html`: homepage for businesses with no website (live builder, real work, "customers can't find you", payback calculator, 2-step preview form)
- `redesign.html`: homepage for businesses that already have a website (before/after slider, warning-signs checklist, 3D assembly, 2-step preview form)
- `styles.css`: shared design tokens, layout, intro, chooser and 3D assembly styles
- `new.css`: homepage sections shared by both homepages (hero, steps, pricing, guarantee, 2-step form, sticky phone CTA)
- `new.js`: live builder, WhatsApp links, real-work cards, search mock and payback calculator on `new-website.html`
- `new-extras.css`: styles for those `new-website.html` additions
- `redesign.css`, `redesign.js`: before/after slider, checklist and keep/change sections on `redesign.html`
- `main.js`: shared intro, nav, trade skins, 3D assembly, 2-step lead form and sticky CTA
- `.nojekyll`: lets GitHub Pages serve the files as they are

When you change a CSS or JS file, bump its `?v=` number in the HTML so browsers fetch the new copy.

## Before launch

- Fill in the config block at the top of `new.js`: `WHATSAPP` (number with country code, digits only) switches on the WhatsApp buttons, and `LIVE_SITES` switches on the "Sites we've already launched" strip. Both stay hidden while empty. `STARTER_PRICE` feeds the payback calculator, so keep it in step with the pricing section.

- Prices, contact email and social links are placeholders.
- The four work examples and the niche demo are labelled concepts, not client projects.
- The free-preview form has no backend yet. It opens the visitor's email app with their details filled in.

## Deploy

GitHub Pages serves the `main` branch root. Pushes to `main` publish automatically.
