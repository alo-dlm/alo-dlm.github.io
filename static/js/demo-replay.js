/* ==========================================================================
   demo-replay.js: the hero "decoding replay" (an illustrative replay).
   Mount: #demo (data-widget="demo-replay"). Styles: static/css/demo-replay.css.
   Uses the shared helpers in window.ALODLM (static/js/site.js).

   Data: window.ALODLM_TRACES
     examples[i].tokens = [[text, s], ...]   s = recorded commitment pass 1..K
     throughput.points                       Fig. 1 (right): tok/s and accuracy

   Timing model (deterministic, one requestAnimationFrame loop, time based):
     - Both panes replay the same recorded ALoDLM-8B response of N tokens.
     - Simulated latency: T_ar = N / R_ar and T_alo = N / R_alo, with
       R_ar = 229.3 tok/s (vLLM-served Qwen3-8B) and R_alo = 612.4 tok/s
       (ALoDLM-8B), read from throughput.points (fallback constants below).
     - Playback is slowed SLOWMO x unless "Real time" is on.
     - Qwen3-8B pane: token j appears at (j + 1) / R_ar.
     - ALoDLM-8B pane: tokens are grouped into illustrative denoising steps of
       G consecutive tokens. A step runs P = (largest recorded pass in the
       step) recurrent passes, every pass lasts T_alo / sum(P) simulated
       seconds, and each token is committed at the end of its recorded pass,
       so text inside a step materialises out of order.
   Every token box is laid out once per example (future tokens are only
   hidden), so playback changes classes and never reflows the text.
   ========================================================================== */
(function () {
  'use strict';

  var A = window.ALODLM;
  if (!A) { return; }

  var K = 4;                 /* maximum recurrent depth of the traces */
  var SLOWMO = 6;            /* default slow-motion factor */
  var G = 16;                /* tokens per illustrative denoising step */
  var FOLLOW_PAD = 34;       /* px kept below the frontier when auto-scrolling */
  var MAX_FRAME_MS = 64;     /* long frames slow the replay instead of skipping */
  var EPS = 1e-9;
  var FALLBACK = { ar: 229.3, alo: 612.4, accAr: 93.03, accAlo: 93.25 };

  var TITLES = {
    gsm8k_000: 'Janet\u2019s ducks',
    gsm8k_001: 'Robe and fiber bolts',
    gsm8k_003: 'James\u2019s sprints',
    gsm8k_016: 'Two trains',
    gsm8k_055: 'Jean\u2019s lollipops',
    gsm8k_067: 'Treasure chest gems',
    gsm8k_084: 'Football wins',
    gsm8k_095: 'Girl scouts'
  };

  var SVGNS = 'http://www.w3.org/2000/svg';
  var NBSP = '\u00a0';
  var NNBSP = '\u202f';
  var TIMES = '\u00d7';
  var APPROX = '\u2248';
  var MIDDOT = '\u00b7';

  /* ------------------------------------------------------------ helpers */
  function clampPass(s) {
    var n = Math.round(+s) || 1;
    return n < 1 ? 1 : n > K ? K : n;
  }

  function fmtSec(t) { return t.toFixed(2) + NNBSP + 's'; }

  /* Fig. 1 (right) points: ALoDLM-8B and the vLLM-served Qwen3-8B baseline
     (the fastest Qwen3-8B AR point if the engine labels are ever dropped). */
  function readThroughput(T) {
    var out = { ar: FALLBACK.ar, alo: FALLBACK.alo, accAr: FALLBACK.accAr, accAlo: FALLBACK.accAlo };
    var pts = T && T.throughput && T.throughput.points;
    if (!pts || !pts.length) { return out; }
    var ar = null;
    pts.forEach(function (p) {
      if (!p || typeof p.tokps !== 'number' || !(p.tokps > 0)) { return; }
      if (p.ours) {
        out.alo = p.tokps;
        if (typeof p.acc === 'number') { out.accAlo = p.acc; }
      } else if (p.ar && p.model === 'Qwen3-8B') {
        var better = !ar || (p.engine === 'vLLM' && ar.engine !== 'vLLM') ||
          ((p.engine === 'vLLM') === (ar.engine === 'vLLM') && p.tokps > ar.tokps);
        if (better) { ar = p; }
      }
    });
    if (ar) {
      out.ar = ar.tokps;
      if (typeof ar.acc === 'number') { out.accAr = ar.acc; }
    }
    return out;
  }

  /* Event schedule for one response (see the header comment). */
  function buildSchedule(tokens, rAr, rAlo) {
    var N = tokens.length;
    var steps = [];
    var totalP = 0;
    for (var a = 0; a < N; a += G) {
      var b = Math.min(N, a + G);
      var P = 1;
      for (var j = a; j < b; j++) { P = Math.max(P, clampPass(tokens[j][1])); }
      steps.push({ a: a, b: b, P: P, c0: totalP });
      totalP += P;
    }
    var Talo = N / rAlo;
    var dt = Talo / totalP;               /* simulated seconds per recurrent pass */
    var ev = [];
    steps.forEach(function (s) {
      s.t0 = s.c0 * dt;
      s.t1 = (s.c0 + s.P) * dt;
      for (var p = 1; p <= s.P; p++) {
        var t = (s.c0 + p) * dt;
        for (var k = s.a; k < s.b; k++) {
          if (clampPass(tokens[k][1]) === p) { ev.push({ t: t, j: k, p: p }); }
        }
      }
    });
    return { N: N, Tar: N / rAr, Talo: Talo, dt: dt, steps: steps, ev: ev, passes: totalP };
  }

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  /* Small inline icons (the sprite has no play/pause/replay glyphs). */
  function glyph(kind) {
    var s = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', 'class': 'dr-ico dr-ico--' + kind });
    if (kind === 'play') {
      s.appendChild(svgEl('path', { d: 'M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4c.6-.4.6-1.4 0-1.8l-10-6.4C8.9 4.3 8 4.8 8 5.6z', fill: 'currentColor' }));
    } else if (kind === 'pause') {
      s.appendChild(svgEl('rect', { x: '6.5', y: '5', width: '4', height: '14', rx: '1.2', fill: 'currentColor' }));
      s.appendChild(svgEl('rect', { x: '13.5', y: '5', width: '4', height: '14', rx: '1.2', fill: 'currentColor' }));
    } else if (kind === 'replay') {
      var g = svgEl('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      g.appendChild(svgEl('path', { d: 'M3.6 12a8.4 8.4 0 1 0 2.46-5.94L3.6 8.5' }));
      g.appendChild(svgEl('path', { d: 'M3.6 3.8v4.7h4.7' }));
      s.appendChild(g);
    }
    return s;
  }

  function shortQuestion(q) {
    var words = String(q || '').split(/\s+/).slice(0, 4).join(' ');
    return words ? words + '\u2026' : 'GSM8K question';
  }

  /* ============================================================== widget */
  A.mount('demo', function (root) {
    var T = A.data.traces;
    if (!T || !T.examples || !T.examples.length) { throw new Error('ALODLM_TRACES is missing'); }
    var h = A.h;
    var doc = document;
    var meta = T.meta || {};

    var TP = readThroughput(T);
    var R_AR = TP.ar;
    var R_ALO = TP.alo;
    var SPEEDUP = (R_ALO / R_AR).toFixed(1);
    var SUFFIX = meta.instruction_suffix ||
      'Please reason step by step, and put your final answer within \\boxed{}.';

    var examples = T.examples.filter(function (e) { return e && e.tokens && e.tokens.length; });
    if (!examples.length) { throw new Error('ALODLM_TRACES has no token traces'); }
    var defIdx = 0;
    examples.some(function (e, i) {
      if (e.in_paper_figure && e.paper_panel === 'a') { defIdx = i; return true; }
      return false;
    });

    var reduced = A.prefersReducedMotion();
    var st = {
      idx: defIdx, ex: null, S: null,
      state: 'idle',          /* idle | playing | paused | done */
      pausedBy: null,         /* 'user' | 'auto' */
      sim: 0, last: 0, raf: 0,
      realtime: false,
      inView: false, pageVisible: !doc.hidden,
      arN: 0, aloN: 0, stepIdx: -1, evIdx: 0, pass: 0,
      counts: [0, 0, 0, 0, 0],
      aloDone: false, arDone: false,
      pane: 'alo',
      shown: {}               /* last painted strings / numbers */
    };

    /* ------------------------------------------------------------ DOM */
    var uid = 'dr' + Math.random().toString(36).slice(2, 7);


    function btn(cls, kind, label, aria) {
      return h('button', { type: 'button', 'class': 'dr-btn ' + cls, 'aria-label': aria || null },
        kind ? glyph(kind) : null,
        h('span', { 'class': 'dr-btn__txt' }, label));
    }

    function realtimeSwitch(extra) {
      return h('button', { type: 'button', 'class': 'dr-btn dr-switch ' + (extra || ''), role: 'switch', 'aria-checked': 'false' },
        h('span', { 'class': 'dr-switch__track', 'aria-hidden': 'true' }),
        h('span', { 'class': 'dr-switch__txt' }, 'Real time'));
    }

    /* Example selector: the paper's case-study responses first. */
    var select = h('select', { id: uid + '-ex', 'class': 'select dr-select' });
    var gPaper = h('optgroup', { label: 'Paper case study' });
    var gMore = h('optgroup', { label: 'More GSM8K responses' });
    examples.forEach(function (e, i) {
      var name = TITLES[e.id] || shortQuestion(e.question);
      var label = e.in_paper_figure && e.paper_panel ? name + ' (' + e.paper_panel + ')' : name;
      var opt = h('option', { value: String(i) }, label);
      (e.in_paper_figure ? gPaper : gMore).appendChild(opt);
    });
    if (gPaper.children.length) { select.appendChild(gPaper); }
    if (gMore.children.length) { select.appendChild(gMore); }
    select.value = String(defIdx);

    var playBtn = btn('dr-btn--play', 'pause', 'Pause', 'Pause replay');
    var replayBtn = btn('dr-btn--replay dr-btn--primary', 'replay', 'Replay', 'Replay from the start');
    var rtBar = realtimeSwitch('dr-switch--bar');
    var rtSeg = realtimeSwitch('dr-switch--seg');
    var switches = [rtBar, rtSeg];

    var bar = h('div', { 'class': 'dr-bar' },
      h('span', { 'class': 'dr-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('span', { 'class': 'dr-wintitle' }, 'GSM8K', h('span', { 'class': 'dr-wintitle__sep', 'aria-hidden': 'true' }, ' ' + MIDDOT + ' '), 'illustrative replay'),
      h('div', { 'class': 'dr-ctrls' },
        h('label', { 'class': 'visually-hidden', 'for': select.id }, 'GSM8K example'),
        select, playBtn, rtBar, replayBtn));

    /* Race bars (always visible, right under the window bar). */
    function raceRow(kind, name, tag, rate) {
      var fill = h('span', { 'class': 'dr-fill', 'aria-hidden': 'true' });
      var track = h('span', { 'class': 'dr-track' }, fill);
      var time = h('span', { 'class': 'dr-time__val' }, fmtSec(0));
      var done = h('span', { 'class': 'dr-time__ok', 'aria-hidden': 'true' }, A.icon('check', 'dr-time__ico'));
      var row = h('div', { 'class': 'dr-row dr-row--' + kind },
        h('span', { 'class': 'dr-name' }, h('span', { 'class': 'dr-name__main' }, name),
          tag ? h('span', { 'class': 'dr-name__tag' }, tag) : null),
        h('span', { 'class': 'dr-rate' }, rate),
        track,
        h('span', { 'class': 'dr-time' }, done, time));
      return { row: row, fill: fill, track: track, time: time };
    }
    var rateAr = R_AR.toFixed(1) + NNBSP + 'tok/s';
    var rateAlo = R_ALO.toFixed(1) + NNBSP + 'tok/s';
    var rowAr = raceRow('ar', 'Qwen3-8B', 'AR ' + MIDDOT + ' vLLM', rateAr);
    var rowAlo = raceRow('alo', 'ALoDLM-8B', '(ours)', rateAlo);

    var speedTxt = APPROX + SPEEDUP + TIMES + ' faster';
    var accTxt = 'GSM8K accuracy ' + TP.accAlo.toFixed(2) + '% vs ' + TP.accAr.toFixed(2) + '% (Fig.' + NNBSP + '1, right)';
    var badge = h('span', { 'class': 'dr-badge' },
      A.icon('bolt', 'dr-badge__ico'),
      h('strong', { 'class': 'dr-badge__speed' }, speedTxt),
      h('span', { 'class': 'dr-badge__acc' }, h('span', { 'class': 'dr-badge__sep', 'aria-hidden': 'true' }, MIDDOT), accTxt));
    rowAlo.track.appendChild(badge);
    var verdict = h('p', { 'class': 'dr-verdict' }, accTxt);

    var speedChip = h('span', { 'class': 'dr-speed' }, 'Slowed ' + SLOWMO + TIMES);
    var race = h('div', { 'class': 'dr-race' },
      h('div', { 'class': 'dr-race__head' },
        h('span', { 'class': 'dr-race__label' }, 'Simulated latency'),
        speedChip),
      rowAr.row, rowAlo.row, verdict);

    /* Mobile pane switcher (hidden from 768 px). */
    var segAlo = h('button', { type: 'button', 'class': 'seg__btn', 'aria-pressed': 'true', 'aria-controls': uid + '-alo' },
      'ALoDLM', h('span', { 'class': 'dr-xs-hide' }, '-8B'));
    var segAr = h('button', { type: 'button', 'class': 'seg__btn', 'aria-pressed': 'false', 'aria-controls': uid + '-ar' },
      'Qwen3', h('span', { 'class': 'dr-xs-hide' }, '-8B'));
    var switcher = h('div', { 'class': 'dr-switcher' },
      h('div', { 'class': 'seg', role: 'group', 'aria-label': 'Visible transcript' }, segAlo, segAr),
      rtSeg);

    /* Panes. */
    function makePane(kind, title, sub, right, foot, name) {
      var scroll = h('div', { 'class': 'dr-scroll', tabindex: '0', role: 'region', 'aria-label': name + ' transcript' });
      var pane = h('div', { 'class': 'dr-pane dr-pane--' + kind, id: uid + '-' + kind },
        h('div', { 'class': 'dr-pane__head' },
          h('span', { 'class': 'dr-dot', 'aria-hidden': 'true' }),
          h('div', { 'class': 'dr-pane__title' }, title),
          h('div', { 'class': 'dr-pane__sub' }, sub),
          right),
        scroll,
        h('div', { 'class': 'dr-pane__foot' }, foot));
      return { el: pane, sc: scroll, auto: true, lastSet: -1, target: 0, tx: null, els: [] };
    }

    var pipDots = [1, 2, 3, 4].map(function (n) { return h('i', { 'data-pass': String(n) }); });
    var pipNum = h('span', { 'class': 'dr-pips__num' }, '\u2013/' + K);
    var pips = h('div', { 'class': 'dr-pips', 'data-tip': 'Recurrent pass in the current denoising step (maximum recurrent depth K = ' + K + ')', 'data-tip-pos': 'bottom-end' },
      h('span', { 'class': 'dr-pips__label' }, 'pass'),
      h('span', { 'class': 'dr-pips__dots', 'aria-hidden': 'true' }, pipDots),
      pipNum);

    var countAr = h('span', { 'class': 'dr-count' }, '0 / 0 tokens');
    var countAlo = h('span', { 'class': 'dr-count' }, '0 / 0 tokens');

    var legend = h('div', { 'class': 'legend dr-legend' },
      h('span', { 'class': 'legend__title' }, h('span', { 'class': 'dr-legend__long' }, 'Commitment '), 'pass'),
      [1, 2, 3, 4].map(function (n) {
        return h('span', { 'class': 'legend__item' },
          h('span', { 'class': 'dr-sw', 'data-pass': String(n) }, String(n)));
      }),
      h('span', { 'class': 'legend__item dr-legend__lat' }, h('span', { 'class': 'dr-sw dr-sw--lat', 'aria-hidden': 'true' }), 'uncommitted'));

    function subLine(a, b) { return [h('span', null, a), ' ' + MIDDOT + ' ', h('span', null, b)]; }
    var paneAr = makePane('ar', 'Qwen3-8B ' + MIDDOT + ' autoregressive', subLine('vLLM', 'one token per forward pass'), null,
      [h('span', { 'class': 'dr-foot__note' }, 'Sequential decoding'), countAr], 'Qwen3-8B autoregressive');
    var paneAlo = makePane('alo', 'ALoDLM-8B (ours)', subLine('parallel denoising', 'up to K = ' + K + ' recurrent passes'), pips,
      [legend, countAlo], 'ALoDLM-8B');

    var panes = h('div', { 'class': 'dr-panes' }, paneAr.el, paneAlo.el);

    var win = h('div', { 'class': 'dr-win term', role: 'group', 'aria-label': 'Decoding replay (illustrative)' },
      bar, race, switcher, panes);

    var live = h('p', { 'class': 'visually-hidden', 'aria-live': 'polite', 'aria-atomic': 'true' });

    var wrap = h('div', { 'class': 'dr', 'data-state': 'idle', 'data-pane': 'alo' }, win, live);
    root.appendChild(wrap);

    /* -------------------------------------------------- example + layout */
    function buildTranscript(p, ex, isAlo) {
      var tx = h('div', { 'class': 'dr-tx' });
      tx.appendChild(h('div', { 'class': 'dr-turn dr-turn--user' },
        h('span', { 'class': 'dr-role' }, 'User:'), ' ', String(ex.question || '').trim(),
        h('span', { 'class': 'dr-suffix' }, '\n' + SUFFIX)));
      var out = h('div', { 'class': 'dr-turn dr-turn--asst' }, h('span', { 'class': 'dr-role' }, 'Assistant:'), ' ');
      var els = new Array(ex.tokens.length);
      var frag = doc.createDocumentFragment();
      for (var j = 0; j < ex.tokens.length; j++) {
        var sp = doc.createElement('span');
        sp.className = 'dr-t';
        if (isAlo) { sp.setAttribute('data-pass', String(clampPass(ex.tokens[j][1]))); }
        sp.textContent = String(ex.tokens[j][0]);
        frag.appendChild(sp);
        els[j] = sp;
      }
      out.appendChild(frag);
      tx.appendChild(out);
      p.sc.textContent = '';
      p.sc.appendChild(tx);
      p.tx = tx;
      p.els = els;
    }

    function loadExample(i) {
      st.idx = i;
      st.ex = examples[i];
      st.S = buildSchedule(st.ex.tokens, R_AR, R_ALO);
      buildTranscript(paneAr, st.ex, false);
      buildTranscript(paneAlo, st.ex, true);
      resetRun();
    }

    /* ---------------------------------------------------------- run state */
    function setState(s) {
      st.state = s;
      wrap.setAttribute('data-state', s);
      var playing = s === 'playing';
      var label = playing ? 'Pause' : s === 'paused' ? 'Resume' : 'Play';
      var icon = playBtn.querySelector('.dr-ico');
      var want = playing ? 'pause' : 'play';
      if (!icon || icon.getAttribute('class').indexOf('dr-ico--' + want) < 0) {
        var g = glyph(want);
        if (icon) { playBtn.replaceChild(g, icon); } else { playBtn.insertBefore(g, playBtn.firstChild); }
      }
      playBtn.querySelector('.dr-btn__txt').textContent = label;
      playBtn.setAttribute('aria-label', label + ' replay');
    }

    function resetRun() {
      stopLoop();
      live.textContent = '';   /* never leave the previous run's summary behind */
      st.sim = 0; st.last = 0;
      st.arN = 0; st.aloN = 0; st.stepIdx = -1; st.evIdx = 0; st.pass = 0;
      st.counts = [0, 0, 0, 0, 0];
      st.aloDone = false; st.arDone = false;
      st.shown = {};
      var i;
      for (i = 0; i < paneAr.els.length; i++) { paneAr.els[i].className = 'dr-t'; }
      for (i = 0; i < paneAlo.els.length; i++) { paneAlo.els[i].className = 'dr-t'; }
      if (paneAr.els.length) { paneAr.els[0].classList.add('is-next'); }
      wrap.removeAttribute('data-alo');
      wrap.removeAttribute('data-ar');
      [paneAr, paneAlo].forEach(function (p) {
        p.auto = true; p.target = 0;
        p.sc.scrollTop = 0;
        p.lastSet = p.sc.scrollTop;
      });
      st.pausedBy = null;
      setState('idle');
      paint(0, true);
    }

    function setActive(s, on) {
      for (var j = s.a; j < s.b; j++) { paneAlo.els[j].classList.toggle('is-act', on); }
    }

    /* Move the replay to simulated time t (monotonic between resets). */
    function advance(t) {
      var S = st.S;
      var arEls = paneAr.els;
      var aloEls = paneAlo.els;

      /* Qwen3-8B: one token per forward pass. */
      var arTarget = Math.min(S.N, Math.floor(t * R_AR + 1e-7));
      if (arTarget > st.arN) {
        if (st.arN < S.N) { arEls[st.arN].classList.remove('is-next'); }
        while (st.arN < arTarget) { arEls[st.arN].classList.add('is-on'); st.arN++; }
        if (st.arN < S.N) { arEls[st.arN].classList.add('is-next'); }
      }

      /* ALoDLM-8B: commit tokens at the end of their recorded pass. */
      var ev = S.ev;
      while (st.evIdx < ev.length && ev[st.evIdx].t <= t + EPS) {
        var e = ev[st.evIdx++];
        var el = aloEls[e.j];
        el.classList.remove('is-lat');
        el.classList.add('is-on');
        st.aloN++;
        st.counts[e.p]++;
      }

      /* Open the next illustrative step: its positions become placeholders. */
      while (st.stepIdx + 1 < S.steps.length && S.steps[st.stepIdx + 1].t0 <= t + EPS) {
        if (st.stepIdx >= 0) { setActive(S.steps[st.stepIdx], false); }
        st.stepIdx++;
        var s = S.steps[st.stepIdx];
        for (var j = s.a; j < s.b; j++) {
          if (!aloEls[j].classList.contains('is-on')) { aloEls[j].classList.add('is-lat'); }
        }
        setActive(s, true);
      }

      /* Current recurrent pass of the open step (for the pips). */
      st.pass = 0;
      if (!st.aloDone && st.stepIdx >= 0) {
        var cur = S.steps[st.stepIdx];
        st.pass = Math.max(1, Math.min(cur.P, Math.floor((t - cur.t0) / S.dt + EPS) + 1));
      }

      if (!st.aloDone && st.evIdx >= ev.length && t >= S.Talo - EPS) {
        st.aloDone = true;
        st.pass = 0;
        if (st.stepIdx >= 0) { setActive(S.steps[st.stepIdx], false); }
        wrap.setAttribute('data-alo', 'done');
      }
      if (!st.arDone && st.arN >= S.N && t >= S.Tar - EPS) {
        st.arDone = true;
        if (S.N) { arEls[S.N - 1].classList.remove('is-next'); }
        wrap.setAttribute('data-ar', 'done');
      }
    }

    /* --------------------------------------------------------- painting */
    function setText(key, el, txt) {
      if (st.shown[key] !== txt) { st.shown[key] = txt; el.textContent = txt; }
    }

    function setFill(key, el, f) {
      var val = Math.round(f * 10000) / 100;
      if (st.shown[key] !== val) {
        st.shown[key] = val;
        el.style.transform = 'translateX(' + (val - 100) + '%)';
      }
    }

    function paintPips() {
      var p = st.pass;
      if (st.shown.pass === p && st.shown.passDone === st.aloDone) { return; }
      st.shown.pass = p;
      st.shown.passDone = st.aloDone;
      for (var i = 0; i < K; i++) {
        pipDots[i].classList.toggle('is-on', i < p);
        pipDots[i].classList.toggle('is-cur', i === p - 1);
      }
      pipNum.textContent = st.aloDone ? 'done' : (p ? p : '\u2013') + '/' + K;
    }

    function followTarget(p, el) {
      var sc = p.sc;
      var ch = sc.clientHeight;
      if (!ch || !el) { return -1; }
      var bottom = el.offsetTop + el.offsetHeight;
      return Math.max(0, Math.min(sc.scrollHeight - ch, bottom + FOLLOW_PAD - ch));
    }

    function follow(p, el, dtMs, instant) {
      var target = followTarget(p, el);
      if (target < 0) { return; }
      p.target = target;
      if (!p.auto) { return; }
      var sc = p.sc;
      var cur = sc.scrollTop;
      if (target <= cur + 0.5) { return; }
      var next = instant || reduced ? target : cur + (target - cur) * (1 - Math.exp(-(dtMs || 16) / 120));
      if (target - next < 0.75) { next = target; }
      sc.scrollTop = next;
      p.lastSet = sc.scrollTop;
    }

    function arFollowEl() {
      var els = paneAr.els;
      return els.length ? els[Math.min(st.arN, els.length - 1)] : null;
    }
    function aloFollowEl() {
      var S = st.S;
      if (!paneAlo.els.length) { return null; }
      if (st.stepIdx < 0) { return paneAlo.els[0]; }
      return paneAlo.els[S.steps[st.stepIdx].b - 1];
    }

    function paint(dtMs, instantScroll) {
      var S = st.S;
      var t = st.sim;
      setText('tAr', rowAr.time, fmtSec(Math.min(t, S.Tar)));
      setText('tAlo', rowAlo.time, fmtSec(Math.min(t, S.Talo)));
      setFill('fAr', rowAr.fill, S.N ? st.arN / S.N : 0);
      setFill('fAlo', rowAlo.fill, S.N ? st.aloN / S.N : 0);
      setText('cAr', countAr, st.arN + ' / ' + S.N + ' tokens');
      setText('cAlo', countAlo, st.aloN + ' / ' + S.N + ' tokens');
      paintPips();
      if (dtMs !== null) {
        follow(paneAr, arFollowEl(), dtMs, instantScroll);
        follow(paneAlo, aloFollowEl(), dtMs, instantScroll);
      }
    }

    /* ------------------------------------------------------------- loop */
    function slowmo() { return st.realtime ? 1 : SLOWMO; }

    function stopLoop() {
      if (st.raf) { window.cancelAnimationFrame(st.raf); st.raf = 0; }
      st.last = 0;
    }

    function frame(now) {
      st.raf = 0;
      if (st.state !== 'playing') { return; }
      var dtMs = st.last ? Math.min(MAX_FRAME_MS, Math.max(0, now - st.last)) : 0;
      st.last = now;
      st.sim += dtMs / 1000 / slowmo();
      var S = st.S;
      var end = Math.max(S.Tar, S.Talo);
      if (st.sim >= end) { st.sim = end; }
      advance(st.sim);
      paint(dtMs || 16, false);
      if (st.aloDone && st.arDone) { finish(true); return; }
      st.raf = window.requestAnimationFrame(frame);
    }

    function play() {
      if (st.state === 'done') { resetRun(); }
      wrap.classList.remove('dr--instant');
      st.pausedBy = null;
      setState('playing');
      st.last = 0;
      if (!st.raf) { st.raf = window.requestAnimationFrame(frame); }
    }

    function pause(by) {
      if (st.state !== 'playing') { return; }
      stopLoop();
      st.pausedBy = by || 'user';
      setState('paused');
    }

    function finish(announce) {
      stopLoop();
      setState('done');
      if (announce) {
        var S = st.S;
        var msg = 'Replay finished. Simulated latency for the same ' + S.N + '-token response: ALoDLM-8B ' +
          S.Talo.toFixed(2) + ' s, Qwen3-8B autoregressive ' + S.Tar.toFixed(2) + ' s, about ' + SPEEDUP +
          ' times faster. GSM8K accuracy ' + TP.accAlo.toFixed(2) + '% versus ' + TP.accAr.toFixed(2) + '% (Figure 1, right).';
        live.textContent = '';
        window.setTimeout(function () { live.textContent = msg; }, 60);
      }
    }

    /* Final state without animation (reduced motion). announce: the user asked
       for it (e.g. picked another example), so the summary is read out. */
    function renderFinal(announce) {
      resetRun();
      wrap.classList.add('dr--instant');
      var S = st.S;
      st.sim = Math.max(S.Tar, S.Talo);
      advance(st.sim);
      paint(null, false);
      finish(!!announce);
    }

    /* Debug hook: show the state at simulated time t (paused). */
    function seek(t) {
      var S = st.S;
      t = Math.max(0, Math.min(+t || 0, Math.max(S.Tar, S.Talo)));
      if (t < st.sim) { resetRun(); }
      st.sim = t;
      advance(t);
      paint(16, true);
      if (st.aloDone && st.arDone) { finish(false); }
      else { stopLoop(); st.pausedBy = 'user'; setState('paused'); }
    }

    function onConditions() {
      if (st.inView && st.pageVisible) {
        if (st.state === 'idle' && !reduced) { play(); }
        else if (st.state === 'paused' && st.pausedBy === 'auto') { play(); }
      } else if (st.state === 'playing') {
        pause('auto');
      }
    }

    /* ----------------------------------------------------------- events */
    playBtn.addEventListener('click', function () {
      if (st.state === 'playing') { pause('user'); } else { play(); }
    });
    replayBtn.addEventListener('click', function () { resetRun(); play(); });

    function setRealtime(on) {
      st.realtime = !!on;
      switches.forEach(function (s) { s.setAttribute('aria-checked', on ? 'true' : 'false'); });
      wrap.classList.toggle('dr--realtime', st.realtime);
      speedChip.textContent = on ? 'Real time' : 'Slowed ' + SLOWMO + TIMES;
    }
    switches.forEach(function (s) {
      s.addEventListener('click', function () { setRealtime(!st.realtime); });
    });

    select.addEventListener('change', function () {
      var i = parseInt(select.value, 10);
      if (!(i >= 0 && i < examples.length)) { return; }
      loadExample(i);
      if (reduced) { renderFinal(true); }
      else if (st.inView && st.pageVisible) { play(); }
    });

    function setPane(which) {
      st.pane = which;
      wrap.setAttribute('data-pane', which);
      segAlo.setAttribute('aria-pressed', which === 'alo' ? 'true' : 'false');
      segAr.setAttribute('aria-pressed', which === 'ar' ? 'true' : 'false');
      var p = which === 'alo' ? paneAlo : paneAr;
      if (p.auto && st.state !== 'idle') { follow(p, which === 'alo' ? aloFollowEl() : arFollowEl(), 16, true); }
    }
    segAlo.addEventListener('click', function () { setPane('alo'); });
    segAr.addEventListener('click', function () { setPane('ar'); });

    [paneAr, paneAlo].forEach(function (p) {
      p.sc.addEventListener('scroll', function () {
        if (Math.abs(p.sc.scrollTop - p.lastSet) < 2) { return; }
        p.lastSet = -1;
        p.auto = p.sc.scrollTop >= p.target - 24;
      }, { passive: true });
    });

    /* In view: the race rows are on screen (they sit near the fold on many
       laptops), or most of the window is (while reading the transcripts). */
    var seen = { race: false, win: false };
    function setInView() { st.inView = seen.race || seen.win; onConditions(); }
    A.onVisible(rowAlo.row, function (visible) { seen.race = visible; setInView(); }, 0.9);
    A.onVisible(win, function (visible) { seen.win = visible; setInView(); }, 0.4);
    A.onPageVisibility(function (visible) { st.pageVisible = visible; onConditions(); });
    A.onReducedMotionChange(function (isReduced) {
      reduced = isReduced;
      if (reduced && st.state === 'playing') { renderFinal(); }
    });

    /* ------------------------------------------------------------- init */
    setRealtime(false);
    loadExample(defIdx);
    if (reduced) { renderFinal(); }

    /* Debug hook for testing from the browser console. */
    window.ALODLM_DEMO_REPLAY = {
      play: play,
      pause: function () { pause('user'); },
      replay: function () { resetRun(); play(); },
      seek: seek,
      select: function (i) { select.value = String(i); select.dispatchEvent(new Event('change')); },
      state: function () {
        return { state: st.state, sim: st.sim, Tar: st.S.Tar, Talo: st.S.Talo, N: st.S.N, steps: st.S.steps.length,
          passes: st.S.passes, arN: st.arN, aloN: st.aloN, pass: st.pass, counts: st.counts.slice(1),
          realtime: st.realtime, example: st.idx };
      }
    };
  });
})();
