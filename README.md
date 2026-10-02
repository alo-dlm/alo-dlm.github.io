# ALoDLM project page

Private project page for **ALoDLM: Adaptively Looped Diffusion Language Models**
(under review as a conference paper at ICLR 2027).
Plain HTML, CSS and JavaScript: no framework, no build step, no package manager.

The page now shows the author list (header and BibTeX), so it must stay private while the paper is
under double-blind review.

## While under review

Keep the repository private, and its metadata anonymous, until the paper is de-anonymized:

- In every clone, set an anonymous identity before committing (local git config is not pushed, so a
  fresh clone would otherwise commit under your own name and email):
  `git config user.name Anonymous && git config user.email anonymous@anonymous.invalid`
- Commit with `TZ=UTC` (for example `TZ=UTC git commit ...`): commit dates store the local UTC offset,
  which hints at a location.
- Do not make the repository public, add outside collaborators or enable GitHub Pages. GitHub also shows
  which account pushed each update (repository Activity), so anonymous commit metadata alone is not
  enough once others can see the repository.

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
  it is a different checkpoint; the page says so. Token colours are recorded commitment passes; the
  grouping of tokens into denoising steps is illustrative.
- **Method step-through:** a real span with its recorded commitment passes; placing these tokens in a
  single denoising step is illustrative. The traces record only commitment passes, so the halting
  meter is schematic (labelled on the page).

Everything else (tables, figures, numbers) is reported as in the paper.

## Before going public

- [x] Author list, affiliations and equal-contribution note in the header; authors in the BibTeX entry.
- [ ] Turn the Paper / Code / ALoDLM-1.7B / ALoDLM-8B buttons into real links. They are
      `aria-disabled` buttons with a "Coming soon" tooltip now; make each one
      `<a class="pub-btn" href="...">` (same icon and label) and drop `aria-disabled`, `aria-label`
      and `data-tip`.
- [ ] Update the BibTeX venue, year and URL (and the sentence above it) once the decision is out.
- [ ] Remove `<meta name="robots" content="noindex, nofollow">` from `index.html`.
- [x] Footer line no longer says the page is anonymous.
- [ ] Optionally add Open Graph / Twitter meta tags (e.g. `static/images/teaser_throughput.png`).
- [ ] Re-check figures and data for anything that should stay private.
- [ ] Figure 1 (right) prints an inference-engine label under ALoDLM-8B, copied from the paper's figure,
      while the paper's text describes ALoDLM's engine differently. Confirm the label, or re-export the
      figure without it (`static/images/teaser_throughput.svg` and `.png`).
- [ ] Check the commit history for anything identifying (identities, UTC offsets in dates) before it
      becomes visible; see "While under review".
- [ ] Make the repository public and enable GitHub Pages: Settings → Pages → Deploy from a branch →
      `main` / `(root)`. The site will be served at <https://alo-dlm.github.io>.

Do not enable GitHub Pages before de-anonymizing: Pages sites are public even when the repository is
private.
