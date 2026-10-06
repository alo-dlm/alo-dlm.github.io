# ALoDLM project page

Project page for **ALoDLM: Adaptively Looped Diffusion Language Models**
(under review as a conference paper at ICLR 2027), served at <https://alo-dlm.github.io>.
Plain HTML, CSS and JavaScript: no framework, no build step, no package manager.

GitHub Pages serves the `main` branch from the repository root, so every push to `main` updates the
site.

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
static/css/results.css        Table 1                     (#results-table)
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
  captions are verbatim, except that Figure 1's caption is split between its two panels (its title is
  the section lead) and site-added notes are marked as such (e.g. Figure 2's reading guide).
- Table 1 is generated into `static/data/results.js` from a twice-verified transcription of the paper
  table (values, bold/underline marks and the caption).
- Figures were converted from the paper's figure PDFs. They stay on white "paper" cards in dark mode
  and are never inverted.
- Traces (used by the decoding replay and the method step-through): per-token commitment passes
  recorded while an ALoDLM-8B checkpoint decoded GSM8K test questions (K = 4, q = 0.5, τ = 0.4,
  16-token window), the same traces as the paper's case-study figure. This checkpoint is not the one
  used for the throughput measurements.

## What is illustrative

- **Decoding replay (hero):** both panes replay the same ALoDLM-8B response. Pacing is scaled from
  measured single-stream GSM8K throughput (229.3 vs 612.4 tok/s, Fig. 1 right) and slowed for
  readability. The 612.4 tok/s operating point is faster than the setting the traces were recorded
  with (q = 0.5, τ = 0.4; the paper measures 278.7–508.3 tok/s at q = 0.5 for τ from 0.1 to 0.6), and
  it is a different checkpoint. The page no longer carries an explanatory caption; the replay
  window is titled "illustrative replay" and its bars are labelled "simulated latency" / "Slowed 6×". Token colours are recorded commitment passes; the
  grouping of tokens into denoising steps is illustrative.
- **Method step-through:** a real span with its recorded commitment passes; placing these tokens in a
  single denoising step is illustrative. The traces record only commitment passes, so the halting
  meter is schematic (labelled on the page).
- **Motivation schematic (`#fig-mismatch`):** a site-made HTML/CSS diagram with a site-written caption,
  not a paper figure. Its sentence condenses a GSM8K reference answer; per-position difficulty, bar
  heights and pass counts are illustrative, not measured (labelled on the page).

Everything else (tables, figures, numbers) is reported as in the paper.
