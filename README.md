# ALoDLM project page

Private, anonymous project page for **ALoDLM: Adaptively Looped Diffusion Language Models**
(under double-blind review as a conference paper at ICLR 2027).
Plain HTML, CSS and JavaScript: no framework, no build step, no package manager.

## Preview locally

- Open `index.html` directly in a browser. `file://` works: all data lives in JS files that set
  globals, so nothing is fetched at runtime.
- Or serve the folder: `python3 -m http.server 8000`, then open <http://localhost:8000>.

The only external resources are Google Fonts and KaTeX (pinned, from jsDelivr). Without network
access the page falls back to system fonts and shows equations as raw TeX; everything else works.

## File structure

```
index.html                    the page: all static content + widget mount points
.nojekyll                     serve files as-is on GitHub Pages
static/css/style.css          design system: tokens (light/dark), layout, components
static/css/demo-replay.css    hero decoding replay        (#demo)
static/css/loop-stepper.css   method step-through         (#loop-stepper)
static/css/results.css        Table 1 + analysis charts   (#results-table, #analysis-charts)
static/css/depth-explorer.css case-study explorer         (#depth-explorer)
static/js/site.js             theme toggle, nav scroll-spy, figure lightbox, BibTeX copy,
                              KaTeX rendering, shared helpers (window.ALODLM)
static/js/<widget>.js         one script per widget (same names as the CSS files)
static/data/depth_traces.js   recorded commitment passes (window.ALODLM_TRACES)
static/data/results.js        Table 1 as data (window.ALODLM_RESULTS); generated, do not hand-edit
static/images/                figures as SVG/PNG (metadata stripped, opaque white backgrounds)
```

Scripts load with `defer` in this order: data files, `site.js`, then the widgets. Each widget
replaces the short fallback text inside its mount point; if a widget fails, the fallback stays.

## Content sources

- Abstract, figure captions, equations and every number come from the final paper. The abstract and
  captions are verbatim.
- Table 1 is generated into `static/data/results.js` from a twice-verified transcription of the paper
  table (values, bold/underline marks and the caption).
- Figures were converted from the paper's figure PDFs. They stay on white "paper" cards in dark mode
  and are never inverted.
- Traces: per-token commitment passes recorded while an ALoDLM-8B checkpoint decoded GSM8K test
  questions (K = 4, τ = 0.4, 16-token window; exit threshold q ∈ {0.1, 0.2, 0.3, 0.5}). This
  checkpoint is not the one used for the throughput measurements.

## What is illustrative

- **Decoding replay (hero):** both panes replay the same ALoDLM-8B response. Pacing is scaled from
  measured single-stream GSM8K throughput (229.3 vs 612.4 tok/s, Fig. 1 right) and slowed for
  readability. Token colours are recorded commitment passes; the grouping of tokens into denoising
  steps is illustrative.
- **Method step-through:** a real span with its recorded commitment passes; placing these tokens in a
  single denoising step is illustrative.
- **Depth explorer:** recorded traces, descriptive only.

Everything else (tables, figures, numbers) is reported as in the paper.

## Before going public

- [ ] Replace "Anonymous Authors" with the author list (and affiliations, if wanted).
- [ ] Turn the Paper / Code / Models placeholders into real links. They are `aria-disabled` buttons
      with a "soon" tag now; make them `<a class="btn" href="...">` and drop the tag.
- [ ] Update the BibTeX entry (authors, key, venue, year, URL) and the sentence above it.
- [ ] Remove `<meta name="robots" content="noindex, nofollow">` from `index.html`.
- [ ] Revisit the footer line ("Anonymous project page for a paper under double-blind review.").
- [ ] Optionally add Open Graph / Twitter meta tags (e.g. `static/images/teaser_throughput.png`).
- [ ] Re-check figures and data for anything that should stay private.
- [ ] While the page is anonymous, commit with a repository-local anonymous git identity: commit
      metadata becomes visible once the repository is public.
- [ ] Make the repository public and enable GitHub Pages: Settings → Pages → Deploy from a branch →
      `main` / `(root)`. The site will be served at <https://alo-dlm.github.io>.

Do not enable GitHub Pages before de-anonymizing: Pages sites are public even when the repository is
private.
