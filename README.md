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
- `new-website.html`: homepage for businesses with no website (live builder, 2-step preview form)
- `redesign.html`: homepage for businesses that already have a website (3D assembly, niche picker); to be rebuilt next
- `styles.css`: shared design tokens, layout, intro, chooser and 3D assembly styles
- `new.css`, `new.js`: styles and behaviour for `new-website.html`
- `main.js`: shared intro, nav, trade skins, 3D assembly and the redesign page's form
- `.nojekyll`: lets GitHub Pages serve the files as they are

When you change a CSS or JS file, bump its `?v=` number in the HTML so browsers fetch the new copy.

## Before launch

- Prices, contact email and social links are placeholders.
- The four work examples and the niche demo are labelled concepts, not client projects.
- The free-preview form has no backend yet. It opens the visitor's email app with their details filled in.

## Deploy

GitHub Pages serves the `main` branch root. Pushes to `main` publish automatically.
