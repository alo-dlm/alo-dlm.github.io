/* ==========================================================================
   loop-stepper.js: the Part 01 method explainer, mounted in #loop-stepper.
   Owner: loop-stepper widget. Contract: site_contract.md. Styles: loop-stepper.css.

   View 1, "One denoising step": a step-through of one ALoDLM denoising step on
   a real span of an ALoDLM-8B GSM8K response (case-study response (a)), using
   the commitment pass recorded for every token. A "Standard DLM" mode shows,
   schematically, how a fixed-depth step discards latent work.
   View 2, "Fixed vs adaptive depth": passes each position receives before it
   commits, fixed-depth DLM vs ALoDLM, for the same span.

   Data: window.ALODLM_TRACES (static/data/depth_traces.js). The span is found
   by its exact token strings, and pieces are merged into one display unit only
   when they share a recorded pass. Any mismatch throws, so mount() restores the
   static fallback instead of showing wrong data.
   ========================================================================== */
(function () {
  'use strict';

  var A = window.ALODLM;
  if (!A) { return; }
  var h = A.h;
  var doc = document;

  /* --------------------------------------------------------------- the span
     "- Daily revenue: \(9 \times 2 = 18\)." from case-study response (a).
     ANCHOR[0] (" Daily") is the last token of the committed context. */
  var EXAMPLE_ID = 'gsm8k_000';
  var ANCHOR = [' Daily', ' revenue', ':', ' \\(', '9', ' \\', 'times', ' ', '2', ' =', ' ', '1', '8', '\\', ').\n\n'];
  /* Display units, as offsets into ANCHOR. Multi-token units: "\times" (with the
     following space), "=" (with the following space), "18" (digits "1" "8") and
     "\)." (with its newlines). Each group must share one recorded pass. */
  var GROUPS = [[1], [2], [3], [4], [5, 6, 7], [8], [9, 10], [11, 12], [13, 14]];
  var CONTEXT_TOKENS = 10;

  function findAnchor(tokens) {
    for (var i = 0; i + ANCHOR.length <= tokens.length; i++) {
      var ok = true;
      for (var k = 0; k < ANCHOR.length; k++) {
        if (!tokens[i + k] || tokens[i + k][0] !== ANCHOR[k]) { ok = false; break; }
      }
      if (ok) { return i; }
    }
    return -1;
  }

  function buildSpan(T) {
    if (!T || !T.meta || !Array.isArray(T.examples)) { throw new Error('trace data missing'); }
    var ex = null;
    T.examples.forEach(function (e) { if (e && e.id === EXAMPLE_ID) { ex = e; } });
    if (!ex || !Array.isArray(ex.tokens)) { throw new Error('example ' + EXAMPLE_ID + ' missing'); }
    var K = +T.meta.K;
    var i0 = findAnchor(ex.tokens);
    if (i0 < 0) { throw new Error('span not found in the recorded tokens'); }
    var raw = '';
    var units = GROUPS.map(function (g, idx) {
      var pieces = g.map(function (k) { return ex.tokens[i0 + k]; });
      var pass = pieces[0][1];
      pieces.forEach(function (p) {
        if (p[1] !== pass) { throw new Error('merged pieces do not share a pass'); }
      });
      if (!(pass >= 1 && pass <= K)) { throw new Error('pass out of range'); }
      var text = pieces.map(function (p) { return p[0]; }).join('');
      raw += text;
      return { i: idx, text: text.trim(), pass: pass };
    });
    var ctx = ex.tokens.slice(Math.max(0, i0 - CONTEXT_TOKENS), i0 + 1)
      .map(function (t) { return t[0]; }).join('');
    function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
    return {
      units: units,
      context: '\u2026 ' + norm(ctx),
      written: norm(raw),
      K: K,
      q: +T.meta.q,
      tau: +T.meta.tau,
      panel: ex.paper_panel ? String(ex.paper_panel) : ''
    };
  }

  /* ----------------------------------------------------------- text helpers */
  var NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  function word(n) { return n < NUM.length ? NUM[n] : String(n); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* Screen readers often skip punctuation, so symbols get spoken names. */
  var SYM = {
    '\\': 'backslash', '(': 'open parenthesis', ')': 'close parenthesis', '.': 'period',
    ':': 'colon', '=': 'equals', ',': 'comma', '+': 'plus', '-': 'minus', '{': 'open brace',
    '}': 'close brace', '$': 'dollar'
  };
  function spoken(t) {
    var out = [];
    var run = '';
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (/[A-Za-z0-9]/.test(ch)) { run += ch; continue; }
      if (run) { out.push(run); run = ''; }
      if (SYM[ch]) { out.push(SYM[ch]); } else if (ch.trim()) { out.push(ch); }
    }
    if (run) { out.push(run); }
    return out.join(' ');
  }
  function tok(u) {
    return '<code class="ls-tok"><span aria-hidden="true">' + esc(u.text) + '</span><span class="sr-only">' + esc(spoken(u.text)) + '</span></code>';
  }
  function andList(items) {
    if (items.length < 2) { return items.join(''); }
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }
  function wordCount(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, 'x').split(/\s+/).filter(Boolean).length;
  }

  var TAU = '<var>&tau;</var>';
  var QV = '<var>q</var>';
  var KV = '<var>K</var>';
  var SV = '<var>s</var>';
  var EMB = 'Emb(<var>&ycirc;</var>)';
  function hsup(n) { return '<var>h</var><sup>(' + n + ')</sup>'; }

  /* ------------------------------------------------------------- frames */
  /* Qualitative halting-meter levels (no numbers are shown): they stay below the
     q tick while the loop continues; at s = K the gate's halting probability is 1. */
  var METER_LEVELS = [0.17, 0.31, 0.43];

  function aloFrames(span) {
    var U = span.units;
    var K = span.K;
    var maxPass = Math.max.apply(null, U.map(function (u) { return u.pass; }));
    var frames = [];

    frames.push({
      key: 'input', label: 'Step input', dot: 'Step input',
      on: {}, pips: 0, meter: 'idle', lvl: 0,
      chip: function () { return { s: 'mask' }; },
      desc: 'A denoising step begins. The positions still to be decoded are [MASK]; the text before them is already committed and serves as context.'
    });
    frames.push({
      key: 'prelude', label: 'Prelude', dot: 'Prelude',
      on: { pre: 1 }, pips: 0, meter: 'idle', lvl: 0,
      chip: function () { return { s: 'latent', d: 0 }; },
      desc: 'The Prelude encodes the sequence once per step, giving the initial recurrent state ' + hsup(0) + '; each masked position starts from its [MASK] embedding.'
    });

    for (var s = 1; s <= maxPass; s++) {
      frames.push(passFrame(s));
    }

    function passFrame(s) {
      var newly = U.filter(function (u) { return u.pass === s; });
      var before = U.filter(function (u) { return u.pass < s; }).length;
      var left = U.filter(function (u) { return u.pass > s; }).length;
      var last = s === maxPass;
      var n = newly.length;
      var one = n === 1;
      var desc;
      if (!n) {
        desc = (s === 1
          ? 'Pass 1: the shared Recurrent Core updates every position, and the Coda readout feeds the LM head and the exit gate. '
          : 'Pass ' + s + ': ') +
          'No position has predictive entropy &le; ' + TAU + ' yet and the mean cumulative halting probability is below ' + QV + ', so the loop continues.';
      } else if (!last && !before) {
        desc = 'Pass ' + s + ': ' + (n <= 3 ? andList(newly.map(tok)) : cap(word(n)) + ' positions') +
          (one ? ' reaches' : ' reach') + ' entropy &le; ' + TAU + ', so ' + (one ? 'it is' : 'they are') +
          ' sampled and committed; from the next pass on ' + (one ? 'it is fed back as a token embedding' : 'they are fed back as token embeddings') +
          ', ' + EMB + '. The other ' + word(left) + ' positions keep their latent states and keep refining.';
      } else if (!last) {
        desc = 'Pass ' + s + ': ' + (n <= 3 ? andList(newly.map(tok)) : word(n) + ' more positions') +
          (one ? ' reaches' : ' reach') + ' entropy &le; ' + TAU + ' and ' + (one ? 'commits' : 'commit') +
          ', adding discrete context for the ' + word(left) + ' still unresolved. Those keep their latent states; their mean cumulative halting probability is still below ' + QV + ', so the loop continues.';
      } else {
        desc = 'Pass ' + s + ': ' +
          andList(newly.map(tok)) + (one ? ' reaches' : ' reach') + ' entropy &le; ' + TAU + ' and ' + (one ? 'commits' : 'commit') +
          '. The inner loop stops when no unresolved positions remain (as here), when the mean cumulative halting probability over unresolved positions reaches ' + QV + ', or at ' + SV + '&nbsp;=&nbsp;' + KV + '.';
      }
      return {
        key: 'pass' + s,
        label: 'Pass ' + s + ' / ' + K + (s === K ? ' = K' : ''),
        dot: 'Pass ' + s + ' of ' + K,
        on: { core: 1, coda: 1, lm: 1, gate: 1, w1: s === 1, w2: 1, w3: 1, w4: 1, gm: 1, emb: before + n > 0 && !last },
        pips: s,
        meter: last ? 'stop' : 'below',
        lvl: last ? 1 : METER_LEVELS[Math.min(s - 1, METER_LEVELS.length - 1)],
        stopAtK: last && s === K,
        chip: function (u) {
          if (u.pass < s) { return { s: 'done' }; }
          if (u.pass === s) { return { s: 'commit' }; }
          return { s: 'latent', d: s };
        },
        desc: desc
      };
    }

    frames.push({
      key: 'next', label: 'Next step', dot: 'Next step',
      on: { pre: 1 }, pips: 0, meter: 'reset', lvl: 0,
      chip: function () { return { s: 'done', written: true }; },
      desc: 'Committed tokens are written into the sequence and the next step re-initializes from it; latent states are not carried across steps. Positions still unresolved stay [MASK]; if nothing commits during a step, the lowest-entropy position is committed.'
    });
    return frames;
  }

  function stdFrames(span) {
    var minPass = Math.min.apply(null, span.units.map(function (u) { return u.pass; }));
    function kept(u) { return u.pass === minPass; }
    return [
      {
        key: 'input', label: 'Step input', dot: 'Step input', on: {},
        chip: function () { return { s: 'mask' }; },
        desc: 'A standard DLM starts the same denoising step from the same masked positions.'
      },
      {
        key: 'pass', label: 'Fixed-depth pass', dot: 'One fixed-depth pass', on: { den: 1, wd: 1 },
        chip: function () { return { s: 'latent', d: -1 }; },
        desc: 'It runs one forward pass of the same fixed-depth denoiser for every masked position. There is no inner loop and no exit gate.'
      },
      {
        key: 'readout', label: 'Readout', dot: 'Readout', on: { lm: 1, wd: 1 },
        chip: function (u) { return kept(u) ? { s: 'kept' } : { s: 'defer' }; },
        desc: 'The LM head reads out every position. Confident positions commit; the rest are deferred to a later denoising step. Which positions commit here is schematic.'
      },
      {
        key: 'end', label: 'End of step', dot: 'End of step', on: {},
        chip: function (u) { return kept(u) ? { s: 'kept' } : { s: 'redo' }; },
        desc: 'The step ends after that single pass. The latent computation for each deferred position is discarded: it reverts to [MASK] and is recomputed from its mask embedding at the next step.'
      }
    ];
  }

  /* ---------------------------------------------------------- tiny icons */
  function strokeIcon(paths, cls) {
    var s = A.svg('svg', { 'class': cls || 'ls-ico', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    paths.forEach(function (d) {
      s.appendChild(A.svg('path', {
        d: d, fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2',
        'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      }));
    });
    return s;
  }
  var ICON = {
    prev: function () { return strokeIcon(['M14.5 5.5 8 12l6.5 6.5']); },
    next: function () { return strokeIcon(['M9.5 5.5 16 12l-6.5 6.5']); },
    play: function () {
      var s = A.svg('svg', { 'class': 'ls-ico', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
      s.appendChild(A.svg('path', { d: 'M8 5.6v12.8a.8.8 0 0 0 1.2.7l10-6.4a.8.8 0 0 0 0-1.4l-10-6.4A.8.8 0 0 0 8 5.6z', fill: 'currentColor' }));
      return s;
    },
    pause: function () {
      var s = A.svg('svg', { 'class': 'ls-ico', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
      s.appendChild(A.svg('rect', { x: '6.5', y: '5', width: '3.6', height: '14', rx: '1', fill: 'currentColor' }));
      s.appendChild(A.svg('rect', { x: '13.9', y: '5', width: '3.6', height: '14', rx: '1', fill: 'currentColor' }));
      return s;
    },
    replay: function () { return strokeIcon(['M4.5 12a7.5 7.5 0 1 0 2.2-5.3', 'M4.2 4.4v4.2h4.2']); },
    check: function () { return strokeIcon(['m5 12.5 4.5 4.5L19 7.5'], 'ls-ico ls-ico--sm'); }
  };

  /* ================================================================ mount */
  A.mount('loop-stepper', function (root) {
    var span = buildSpan(A.data.traces);
    var U = span.units;
    var K = span.K;
    var FR = { alodlm: aloFrames(span), standard: stdFrames(span) };
    var MAXF = Math.max(FR.alodlm.length, FR.standard.length);
    var passes = U.map(function (u) { return u.pass; });
    var minPass = Math.min.apply(null, passes);
    var maxPass = Math.max.apply(null, passes);

    var st = {
      view: 0,
      mode: 'alodlm',
      frame: A.prefersReducedMotion() ? FR.alodlm.length - 1 : 0,
      playing: false,
      auto: false,
      autoDone: false,
      touched: false,
      visible: false,
      pageVisible: !doc.hidden,
      elapsed: 0,
      lastT: 0,
      raf: 0,
      sweep: K,
      sweeping: false,
      sweepElapsed: 0,
      sweepShown: false,
      lastDesc: ''
    };

    /* ------------------------------------------------------ card + tabs */
    var tabs = [];
    var panels = [];
    var VIEW_NAMES = [
      { full: 'One denoising step', short: 'One step' },
      { full: 'Fixed vs adaptive depth', short: 'Fixed vs adaptive' }
    ];
    var tablist = h('div', { 'class': 'seg ls-tabs', role: 'tablist', 'aria-label': 'Method explainer' });
    VIEW_NAMES.forEach(function (v, i) {
      var t = h('button', {
        type: 'button', 'class': 'seg__btn ls-tab', role: 'tab', id: 'ls-tab-' + i,
        'aria-controls': 'ls-panel-' + i, 'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? '0' : '-1'
      }, h('span', { 'class': 'ls-tab__full' }, v.full), h('span', { 'class': 'ls-tab__short', 'aria-hidden': 'true' }, v.short));
      tabs.push(t);
      tablist.appendChild(t);
    });

    var card = h('div', { 'class': 'ls-card' });
    card.appendChild(h('div', { 'class': 'ls-top' }, tablist,
      h('span', { 'class': 'ls-top__tag' }, h('span', { 'class': 'ls-top__dot', 'aria-hidden': 'true' }),
      'Recorded span' + (span.panel ? ', paper Fig. 6 (' + span.panel + ')' : ''))));
    var views = h('div', { 'class': 'ls-views' });
    card.appendChild(views);

    /* ============================================== view 1: step-through */
    var p1 = h('div', {
      'class': 'ls-panel ls-step is-active', role: 'tabpanel', id: 'ls-panel-0',
      'aria-labelledby': 'ls-tab-0', 'data-mode': 'alodlm'
    });
    panels.push(p1);

    // Header: step dots (roving tabindex) + frame label
    var dotsWrap = h('div', { 'class': 'ls-dots', role: 'group', 'aria-label': 'Steps' });
    var dots = [];
    for (var di = 0; di < MAXF; di++) {
      (function (i) {
        var b = h('button', { type: 'button', 'class': 'ls-dot', tabindex: '-1' });
        b.addEventListener('click', function () { touch(); pause(); go(i); });
        dots.push(b);
        dotsWrap.appendChild(b);
      })(di);
    }
    var label = h('span', { 'class': 'ls-label' });
    var schematic = h('span', { 'class': 'ls-schem' }, 'schematic');
    p1.appendChild(h('div', { 'class': 'ls-head' }, dotsWrap, h('span', { 'class': 'ls-head__right' }, schematic, label)));

    // Stage
    var stage = h('div', {
      'class': 'ls-stage', tabindex: '0', role: 'group',
      'aria-label': 'Inside one denoising step. Use the left and right arrow keys to move between steps.'
    });
    p1.appendChild(stage);

    // Mode toggle + settings
    var modeBtns = {};
    var modeSeg = h('div', { 'class': 'seg ls-mode', role: 'group', 'aria-label': 'Decoder' });
    [['standard', 'Standard DLM'], ['alodlm', 'ALoDLM']].forEach(function (m) {
      var b = h('button', { type: 'button', 'class': 'seg__btn', 'aria-pressed': m[0] === st.mode ? 'true' : 'false' }, m[1]);
      b.addEventListener('click', function () { touch(); setMode(m[0]); });
      modeBtns[m[0]] = b;
      modeSeg.appendChild(b);
    });
    var settings = h('span', {
      'class': 'chip chip--muted ls-settings',
      html: '<var>K</var> = ' + K + ' &middot; <var>&tau;</var> = ' + span.tau + ' &middot; <var>q</var> = ' + span.q,
      title: 'Decoding setting of the recorded trace'
    });
    stage.appendChild(h('div', { 'class': 'ls-row' }, modeSeg, settings));

    // Flow: architecture rails + halting meter, SVG wires drawn over them
    function blk(cls, name, sub) {
      return h('div', { 'class': 'ls-blk ls-blk--' + cls },
        h('span', { 'class': 'ls-blk__name' }, name),
        sub ? h('span', { 'class': 'ls-blk__sub' }, sub) : null);
    }
    var pips = h('span', { 'class': 'ls-pips', 'aria-hidden': 'true', 'data-n': '0' });
    for (var pi = 0; pi < K; pi++) { pips.appendChild(h('i')); }
    var B = {
      pre: blk('prelude', 'Prelude', 'once per step'),
      core: h('div', { 'class': 'ls-blk ls-blk--core' },
        h('span', { 'class': 'ls-blk__name' }, 'Recurrent Core', A.icon('loop', 'ls-blk__loop')),
        pips),
      coda: blk('coda', 'Coda', 'readout'),
      lm: h('div', { 'class': 'ls-blk ls-blk--lm' },
        h('span', { 'class': 'ls-blk__name' }, 'LM head'),
        h('span', { 'class': 'ls-blk__sub', html: 'entropy &le; <var>&tau;</var>' })),
      gate: blk('gate', 'Exit gate', 'halting')
    };
    var railAlo = h('div', { 'class': 'ls-rail ls-rail--alo' }, B.pre, B.core, B.coda,
      h('div', { 'class': 'ls-heads' }, B.lm, B.gate));
    var embLabel = h('span', { 'class': 'ls-emblabel', html: 'Emb(<var>&ycirc;</var>)<span class="ls-emblabel__x"> &middot; committed tokens</span>' });

    var wiresAlo = A.svg('svg', { 'class': 'ls-wires', 'aria-hidden': 'true', focusable: 'false' });
    var W = {};
    var WH = {};
    ['w1', 'w2', 'w34', 'w3', 'w4', 'emb', 'gm'].forEach(function (k) {
      W[k] = A.svg('path', { 'class': 'ls-wire' + (k === 'emb' ? ' ls-wire--emb' : '') });
      wiresAlo.appendChild(W[k]);
    });
    ['w1', 'w2', 'w3', 'w4', 'emb', 'gm'].forEach(function (k) {
      WH[k] = A.svg('path', { 'class': 'ls-wirehead' + (k === 'emb' ? ' ls-wire--emb' : '') });
      wiresAlo.appendChild(WH[k]);
    });
    var varAlo = h('div', {
      'class': 'ls-variant ls-variant--alo', role: 'img',
      'aria-label': 'ALoDLM: the Prelude, then the Recurrent Core, looped for at most K = ' + K +
        ' recurrent passes (the maximum recurrent depth), then the Coda readout, which feeds the LM head and the exit gate. Committed tokens return to the core as token embeddings; the exit gate drives the halting meter.'
    }, wiresAlo, embLabel, railAlo);

    var meterFill = h('span', { 'class': 'ls-meter__fill' });
    var meterTrack = h('span', { 'class': 'ls-meter__track' }, meterFill,
      h('span', { 'class': 'ls-meter__q', style: { '--q': String(span.q) } }, h('var', null, 'q')));
    var meterStatus = h('span', { 'class': 'ls-meter__status' });
    var meter = h('div', { 'class': 'ls-meter', role: 'img', 'data-state': 'idle' },
      meterTrack,
      h('span', { 'class': 'ls-meter__head' },
        h('span', { 'class': 'ls-meter__title' }, 'Mean cumulative halting probability',
          h('span', { 'class': 'ls-meter__over' }, ' over unresolved positions')),
        meterStatus));

    var SB = {
      den: blk('den', 'Fixed-depth denoiser', 'all layers, one pass per step'),
      lm: blk('lm', 'LM head', 'commit if confident')
    };
    var wiresStd = A.svg('svg', { 'class': 'ls-wires', 'aria-hidden': 'true', focusable: 'false' });
    var WS = A.svg('path', { 'class': 'ls-wire' });
    var WSH = A.svg('path', { 'class': 'ls-wirehead' });
    wiresStd.appendChild(WS);
    wiresStd.appendChild(WSH);
    var varStd = h('div', {
      'class': 'ls-variant ls-variant--std', role: 'img',
      'aria-label': 'Standard DLM: one pass of a fixed-depth denoiser over all layers, then the LM head. No inner loop and no exit gate.'
    }, wiresStd, h('div', { 'class': 'ls-rail ls-rail--std' }, SB.den, SB.lm));

    var flow = h('div', { 'class': 'ls-flow' },
      h('div', { 'class': 'ls-stack' }, varAlo, varStd),
      h('div', { 'class': 'ls-stack ls-stack--meter' },
        h('div', { 'class': 'ls-variant ls-variant--alo' }, meter),
        h('p', { 'class': 'ls-variant ls-variant--std ls-nogate' },
          h('strong', null, 'No exit gate.'), ' A standard DLM always ends the step after one fixed-depth pass.')));
    stage.appendChild(flow);

    // Sequence: committed context + unit chips
    var ctxNew = h('span', { 'class': 'ls-ctx__new' }, ' ' + span.written);
    var ctxText = h('code', { 'class': 'ls-ctx__text' }, span.context, ctxNew);
    var chipEls = [];
    var chipList = h('ul', { 'class': 'ls-chips', 'aria-label': 'Positions in this step' });
    U.forEach(function (u, i) {
      var sr = h('span', { 'class': 'sr-only' });
      var sup = h('sup', { 'class': 'ls-chip__sup' });
      var tag = h('span', { 'class': 'ls-chip__tag', 'aria-hidden': 'true' });
      var li = h('li', {
        'class': 'ls-chip', 'data-s': 'mask', 'data-pass': String(u.pass),
        style: { '--len': String(Math.max(3, u.text.length)) }
      }, sr,
      h('span', { 'class': 'ls-chip__box', 'aria-hidden': 'true' },
        h('span', { 'class': 'ls-chip__face ls-chip__face--mask' }, '[M]'),
        h('span', { 'class': 'ls-chip__face ls-chip__face--latent' }, h('span', { 'class': 'ls-chip__h' }, 'h'), sup),
        h('span', { 'class': 'ls-chip__face ls-chip__face--tok' }, u.text)),
      tag);
      chipEls.push({ li: li, sr: sr, sup: sup, tag: tag, u: u, n: i + 1, spoken: spoken(u.text) });
      chipList.appendChild(li);
    });
    var ghost = h('li', { 'class': 'ls-chip ls-chip--ghost', 'aria-hidden': 'true' },
      h('span', { 'class': 'ls-chip__box' }, h('span', { 'class': 'ls-chip__face' }, '[M]')),
      h('span', { 'class': 'ls-chip__tag' }, 'next'));
    chipList.appendChild(ghost);
    stage.appendChild(h('div', { 'class': 'ls-seq' },
      h('p', { 'class': 'ls-ctx' }, h('span', { 'class': 'ls-ctx__tag' }, 'Context'), ctxText),
      chipList));

    // Legend: the pass is given by number as well as by colour
    var legPasses = h('span', { 'class': 'legend__item ls-leg--alo' }, 'committed at pass');
    for (var lp = 1; lp <= K; lp++) {
      legPasses.appendChild(h('span', { 'class': 'ls-passno', 'data-pass': String(lp) }, String(lp)));
    }
    stage.appendChild(h('div', { 'class': 'legend ls-legend' },
      h('span', { 'class': 'legend__item' }, h('span', { 'class': 'ls-sw ls-sw--mask', 'aria-hidden': 'true' }, 'M'), '[MASK]'),
      h('span', { 'class': 'legend__item' }, h('span', { 'class': 'ls-sw ls-sw--latent', 'aria-hidden': 'true' }, 'h'), 'latent state'),
      h('span', { 'class': 'legend__item ls-leg--alo' }, h('span', { 'class': 'ls-sw ls-sw--commit', 'aria-hidden': 'true' }), 'commits now'),
      h('span', { 'class': 'legend__item ls-leg--std' }, h('span', { 'class': 'ls-sw ls-sw--kept', 'aria-hidden': 'true' }, ICON.check()), 'committed'),
      h('span', { 'class': 'legend__item ls-leg--std' }, h('span', { 'class': 'ls-sw ls-sw--defer', 'aria-hidden': 'true' }, 'h'), 'deferred'),
      legPasses));

    // Description: the live node sits over invisible sizers (one per frame of
    // both modes), so the box keeps the height of the longest text.
    var live = h('p', { 'class': 'ls-desc__live', 'aria-live': 'polite', 'aria-atomic': 'true' });
    var desc = h('div', { 'class': 'ls-desc' }, live);
    FR.alodlm.concat(FR.standard).forEach(function (f) {
      desc.appendChild(h('p', { 'class': 'ls-desc__sizer', 'aria-hidden': 'true', html: f.desc }));
    });
    stage.appendChild(desc);

    // Footer controls
    var prevBtn = h('button', { type: 'button', 'class': 'btn btn--sm ls-prev' }, ICON.prev(), h('span', null, 'Prev'));
    var playIcon = h('span', { 'class': 'ls-playicon' });
    var playText = h('span', null, 'Play');
    var playBtn = h('button', { type: 'button', 'class': 'btn btn--sm btn--primary ls-play' }, playIcon, playText);
    var nextText = h('span', null, 'Next');
    var nextBtn = h('button', { type: 'button', 'class': 'btn btn--sm ls-next' }, nextText, ICON.next());
    p1.appendChild(h('div', { 'class': 'ls-foot' }, prevBtn, playBtn, nextBtn,
      h('span', { 'class': 'ls-keys', 'aria-hidden': 'true' }, h('span', { 'class': 'kbd' }, '\u2190'), h('span', { 'class': 'kbd' }, '\u2192'))));
    views.appendChild(p1);

    /* =========================================== view 2: depth columns */
    var p2 = h('div', { 'class': 'ls-panel', role: 'tabpanel', id: 'ls-panel-1', 'aria-labelledby': 'ls-tab-1' });
    panels.push(p2);
    var cmpLabel = h('span', { 'class': 'ls-label' });
    p2.appendChild(h('div', { 'class': 'ls-head' },
      h('span', { 'class': 'ls-head__title' }, 'Same span, different depths'), cmpLabel));

    function axis() {
      var ax = h('span', { 'class': 'ls-plot__axis' });
      for (var k = 1; k <= K; k++) {
        ax.appendChild(h('span', { 'class': 'ls-plot__tick', style: { '--k': String(k) } }, h('span', { 'class': 'ls-plot__tlab' }, String(k))));
      }
      return ax;
    }

    function chart(kind) {
      var fixed = kind === 'fixed';
      var cols = [];
      var colsWrap = h('span', { 'class': 'ls-plot__cols' });
      U.forEach(function (u, i) {
        var cells = [];
        var stack = h('span', { 'class': 'ls-col__stack' });
        for (var k = 1; k <= K; k++) {
          var c = h('span', { 'class': 'ls-cell', 'data-on': 'off' });
          cells.push(c);
          stack.appendChild(c);
        }
        var val = h('span', { 'class': 'ls-col__val' });
        stack.appendChild(val);
        var col = h('span', {
          'class': 'ls-col', 'data-pass': fixed ? null : String(u.pass),
          'data-tip-pos': i >= U.length - 3 ? 'left' : null
        }, stack, h('span', { 'class': 'ls-col__lbl' }, u.text));
        cols.push({ el: col, cells: cells, val: val, u: u });
        colsWrap.appendChild(col);
      });
      var plot = h('div', { 'class': 'ls-plot', 'aria-hidden': 'true' }, axis(), colsWrap,
        fixed ? h('span', { 'class': 'ls-plot__over' }, 'step over after one pass')
              : h('span', { 'class': 'ls-plot__k', html: '<span><var>K</var> = ' + K + '</span>' }));
      var tbody = h('tbody');
      var rows = U.map(function (u) {
        var td = h('td');
        tbody.appendChild(h('tr', null, h('th', { scope: 'row' }, spoken(u.text)), td));
        return td;
      });
      // Table twin for assistive technology (the wrapper, not the table, is
      // visually hidden: a table ignores width: 1px and would overflow).
      var table = h('div', { 'class': 'sr-only' }, h('table', null,
        h('caption', null, fixed
          ? 'Fixed-depth DLM: passes each position receives in this denoising step'
          : 'ALoDLM: recurrent passes before each position commits (recorded commitment passes)'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Token'), h('th', { scope: 'col' }, 'Passes'))),
        tbody));
      var head = h('div', { 'class': 'ls-chart__head' },
        h('span', { 'class': 'ls-chart__name' }, fixed ? 'Fixed-depth DLM' : 'ALoDLM'),
        h('span', { 'class': 'ls-chart__sub' }, fixed ? 'passes in this step' : 'passes before commitment'));
      var capText = fixed
        ? 'Same depth for every masked position: one fixed-depth pass per step. A deferred position loses that latent work and restarts from [MASK] at the next step.'
        : 'Depth follows difficulty: a position keeps refining its latent state until it commits, here after ' +
          minPass + ' to ' + maxPass + ' recurrent passes (maximum recurrent depth ' + K + ').';
      var el = h('div', { 'class': 'ls-chart' }, head, plot, table, h('p', { 'class': 'ls-chart__cap' }, capText));
      return { el: el, cols: cols, rows: rows, plot: plot };
    }
    var chFixed = chart('fixed');
    var chAda = chart('ada');
    var cmpPasses = h('span', { 'class': 'legend__item' }, 'committed at pass');
    for (var cp = 1; cp <= K; cp++) {
      cmpPasses.appendChild(h('span', { 'class': 'ls-passno', 'data-pass': String(cp) }, String(cp)));
    }
    var cmpLegend = h('div', { 'class': 'legend ls-legend ls-cmplegend' },
      h('span', { 'class': 'legend__item' }, h('span', { 'class': 'ls-sw ls-sw--fixed', 'aria-hidden': 'true' }), 'fixed-depth pass'),
      h('span', { 'class': 'legend__item' }, h('span', { 'class': 'ls-sw ls-sw--cell', 'aria-hidden': 'true' }), 'recurrent pass, still refining'),
      h('span', { 'class': 'legend__item' }, h('span', { 'class': 'ls-sw ls-sw--commit', 'aria-hidden': 'true' }), 'commits at this pass'),
      cmpPasses);
    p2.appendChild(h('div', { 'class': 'ls-cmpstage' },
      h('div', { 'class': 'ls-charts' }, chFixed.el, chAda.el),
      cmpLegend,
      h('p', { 'class': 'ls-cmpnote' },
        'Columns count recurrent passes before commitment (one fixed-depth pass for the standard DLM), not FLOPs: execution is dense, so committed positions are still processed as context in later passes. The paper estimates cost from executed operations: at a matched 93.25% GSM8K accuracy, ALoDLM-8B needs 133.5 GFLOPs per generated token versus 154.6 for WeDLM-8B.')));

    var sweepSeg = h('div', { 'class': 'seg ls-sweep', role: 'group', 'aria-label': 'Show the state after recurrent pass' });
    var sweepBtns = [];
    for (var sp = 1; sp <= K; sp++) {
      (function (p) {
        var b = h('button', { type: 'button', 'class': 'seg__btn', 'aria-pressed': 'false', 'aria-label': 'After pass ' + p + ' of ' + K }, String(p));
        b.addEventListener('click', function () { st.touched = true; stopSweep(); setSweep(p); });
        sweepBtns.push(b);
        sweepSeg.appendChild(b);
      })(sp);
    }
    var sweepReplay = h('button', { type: 'button', 'class': 'btn btn--sm ls-sweepreplay' }, ICON.replay(), h('span', null, 'Replay'));
    sweepReplay.addEventListener('click', function () { st.touched = true; startSweep(); });
    p2.appendChild(h('div', { 'class': 'ls-foot' },
      h('span', { 'class': 'ls-foot__lab', 'aria-hidden': 'true' }, 'After pass'), sweepSeg, sweepReplay));
    views.appendChild(p2);

    /* ------------------------------------------------------------ footnote */
    var footnote = h('p', { 'class': 'ls-footnote' },
      'Commitment passes are recorded values for this span of a real ALoDLM-8B GSM8K response; placing these tokens in a single denoising step is illustrative. ' +
      'Tokens are shown as generated (LaTeX source).');

    root.appendChild(h('div', { 'class': 'ls', style: { '--kmax': String(K) } },
      h('div', { 'class': 'ls-frame' }, h('div', { 'class': 'ls-backdrop', 'aria-hidden': 'true' }), card),
      footnote));

    /* =========================================================== behaviour */
    function frames() { return FR[st.mode]; }
    function isLast() { return st.frame === frames().length - 1; }

    function setView(i, focus) {
      if (i === st.view) { return; }
      st.view = i;
      tabs.forEach(function (t, k) {
        t.setAttribute('aria-selected', k === i ? 'true' : 'false');
        t.setAttribute('tabindex', k === i ? '0' : '-1');
      });
      panels.forEach(function (p, k) {
        var on = k === i;
        p.classList.toggle('is-active', on);
        if (on) { p.removeAttribute('inert'); p.removeAttribute('aria-hidden'); }
        else { p.setAttribute('inert', ''); p.setAttribute('aria-hidden', 'true'); }
      });
      if (focus) { tabs[i].focus(); }
      if (i === 1) {
        pause();
        if (!st.sweepShown) {
          st.sweepShown = true;
          startSweep();
        }
      } else if (st.sweeping) {
        stopSweep();
        setSweep(K);
      }
      layout();
      kick();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { touch(); setView(i, false); });
      t.addEventListener('keydown', function (e) {
        var n = tabs.length;
        var j = -1;
        if (e.key === 'ArrowRight') { j = (i + 1) % n; }
        else if (e.key === 'ArrowLeft') { j = (i - 1 + n) % n; }
        else if (e.key === 'Home') { j = 0; }
        else if (e.key === 'End') { j = n - 1; }
        if (j > -1) { e.preventDefault(); touch(); setView(j, true); }
      });
    });

    function setMode(m) {
      if (m === st.mode) { return; }
      pause();
      st.mode = m;
      st.frame = 0;
      p1.setAttribute('data-mode', m);
      Object.keys(modeBtns).forEach(function (k) {
        modeBtns[k].setAttribute('aria-pressed', k === m ? 'true' : 'false');
      });
      render(true);
      layout();
    }

    function go(i, quiet) {
      st.frame = Math.max(0, Math.min(frames().length - 1, i));
      st.elapsed = 0;
      render(!quiet);
    }

    var METER_STATUS = {
      idle: 'not started',
      below: 'below q: continue',
      stop: 'loop ends',
      reset: 'reset for the next step'
    };
    var METER_SR = {
      idle: 'not started',
      below: 'rising but still below the exit threshold q, so the loop continues',
      stop: 'the loop ends',
      reset: 'reset; the next step starts again'
    };

    function render(announce) {
      var fs = frames();
      var f = fs[st.frame];
      var n = fs.length;
      var alo = st.mode === 'alodlm';
      var on = f.on || {};

      label.textContent = f.label;
      dots.forEach(function (d, i) {
        d.hidden = i >= n;
        if (i >= n) { return; }
        var cur = i === st.frame;
        d.setAttribute('aria-label', 'Step ' + (i + 1) + ' of ' + n + ': ' + fs[i].dot);
        if (cur) { d.setAttribute('aria-current', 'step'); } else { d.removeAttribute('aria-current'); }
        d.classList.toggle('is-past', i < st.frame);
        d.setAttribute('tabindex', cur ? '0' : '-1');
      });

      if (alo) {
        Object.keys(B).forEach(function (k) { B[k].classList.toggle('is-on', !!on[k]); });
        Object.keys(W).forEach(function (k) { W[k].classList.toggle('is-on', !!on[k === 'w34' ? 'w3' : k]); });
        Object.keys(WH).forEach(function (k) { WH[k].classList.toggle('is-on', !!on[k]); });
        embLabel.classList.toggle('is-on', !!on.emb);
        pips.setAttribute('data-n', String(f.pips || 0));
        meter.setAttribute('data-state', f.meter);
        meterFill.style.setProperty('--lvl', String(f.lvl || 0));
        meterStatus.textContent = f.meter === 'stop' && f.stopAtK ? 'loop ends at s = K' : METER_STATUS[f.meter];
        meter.setAttribute('aria-label', 'Mean cumulative halting probability over unresolved positions: ' +
          (f.meter === 'stop' && f.stopAtK ? 'the loop ends; at s = K the exit gate halts with probability 1' : METER_SR[f.meter]));
      } else {
        SB.den.classList.toggle('is-on', !!on.den);
        SB.lm.classList.toggle('is-on', !!on.lm);
        WS.classList.toggle('is-on', !!on.wd);
        WSH.classList.toggle('is-on', !!on.wd);
      }

      chipEls.forEach(function (c) {
        var cs = f.chip(c.u);
        var tag = '';
        var sr = 'Position ' + c.n + ': ';
        c.li.setAttribute('data-s', cs.s);
        c.li.classList.toggle('is-written', !!cs.written);
        c.sup.textContent = cs.s === 'latent' && cs.d >= 0 ? '(' + cs.d + ')' : '';
        if (cs.s === 'mask') { sr += 'masked'; }
        else if (cs.s === 'latent') { sr += cs.d >= 0 ? 'latent state h(' + cs.d + ')' : 'latent state'; }
        else if (cs.s === 'commit') { tag = 's=' + c.u.pass; sr += c.spoken + ', commits at pass ' + c.u.pass + ' of ' + K; }
        else if (cs.s === 'done') { tag = 's=' + c.u.pass; sr += c.spoken + ', committed at pass ' + c.u.pass + ' of ' + K; }
        else if (cs.s === 'kept') { tag = '\u2713'; sr += c.spoken + ', committed'; }
        else if (cs.s === 'defer') { tag = 'defer'; sr += 'deferred'; }
        else if (cs.s === 'redo') { tag = 'redo'; sr += 'deferred; latent work discarded, back to [MASK]'; }
        c.tag.textContent = tag;
        c.sr.textContent = sr;
      });
      var written = alo && f.key === 'next';
      ghost.classList.toggle('is-on', written);
      ctxNew.classList.toggle('is-on', written);

      live.setAttribute('aria-live', announce ? 'polite' : 'off');
      if (st.lastDesc !== f.desc) {
        st.lastDesc = f.desc;
        live.innerHTML = f.desc;
      }

      setDisabled(prevBtn, st.frame === 0);
      var toAlo = !alo && st.frame === n - 1;
      nextText.textContent = toAlo ? 'See ALoDLM' : 'Next';
      nextBtn.setAttribute('data-action', toAlo ? 'alodlm' : 'next');
      setDisabled(nextBtn, alo && st.frame === n - 1);
      syncPlay();
    }

    function setDisabled(btn, dis) {
      if (dis) { btn.setAttribute('aria-disabled', 'true'); } else { btn.removeAttribute('aria-disabled'); }
    }

    function syncPlay() {
      var state = st.playing ? 'pause' : (isLast() ? 'replay' : 'play');
      if (playBtn.getAttribute('data-state') === state) { return; }
      playBtn.setAttribute('data-state', state);
      playIcon.textContent = '';
      playIcon.appendChild(ICON[state]());
      playText.textContent = state === 'pause' ? 'Pause' : state === 'replay' ? 'Replay' : 'Play';
    }

    /* ----------------------------------------------------- playback loop */
    function dwell() {
      var f = frames()[st.frame];
      return Math.min(6400, Math.max(2400, 1500 + 62 * wordCount(f.desc)));
    }
    function canPlay() { return st.visible && st.pageVisible && st.view === 0; }
    function canSweep() { return st.visible && st.pageVisible && st.view === 1; }

    function tick(t) {
      st.raf = 0;
      var dt = st.lastT ? Math.min(t - st.lastT, 120) : 0;
      st.lastT = t;
      if (st.playing && canPlay()) {
        st.elapsed += dt;
        if (st.elapsed >= dwell()) {
          go(st.frame + 1, st.auto);
          if (isLast()) {
            st.playing = false;
            st.auto = false;
            syncPlay();
          }
        }
      }
      if (st.sweeping && canSweep()) {
        st.sweepElapsed += dt;
        if (st.sweepElapsed >= 900) {
          st.sweepElapsed = 0;
          setSweep(Math.min(K, st.sweep + 1));
          if (st.sweep >= K) { st.sweeping = false; }
        }
      }
      if ((st.playing && canPlay()) || (st.sweeping && canSweep())) {
        st.raf = requestAnimationFrame(tick);
      } else {
        st.lastT = 0;
      }
    }
    function kick() {
      if (!st.raf && ((st.playing && canPlay()) || (st.sweeping && canSweep()))) {
        st.lastT = 0;
        st.raf = requestAnimationFrame(tick);
      }
    }

    function play(auto) {
      st.auto = !!auto;
      st.playing = true;
      st.elapsed = 0;
      if (isLast()) { go(0, st.auto); }
      live.setAttribute('aria-live', st.auto ? 'off' : 'polite');
      syncPlay();
      kick();
    }
    function pause() {
      if (!st.playing) { return; }
      st.playing = false;
      st.auto = false;
      live.setAttribute('aria-live', 'polite');
      syncPlay();
    }
    function touch() {
      st.touched = true;
      if (st.auto) { pause(); }
    }

    prevBtn.addEventListener('click', function () {
      touch(); pause();
      if (st.frame > 0) { go(st.frame - 1); }
    });
    nextBtn.addEventListener('click', function () {
      touch(); pause();
      if (nextBtn.getAttribute('data-action') === 'alodlm') { setMode('alodlm'); return; }
      if (!isLast()) { go(st.frame + 1); }
    });
    playBtn.addEventListener('click', function () {
      st.touched = true;
      if (st.playing) { pause(); return; }
      play(false);
    });

    p1.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) { return; }
      var n = frames().length;
      var j = -1;
      if (e.key === 'ArrowRight') { j = Math.min(n - 1, st.frame + 1); }
      else if (e.key === 'ArrowLeft') { j = Math.max(0, st.frame - 1); }
      else if (e.key === 'Home') { j = 0; }
      else if (e.key === 'End') { j = n - 1; }
      if (j < 0) { return; }
      e.preventDefault();
      var onDot = dots.indexOf(doc.activeElement) > -1;
      touch(); pause();
      if (j !== st.frame) { go(j); }
      if (onDot) { dots[st.frame].focus(); }
    });

    /* ---------------------------------------------------- view 2 updates */
    function quoted(t) { return '\u201c' + t + '\u201d'; }
    function setSweep(p) {
      st.sweep = p;
      sweepBtns.forEach(function (b, i) { b.setAttribute('aria-pressed', i + 1 === p ? 'true' : 'false'); });
      cmpLabel.textContent = 'After pass ' + p + ' / ' + K;
      chFixed.el.classList.toggle('is-over', p >= 2);
      chFixed.cols.forEach(function (c, i) {
        c.cells.forEach(function (cell, k) { cell.setAttribute('data-on', k === 0 ? 'fixed' : 'off'); });
        c.el.setAttribute('data-n', '1');
        c.el.style.setProperty('--n', '1');
        c.el.setAttribute('data-tip', quoted(c.u.text) + ': 1 pass in this step');
        chFixed.rows[i].textContent = '1';
      });
      chAda.cols.forEach(function (c, i) {
        var s = c.u.pass;
        var done = s <= p;
        var nOn = Math.min(p, s);
        c.cells.forEach(function (cell, k) {
          cell.setAttribute('data-on', k < nOn ? (done ? 'done' : 'latent') : 'off');
        });
        c.el.classList.toggle('is-new', s === p);
        c.el.setAttribute('data-n', String(nOn));
        c.el.style.setProperty('--n', String(nOn));
        c.val.textContent = done ? String(s) : '';
        c.el.setAttribute('data-tip', done
          ? quoted(c.u.text) + ': committed after pass ' + s + ' of ' + K
          : quoted(c.u.text) + ': still refining after pass ' + p);
        chAda.rows[i].textContent = done ? s + ' (committed)' : 'more than ' + p + ' (still refining)';
      });
    }
    function startSweep() {
      if (A.prefersReducedMotion()) { stopSweep(); setSweep(K); return; }
      setSweep(1);
      st.sweeping = true;
      st.sweepElapsed = 0;
      kick();
    }
    function stopSweep() { st.sweeping = false; }

    /* ----------------------------------------------------- wire geometry */
    function box(el, base) {
      var r = el.getBoundingClientRect();
      return {
        l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top,
        cx: (r.left + r.right) / 2 - base.left, cy: (r.top + r.bottom) / 2 - base.top
      };
    }
    function n1(v) { return Math.round(v * 10) / 10; }
    function arrow(x, y, dir) {
      var a = 4.5;
      var b = 6;
      if (dir === 'right') { return 'M' + n1(x) + ',' + n1(y) + 'L' + n1(x - b) + ',' + n1(y - a) + 'L' + n1(x - b) + ',' + n1(y + a) + 'Z'; }
      return 'M' + n1(x) + ',' + n1(y) + 'L' + n1(x - a) + ',' + n1(y - b) + 'L' + n1(x + a) + ',' + n1(y - b) + 'Z';
    }
    function layoutAlo() {
      var base = varAlo.getBoundingClientRect();
      if (!base.width) { return; }
      var pre = box(B.pre, base);
      var core = box(B.core, base);
      var coda = box(B.coda, base);
      var lm = box(B.lm, base);
      var gate = box(B.gate, base);
      var y = core.cy;
      var g = 2;
      W.w1.setAttribute('d', 'M' + n1(pre.r + g) + ',' + n1(y) + 'H' + n1(core.l - g - 4));
      WH.w1.setAttribute('d', arrow(core.l - g, y, 'right'));
      W.w2.setAttribute('d', 'M' + n1(core.r + g) + ',' + n1(y) + 'H' + n1(coda.l - g - 4));
      WH.w2.setAttribute('d', arrow(coda.l - g, y, 'right'));
      var xm = n1((coda.r + lm.l) / 2);
      W.w34.setAttribute('d', 'M' + n1(coda.r + g) + ',' + n1(y) + 'H' + xm);
      W.w3.setAttribute('d', 'M' + xm + ',' + n1(y) + 'V' + n1(lm.cy) + 'H' + n1(lm.l - g - 4));
      WH.w3.setAttribute('d', arrow(lm.l - g, lm.cy, 'right'));
      W.w4.setAttribute('d', 'M' + xm + ',' + n1(y) + 'V' + n1(gate.cy) + 'H' + n1(gate.l - g - 4));
      WH.w4.setAttribute('d', arrow(gate.l - g, gate.cy, 'right'));
      var yTop = n1(Math.max(9, Math.min(lm.t, core.t) - 16));
      W.emb.setAttribute('d', 'M' + n1(lm.cx) + ',' + n1(lm.t - g) + 'V' + yTop + 'H' + n1(core.cx) + 'V' + n1(core.t - g - 4));
      WH.emb.setAttribute('d', arrow(core.cx, core.t - g, 'down'));
      embLabel.style.left = n1((core.cx + lm.cx) / 2) + 'px';
      embLabel.style.top = yTop + 'px';
      var mt = meterTrack.getBoundingClientRect().top - base.top - 3;
      W.gm.setAttribute('d', 'M' + n1(gate.cx) + ',' + n1(gate.b + g) + 'V' + n1(mt - 4));
      WH.gm.setAttribute('d', arrow(gate.cx, mt, 'down'));
    }
    function layoutStd() {
      var base = varStd.getBoundingClientRect();
      if (!base.width) { return; }
      var den = box(SB.den, base);
      var lm = box(SB.lm, base);
      WS.setAttribute('d', 'M' + n1(den.r + 2) + ',' + n1(den.cy) + 'H' + n1(lm.l - 6));
      WSH.setAttribute('d', arrow(lm.l - 2, den.cy, 'right'));
    }
    /* Column labels: drop every other label to a second row when neighbours
       would touch (horizontal positions do not depend on the stagger). */
    function layoutLabels() {
      var lbls = chAda.cols.map(function (c) { return c.el.querySelector('.ls-col__lbl').getBoundingClientRect(); });
      if (!lbls.length || !lbls[0].width) { return; }
      var tight = false;
      for (var i = 0; i + 1 < lbls.length; i++) {
        if (lbls[i].right + 4 > lbls[i + 1].left) { tight = true; break; }
      }
      chFixed.plot.classList.toggle('is-stagger', tight);
      chAda.plot.classList.toggle('is-stagger', tight);
    }
    function layout() { layoutAlo(); layoutStd(); layoutLabels(); }

    /* ---------------------------------------------------------- hooks */
    /* Re-layout on size changes, one frame later (layout itself can change
       sizes, which must not feed back into the same observer callback). */
    var layoutQueued = 0;
    function queueLayout() {
      if (layoutQueued) { return; }
      layoutQueued = requestAnimationFrame(function () { layoutQueued = 0; layout(); });
    }
    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(queueLayout);
      ro.observe(flow);
      ro.observe(chAda.plot);
    } else {
      window.addEventListener('resize', queueLayout);
    }
    if (doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === 'function') {
      doc.fonts.ready.then(layout, function () {});
    }

    A.onVisible(root, function (vis) {
      st.visible = vis;
      if (vis && !st.autoDone && !st.touched && st.view === 0 && st.mode === 'alodlm' &&
          st.frame === 0 && !A.prefersReducedMotion()) {
        st.autoDone = true;
        play(true);
      }
      if (vis) { kick(); }
    }, 0.4);
    A.onPageVisibility(function (vis) { st.pageVisible = vis; if (vis) { kick(); } });
    A.onReducedMotionChange(function (reduced) {
      if (!reduced) { return; }
      if (st.auto) { pause(); }
      if (st.sweeping) { stopSweep(); setSweep(K); }
    });

    /* ---------------------------------------------------------- initial */
    p2.setAttribute('inert', '');
    p2.setAttribute('aria-hidden', 'true');
    setSweep(K);
    render(false);
    layout();

    /* Optional handle for scripted QA (no other globals). */
    window.ALODLM_LOOP_STEPPER = {
      state: function () {
        return { view: st.view, mode: st.mode, frame: st.frame, frames: frames().length, playing: st.playing, auto: st.auto, sweep: st.sweep };
      },
      go: function (i) { touch(); pause(); go(i); },
      mode: function (m) { touch(); setMode(m); },
      view: function (i) { touch(); setView(i, false); },
      sweep: function (p) { stopSweep(); setSweep(p); }
    };
  });
})();
