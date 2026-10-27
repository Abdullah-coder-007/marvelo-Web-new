# MarveloWeb

Marketing site for MarveloWeb: websites for local businesses, with a free preview before you pay.

Plain HTML, CSS and JavaScript. No build step and no dependencies apart from Google Fonts.

## Run locally

```sh
python -m http.server 8080
```

Then open http://localhost:8080.

## Files

- `index.html`: page markup
- `styles.css`: design tokens, layout, the intro and 3D assembly styles
- `main.js`: intro sequence, scroll-driven 3D assembly, niche picker, mobile menu and the free-preview form
- `.nojekyll`: lets GitHub Pages serve the files as they are

## Before launch

- Prices, contact email and social links are placeholders.
- The four work examples and the niche demo are labelled concepts, not client projects.
- The free-preview form has no backend yet. It opens the visitor's email app with their details filled in.

## Deploy

GitHub Pages serves the `main` branch root. Pushes to `main` publish automatically.
