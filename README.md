# Muni Underwriting Fee Map

An interactive map of what every US state, the largest US cities, and a set of big public issuers (University of California, Brightline, the MTA, the Port Authority and more) paid in **underwriters' discount** on their most recent municipal bond offering.

- **Live site:** see the repository's website link
- **Data table:** [DATA.md](DATA.md) · [data/issuers.csv](data/issuers.csv) · [data/issuers.json](data/issuers.json)

## How it works

A single static page. No build step, no map tiles, no external services:

- `index.html`, `styles.css`, `app.js` — the page (vanilla JS)
- `vendor/` — [d3-geo](https://github.com/d3/d3-geo), [d3-array](https://github.com/d3/d3-array), [topojson-client](https://github.com/topojson/topojson-client) and the [us-atlas](https://github.com/topojson/us-atlas) state shapes, checked in so the site works offline
- `data/issuers.json` — the dataset (source of truth)

States are shaded by fee; cities (circles) and other issuers (diamonds) are sized by fee. Toggle between total dollars and fee per $1,000 borrowed. Click anything for the deal details and a link to the source document.

## Data

Each row is one issuer's latest notable offering (mostly 2025–2026 sales): par amount, underwriters' discount in dollars, sale method (negotiated or competitive), lead underwriter(s), and the official statement or sale document the figure came from. `confidence` is **high** when the figure is stated in an official document and **medium** when it was computed from the purchase price or taken from a secondary report. Rows with no disclosed fee are kept with an empty fee so the gap is visible.

To edit the data, change `data/issuers.json` and regenerate the CSV and table:

```bash
node scripts/build-data.mjs
```

## Run locally

Any static file server works, e.g. `python3 -m http.server` in this folder, then open http://localhost:8000.

Informational only; not investment advice.
