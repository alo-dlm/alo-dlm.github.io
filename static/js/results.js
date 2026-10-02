/* ==========================================================================
   results.js: Table 1 (main results) and the Figure 4 analysis charts.

   Mounts
     #results-table   (data-widget="results")          Table 1, from window.ALODLM_RESULTS
     #analysis-charts (data-widget="analysis-charts")  Figure 4 (middle and right) values

   Contract: site_contract.md (window.ALODLM from site.js; no edits to shared files).
   Styles: static/css/results.css (prefixes rt- for the table, ac- for the charts).
   QA handle: window.ALODLM_RESULTS_UI (state setters and the result of the dev check).
   ========================================================================== */
(function () {
  'use strict';

  var A = window.ALODLM;
  if (!A) { return; }                                   // site.js missing: keep the static fallbacks

  var h = A.h;
  var MINUS = '\u2212';
  var NBSP = '\u00a0';
  var ui = window.ALODLM_RESULTS_UI = {};

  function each(list, fn) { Array.prototype.forEach.call(list || [], fn); }

  /* ======================================================================
     1. Dev check: the paper's marks must follow the rule stated in the caption
        bold      = overall best within the model scale (AR baseline included)
        underline = best non-AR result within the model scale
        Also checks values_text against values, and that each Average is the
        unweighted mean of the 11 benchmarks to one decimal.
     ====================================================================== */
  function verifyTable(R) {
    var out = { ok: true, cells: 0, markedCells: 0, mismatches: [] };
    var nBench = R.columns.length - 1;                  // last column is "Average"

    function fail(msg) { out.ok = false; out.mismatches.push(msg); }

    R.row_groups.forEach(function (g) {
      R.columns.forEach(function (col, ci) {
        var all = [], nonAR = [];
        g.rows.forEach(function (r) {
          all.push(r.values[ci]);
          if (r.type !== 'AR') { nonAR.push(r.values[ci]); }
        });
        var best = Math.max.apply(null, all);
        var bestNonAR = Math.max.apply(null, nonAR);
        g.rows.forEach(function (r) {
          var v = r.values[ci];
          var m = (r.marks && r.marks[col]) || '';
          var hasBold = m === 'bold' || m === 'bold+underline';
          var hasUnder = m === 'underline' || m === 'bold+underline';
          var wantBold = v === best;
          var wantUnder = r.type !== 'AR' && v === bestNonAR;
          out.cells++;
          if (m) { out.markedCells++; }
          if (hasBold !== wantBold || hasUnder !== wantUnder) {
            fail(g.name + ' / ' + r.model + '-' + r.size + ' / ' + col + ': data mark "' + (m || 'none') +
                 '", rule gives "' + (wantBold && wantUnder ? 'bold+underline' : wantBold ? 'bold' : wantUnder ? 'underline' : 'none') + '"');
          }
          if (parseFloat(r.values_text[ci]) !== v || !/^\d+\.\d$/.test(r.values_text[ci])) {
            fail(g.name + ' / ' + r.model + ' / ' + col + ': values_text "' + r.values_text[ci] + '" vs value ' + v);
          }
        });
      });
      g.rows.forEach(function (r) {
        var s = 0;
        for (var i = 0; i < nBench; i++) { s += r.values[i]; }
        if (Math.abs(s / nBench - r.values[nBench]) > 0.05 + 1e-9) {
          fail(g.name + ' / ' + r.model + ': Average ' + r.values_text[nBench] + ' is not the mean of the 11 scores (' + (s / nBench).toFixed(3) + ')');
        }
      });
    });
    return out;
  }

  /* ======================================================================
     2. Table 1
     ====================================================================== */
  var SCALES = [
    { key: '8B', label: '8B', name: 'the 8B scale' },
    { key: '1.7B', label: '1.7B', name: 'the 1.7B scale' },
    { key: 'both', label: 'Both', name: 'both scales' }
  ];
  var MARK_SR = {
    'bold': 'best overall at this scale',
    'underline': 'best non-AR at this scale',
    'bold+underline': 'best overall and best non-AR at this scale'
  };

  function groupLabel(type, n) {
    if (type === 'AR') { return 'AR'; }
    if (type === 'Ours') { return 'Ours'; }
    return n > 1 ? 'Diffusion LMs' : 'DLM';
  }

  function signed(d) {
    var r = Math.round(d * 10) / 10;
    var sign = r > 0 ? '+' : r < 0 ? MINUS : '\u00b1';
    return { text: sign + Math.abs(r).toFixed(1), kind: r > 0 ? 'pos' : r < 0 ? 'neg' : 'zero' };
  }

  A.mount('results-table', function (root) {
    var R = A.data.results;
    if (!R || !R.row_groups || !R.columns) { throw new Error('window.ALODLM_RESULTS is missing'); }

    var check = verifyTable(R);
    ui.marksCheck = check;
    console.assert(check.ok, '[results] Table 1 data does not match the bold/underline rule:', check.mismatches);

    function findGroup(key) {
      for (var i = 0; i < R.row_groups.length; i++) {
        if (R.row_groups[i].name.indexOf(key + ' ') === 0) { return R.row_groups[i]; }
      }
      throw new Error('no row group for scale ' + key);
    }
    var G = { '1.7B': findGroup('1.7B'), '8B': findGroup('8B') };
    var benchCols = R.column_groups.filter(function (cg) { return cg.name !== 'Average'; });
    var avgIndex = R.columns.indexOf('Average');

    var state = { scale: '8B', delta: false };
    var uid = 'rt';

    /* ---------- static chrome: head bar, controls, frame, legend, caption */
    var segBtns = [];
    var seg = h('div', { 'class': 'seg rt-seg', role: 'radiogroup', 'aria-label': 'Model scale' });
    SCALES.forEach(function (s, i) {
      var b = h('button', {
        type: 'button', 'class': 'seg__btn', role: 'radio', 'aria-checked': i === 0 ? 'true' : 'false',
        tabindex: i === 0 ? '0' : '-1', dataset: { scale: s.key }
      }, s.label);
      b.addEventListener('click', function () { setScale(s.key, true); });
      b.addEventListener('keydown', function (e) {
        var k = e.key, j = i;
        if (k === 'ArrowRight' || k === 'ArrowDown') { j = (i + 1) % SCALES.length; }
        else if (k === 'ArrowLeft' || k === 'ArrowUp') { j = (i + SCALES.length - 1) % SCALES.length; }
        else if (k === 'Home') { j = 0; }
        else if (k === 'End') { j = SCALES.length - 1; }
        else { return; }
        e.preventDefault();
        setScale(SCALES[j].key, true);
        segBtns[j].focus();
      });
      segBtns.push(b);
      seg.appendChild(b);
    });

    var deltaBtn = h('button', { type: 'button', 'class': 'rt-switch', role: 'switch', 'aria-checked': 'false' },
      h('span', { 'class': 'rt-switch__track', 'aria-hidden': 'true' }, h('span', { 'class': 'rt-switch__thumb' })),
      h('span', null,
        h('span', { 'aria-hidden': 'true' }, '\u0394'),
        h('span', { 'class': 'sr-only' }, 'Difference'),
        ' vs Qwen3'));
    deltaBtn.addEventListener('click', function () { setDelta(!state.delta, true); });

    var head = h('div', { 'class': 'rt-head' },
      h('p', { 'class': 'rt-label', id: uid + '-label' }, h('b', null, 'Table 1'), ' \u00b7 Main results'),
      h('div', { 'class': 'rt-controls' },
        h('span', { 'class': 'rt-controls__name', 'aria-hidden': 'true' }, 'Scale'),
        seg, deltaBtn));

    var hint = h('p', { 'class': 'rt-hint', 'aria-hidden': 'true', hidden: true },
      'Scroll sideways for all models', h('span', { 'class': 'rt-hint__arrow' }, '\u2192'));

    var scroller = h('div', { 'class': 'rt-scroll', role: 'region', 'aria-labelledby': uid + '-label' });
    var frame = h('div', { 'class': 'rt-frame' }, scroller);

    var legendDelta = h('li', { 'class': 'legend__item', hidden: true },
      h('span', { 'class': 'rt-key rt-key--delta', 'aria-hidden': 'true' }, '\u0394'),
      h('span', null, 'ALoDLM minus Qwen3 at the same scale, computed from the table'));
    var legend = h('ul', { 'class': 'legend rt-legend', 'aria-label': 'Table key' },
      h('li', { 'class': 'legend__item' }, h('span', { 'class': 'rt-key rt-key--bold' }, 'Bold'), h('span', null, 'best overall at its scale')),
      h('li', { 'class': 'legend__item' }, h('span', { 'class': 'rt-key rt-key--under' }, 'Underline'), h('span', null, 'best non-AR at its scale')),
      h('li', { 'class': 'legend__item' }, h('span', { 'class': 'rt-key rt-key--ours', 'aria-hidden': 'true' }), h('span', null, 'Shaded: ALoDLM (ours)')),
      legendDelta);

    var caption = h('p', { 'class': 'rt-caption', id: uid + '-caption', html: R.caption });
    var notes = h('p', { 'class': 'rt-notes' },
      'All models are instruct models. Scores are accuracy or exact match, and execution-based pass@1 on the code benchmarks; ' +
      'Average is the unweighted mean of the 11 benchmarks. MBPP is sanitized MBPP; MBPP', h('sup', null, '+'),
      ' and HumanEval', h('sup', null, '+'), ' are their EvalPlus variants.');

    var card = h('div', { 'class': 'rt-card' }, head, hint, frame,
      h('div', { 'class': 'rt-foot' }, legend, caption, notes));
    var wrap = h('div', { 'class': 'rt', dataset: { scale: state.scale } }, card);
    root.appendChild(wrap);

    /* ---------- table builder (rebuilt on scale change only) */
    function buildTable(scaleKey) {
      var groups = scaleKey === 'both' ? [G['1.7B'], G['8B']] : [G[scaleKey]];
      var models = [];
      var runs = [];
      groups.forEach(function (g, gi) {
        var qwen = null;
        g.rows.forEach(function (r) { if (r.type === 'AR' && !qwen) { qwen = r; } });
        var run = null;
        g.rows.forEach(function (r, ri) {
          if (!run || run.type !== r.type) {
            run = { type: r.type, n: 0, scaleStart: ri === 0 && gi > 0 };
            runs.push(run);
          }
          run.n++;
          models.push({ row: r, qwen: qwen, runStart: run.n === 1, scaleStart: ri === 0 && gi > 0 });
        });
      });
      var nCols = models.length + 1;
      var lastIsOurs = models.length && models[models.length - 1].row.is_ours;
      var stickRight = scaleKey !== 'both' && lastIsOurs;

      var table = h('table', { 'class': 'rt-table', 'aria-describedby': uid + '-caption' });
      table.appendChild(h('caption', { 'class': 'sr-only' },
        'Table 1: main results at ' + (scaleKey === 'both' ? 'the 1.7B and 8B scales' : 'the ' + scaleKey + ' scale') +
        '. Benchmarks in rows, models in columns.'));

      table.appendChild(h('colgroup', null, h('col')));    // column groups back the scope="colgroup" headers
      runs.forEach(function (run) { table.appendChild(h('colgroup', { span: String(run.n) })); });

      var thead = h('thead');
      var trG = h('tr');
      trG.appendChild(h('th', { scope: 'col', rowspan: '2', 'class': 'rt-corner rt-stick-l' },
        h('span', { 'class': 'rt-corner__label' }, 'Benchmark')));
      runs.forEach(function (run) {
        var cls = 'rt-grp rt-grp--' + run.type.toLowerCase() + (run.scaleStart ? ' rt-scale-start' : '');
        if (stickRight && run === runs[runs.length - 1]) { cls += ' rt-stick-r'; }
        trG.appendChild(h('th', { scope: 'colgroup', colspan: String(run.n), 'class': cls },
          h('span', { 'class': 'rt-grp__label' }, groupLabel(run.type, run.n))));
      });
      var trM = h('tr');
      models.forEach(function (m, mi) {
        var cls = 'rt-model' + (m.row.is_ours ? ' rt-ours' : '') + (m.runStart ? ' rt-run-start' : '') +
          (m.scaleStart ? ' rt-scale-start' : '') + (stickRight && mi === models.length - 1 ? ' rt-stick-r' : '');
        trM.appendChild(h('th', { scope: 'col', 'class': cls },
          h('span', { 'class': 'rt-model__name' }, m.row.model),
          h('span', { 'class': 'rt-model__size' }, m.row.size)));
      });
      thead.appendChild(trG);
      thead.appendChild(trM);
      table.appendChild(thead);

      function numCell(m, mi, ci) {
        var r = m.row, col = R.columns[ci];
        var mark = (r.marks && r.marks[col]) || '';
        var bold = mark === 'bold' || mark === 'bold+underline';
        var under = mark === 'underline' || mark === 'bold+underline';
        var cls = 'rt-num' + (r.is_ours ? ' rt-ours' : '') + (m.runStart ? ' rt-run-start' : '') +
          (m.scaleStart ? ' rt-scale-start' : '') + (stickRight && mi === models.length - 1 ? ' rt-stick-r' : '');
        var td = h('td', { 'class': cls },
          h('span', { 'class': 'rt-v' + (bold ? ' is-bold' : '') + (under ? ' is-under' : '') }, r.values_text[ci]));
        if (mark) { td.appendChild(h('span', { 'class': 'sr-only' }, ' (' + MARK_SR[mark] + ')')); }
        if (r.is_ours && m.qwen) {
          var d = signed(r.values[ci] - m.qwen.values[ci]);
          td.appendChild(h('span', { 'class': 'rt-delta', dataset: { sign: d.kind } },
            h('span', { 'class': 'sr-only' }, ', difference from ' + m.qwen.model + '-' + m.qwen.size + ': '),
            d.text));
        }
        return td;
      }

      function benchRow(col, extraClass) {
        var ci = R.columns.indexOf(col);
        var tr = h('tr', { 'class': extraClass || null });
        tr.appendChild(h('th', { scope: 'row', 'class': 'rt-bench rt-stick-l', html: (R.column_display_html && R.column_display_html[col]) || col }));
        models.forEach(function (m, mi) { tr.appendChild(numCell(m, mi, ci)); });
        return tr;
      }

      benchCols.forEach(function (cg) {
        var tb = h('tbody');
        tb.appendChild(h('tr', { 'class': 'rt-row-section' },
          h('th', { scope: 'rowgroup', colspan: String(nCols), 'class': 'rt-sec' },
            h('span', { 'class': 'rt-sec__label' }, cg.name))));
        cg.columns.forEach(function (col) { tb.appendChild(benchRow(col)); });
        table.appendChild(tb);
      });
      if (avgIndex !== -1) {
        var tbAvg = h('tbody');
        tbAvg.appendChild(benchRow('Average', 'rt-row-avg'));
        table.appendChild(tbAvg);
      }
      return { table: table, models: models };
    }

    /* ---------- scroll affordances */
    var current = null;                                 // the table currently shown

    function measureSticky() {                          // sticky column widths, used by the sticky group labels
      if (!current) { return; }
      var cl = current.querySelector('.rt-corner');
      var cr = current.querySelector('.rt-model.rt-stick-r');
      current.style.setProperty('--rt-sl', (cl ? cl.offsetWidth : 0) + 'px');
      current.style.setProperty('--rt-sr', (cr ? cr.offsetWidth : 0) + 'px');
    }
    function syncScroll() {
      var max = scroller.scrollWidth - scroller.clientWidth;
      var overflow = max > 1;
      var x = scroller.scrollLeft;
      scroller.classList.toggle('is-scrolled', overflow && x > 1);
      scroller.classList.toggle('has-more', overflow && x < max - 1);
      frame.classList.toggle('has-more', overflow && x < max - 1);
      hint.hidden = !overflow;
      if (overflow) { scroller.setAttribute('tabindex', '0'); }
      else { scroller.removeAttribute('tabindex'); }
    }
    function onResize() { measureSticky(); syncScroll(); }
    scroller.addEventListener('scroll', syncScroll, { passive: true });
    if ('ResizeObserver' in window) {
      new ResizeObserver(onResize).observe(scroller);
    } else {
      window.addEventListener('resize', onResize);
    }

    /* ---------- state setters */
    function setScale(key, fromUser) {
      var s = null;
      SCALES.forEach(function (x) { if (x.key === key) { s = x; } });
      if (!s) { return; }
      var changed = state.scale !== key || !current;
      state.scale = key;
      segBtns.forEach(function (b) {
        var on = b.dataset.scale === key;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.setAttribute('tabindex', on ? '0' : '-1');
      });
      if (!changed) { return; }
      var built = buildTable(key);
      if (current) { scroller.replaceChild(built.table, current); } else { scroller.appendChild(built.table); }
      current = built.table;
      wrap.dataset.scale = key;
      scroller.scrollLeft = 0;
      measureSticky();
      syncScroll();
      if (fromUser) { A.announce('Table 1 now shows ' + s.name + ': ' + built.models.length + ' models.'); }
    }
    function setDelta(on, fromUser) {
      state.delta = !!on;
      deltaBtn.setAttribute('aria-checked', state.delta ? 'true' : 'false');
      wrap.classList.toggle('is-delta', state.delta);
      legendDelta.hidden = !state.delta;
      onResize();
      if (fromUser) {
        A.announce(state.delta ? 'Showing the difference between ALoDLM and Qwen3 under each ALoDLM score.' : 'Differences hidden.');
      }
    }

    setScale('8B', false);
    setDelta(false, false);
    ui.setScale = function (k) { setScale(k, false); };
    ui.setDelta = function (on) { setDelta(on, false); };
    ui.tableState = function () { return { scale: state.scale, delta: state.delta }; };
  });

  /* ======================================================================
     3. Analysis charts (Figure 4, middle and right), values as printed in
        the paper's figure. The q sweep is a separate evaluation from Table 1.
     ====================================================================== */
  var Q_SWEEP = {
    q: ['0.1', '0.2', '0.3', '0.4'],
    loops: ['1.60', '2.10', '2.26', '2.34'],
    score: ['77.9', '78.4', '78.7', '79.1'],
    x: { min: 1.5, max: 2.5, ticks: ['1.6', '1.8', '2.0', '2.2', '2.4'] },
    y: { min: 77.5, max: 79.5, ticks: ['77.5', '78.0', '78.5', '79.0', '79.5'] }
  };
  var HALT = {
    mean: '0.417',
    belowMean: '11.5%',
    focus: 'Number',
    rows: [['Word', '0.428'], ['Punctuation', '0.419'], ['Space', '0.401'], ['Operator', '0.399'], ['Number', '0.369']],
    x: { min: 0.35, max: 0.45, ticks: ['0.36', '0.38', '0.40', '0.42', '0.44'] }
  };

  function pct(v, d) { return ((parseFloat(v) - d.min) / (d.max - d.min) * 100); }
  function pctStr(v, d) { return pct(v, d).toFixed(3) + '%'; }

  A.mount('analysis-charts', function (root) {
    var n = Q_SWEEP.q.length;
    var reduced = A.prefersReducedMotion();

    /* ---------------- (a) Test-time scaling with q */
    var rangeId = 'ac-q-range';
    var range = h('input', {
      id: rangeId, type: 'range', 'class': 'ac-range', min: '0', max: String(n - 1), step: '1', value: String(n - 1)
    });
    var qOut = h('output', { 'class': 'ac-qval', 'for': rangeId, 'aria-hidden': 'true' });
    var ticks = h('div', { 'class': 'ac-ticks', 'aria-hidden': 'true' });
    Q_SWEEP.q.forEach(function (q, i) {
      var t = h('span', { 'class': 'ac-tick', style: { '--i': String(i / (n - 1)) } }, q);
      t.addEventListener('click', function () { userSelect(i); });
      ticks.appendChild(t);
    });

    var statLoops = h('dd', { 'class': 'ac-stat__value' });
    var statScore = h('dd', { 'class': 'ac-stat__value' });
    var stats = h('dl', { 'class': 'ac-stats' },
      h('div', { 'class': 'ac-stat' }, h('dt', { 'class': 'ac-stat__label' }, 'Loops per token'), statLoops),
      h('div', { 'class': 'ac-stat' }, h('dt', { 'class': 'ac-stat__label' }, 'Average score (%)'), statScore));

    // Connected scatter: x = loops per token, y = average score; one point per q setting.
    var area = h('div', { 'class': 'ac-xy__area' });
    Q_SWEEP.y.ticks.forEach(function (t) {
      area.appendChild(h('span', { 'class': 'ac-xy__grid ac-xy__grid--h', style: { bottom: pctStr(t, Q_SWEEP.y) } }));
    });
    Q_SWEEP.x.ticks.forEach(function (t) {
      area.appendChild(h('span', { 'class': 'ac-xy__grid ac-xy__grid--v', style: { left: pctStr(t, Q_SWEEP.x) } }));
    });
    var guideV = h('span', { 'class': 'ac-xy__guide ac-xy__guide--v' });
    var guideH = h('span', { 'class': 'ac-xy__guide ac-xy__guide--h' });
    area.appendChild(guideV);
    area.appendChild(guideH);
    var pts = Q_SWEEP.q.map(function (q, i) {
      return { x: pct(Q_SWEEP.loops[i], Q_SWEEP.x), y: pct(Q_SWEEP.score[i], Q_SWEEP.y) };
    });
    area.appendChild(A.svg('svg', { 'class': 'ac-xy__line', viewBox: '0 0 100 100', preserveAspectRatio: 'none', focusable: 'false' },
      A.svg('polyline', {
        points: pts.map(function (p) { return p.x.toFixed(3) + ',' + (100 - p.y).toFixed(3); }).join(' '),
        'vector-effect': 'non-scaling-stroke'
      })));
    var ptEls = pts.map(function (p, i) {
      var el = h('span', {
        'class': 'ac-xy__pt' + (i === 0 ? ' is-first' : ''),
        style: { left: p.x.toFixed(3) + '%', bottom: p.y.toFixed(3) + '%' }
      }, h('span', { 'class': 'ac-xy__ptlabel' }, 'q', NBSP, '=', NBSP, Q_SWEEP.q[i]));
      el.addEventListener('click', function () { userSelect(i); });
      area.appendChild(el);
      return el;
    });
    var sel = h('span', { 'class': 'ac-xy__sel' });
    area.appendChild(sel);

    var yTicks = h('div', { 'class': 'ac-xy__yticks' });
    Q_SWEEP.y.ticks.forEach(function (t) { yTicks.appendChild(h('span', { style: { bottom: pctStr(t, Q_SWEEP.y) } }, t)); });
    var xTicks = h('div', { 'class': 'ac-xy__xticks' });
    Q_SWEEP.x.ticks.forEach(function (t) { xTicks.appendChild(h('span', { style: { left: pctStr(t, Q_SWEEP.x) } }, t)); });

    var plotA = h('div', { 'class': 'ac-xy', 'aria-hidden': 'true' },
      h('div', { 'class': 'ac-xy__ytitle' }, 'Average score over 11 benchmarks (%)'),
      h('div', { 'class': 'ac-xy__frame' }, yTicks, area, xTicks),
      h('div', { 'class': 'ac-xy__xtitle' }, 'Loops per token'));

    var tableA = h('div', { 'class': 'sr-only' }, h('table', null,
      h('caption', null, 'Test-time scaling with the exit threshold q, values as printed in Figure 4 (middle)'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, 'Exit threshold q'),
        h('th', { scope: 'col' }, 'Loops per token'),
        h('th', { scope: 'col' }, 'Average score over 11 benchmarks (%)'))),
      h('tbody', null, Q_SWEEP.q.map(function (q, i) {
        return h('tr', null, h('th', { scope: 'row' }, q), h('td', null, Q_SWEEP.loops[i]), h('td', null, Q_SWEEP.score[i]));
      }))));

    var cardA = h('section', { 'class': 'ac-card', 'aria-labelledby': 'ac-q-title' },
      h('div', { 'class': 'ac-head' },
        h('p', { 'class': 'ac-label' }, h('b', null, 'Figure 4'), ' \u00b7 middle'),
        h('h3', { 'class': 'ac-title', id: 'ac-q-title' }, 'Test-time scaling with ', h('var', null, 'q')),
        h('p', { 'class': 'ac-sub' }, 'Raising the exit threshold ', h('var', null, 'q'),
          ' lets unresolved tokens refine their latent states for longer.')),
      h('div', { 'class': 'ac-body' },
        h('div', { 'class': 'ac-ctrlrow' },
          h('div', { 'class': 'ac-ctrl' },
            h('div', { 'class': 'ac-ctrl__top' },
              h('label', { 'for': rangeId, 'class': 'ac-ctrl__label' }, 'Exit threshold ', h('var', null, 'q')),
              qOut),
            h('div', { 'class': 'ac-ctrl__slider' }, range, ticks)),
          stats),
        plotA,
        tableA),
      h('p', { 'class': 'ac-cap' }, 'Values as printed in Figure 4 (middle). This ', h('var', null, 'q'),
        ' sweep is a separate evaluation from Table 1; its averages are not directly comparable with Table 1.'));

    var idx = -1;
    function render(i) {
      if (i === idx) { return; }
      idx = i;
      var p = pts[i], x = p.x.toFixed(3) + '%', y = p.y.toFixed(3) + '%';
      range.value = String(i);
      range.style.setProperty('--t', String(i / (n - 1)));
      range.setAttribute('aria-valuetext', 'q = ' + Q_SWEEP.q[i] + ': ' + Q_SWEEP.loops[i] + ' loops per token, average score ' + Q_SWEEP.score[i]);
      qOut.textContent = 'q = ' + Q_SWEEP.q[i];
      statLoops.textContent = Q_SWEEP.loops[i];
      statScore.textContent = Q_SWEEP.score[i];
      sel.style.left = x;
      sel.style.bottom = y;
      guideV.style.left = x;
      guideV.style.height = y;
      guideH.style.bottom = y;
      guideH.style.width = x;
      ptEls.forEach(function (el, j) { el.classList.toggle('is-on', j === i); });
      each(ticks.children, function (el, j) { el.classList.toggle('is-on', j === i); });
    }

    /* One-time sweep q = 0.1 -> 0.4 when the chart first becomes visible.
       Skipped under reduced motion (final state shown), paused off-screen or in a
       hidden tab, cancelled by any user input. */
    var play = { active: false, done: reduced, raf: 0, last: 0, step: 750, stopVis: null };
    function stopPlay(finish) {
      if (play.raf) { cancelAnimationFrame(play.raf); }
      play.raf = 0;
      play.active = false;
      play.done = true;
      if (play.stopVis) { play.stopVis(); play.stopVis = null; }
      if (finish) { render(n - 1); }
    }
    function tick(t) {
      play.raf = 0;
      if (!play.active) { return; }
      if (!play.last) { play.last = t; }
      if (t - play.last >= play.step) {
        play.last = t;
        render(Math.min(idx + 1, n - 1));
        if (idx >= n - 1) { stopPlay(false); return; }
      }
      play.raf = requestAnimationFrame(tick);
    }
    function startPlay() {
      if (play.done || play.active) { return; }
      play.active = true;
      play.last = 0;
      play.raf = requestAnimationFrame(tick);
    }
    function pausePlay() {
      if (!play.active) { return; }
      play.active = false;
      if (play.raf) { cancelAnimationFrame(play.raf); play.raf = 0; }
    }
    function userSelect(i) {
      if (!play.done) { stopPlay(false); }
      render(i);
    }
    range.addEventListener('input', function () { userSelect(parseInt(range.value, 10) || 0); });
    range.addEventListener('pointerdown', function () { if (!play.done) { stopPlay(false); } });
    range.addEventListener('keydown', function () { if (!play.done) { stopPlay(false); } });

    render(reduced ? n - 1 : 0);

    /* ---------------- (b) First-pass halting probability by token category */
    var meanPos = pctStr(HALT.mean, HALT.x);
    var nRows = HALT.rows.length;
    var lp = h('div', { 'class': 'ac-lp', 'aria-hidden': 'true' });
    lp.appendChild(h('span', { 'class': 'ac-lp__meanrow' },
      h('span', { 'class': 'ac-lp__meanlabel', style: { left: meanPos } }, 'Mean ', HALT.mean)));
    var overlay = h('span', { 'class': 'ac-lp__overlay', style: { gridRow: '2 / span ' + nRows } });
    HALT.x.ticks.forEach(function (t) {
      overlay.appendChild(h('span', { 'class': 'ac-lp__grid', style: { left: pctStr(t, HALT.x) } }));
    });
    overlay.appendChild(h('span', { 'class': 'ac-lp__mean', style: { left: meanPos } }));
    lp.appendChild(overlay);
    HALT.rows.forEach(function (r, i) {
      var isFocus = r[0] === HALT.focus;
      var v = pct(r[1], HALT.x), m = pct(HALT.mean, HALT.x);
      var row = 'ac-lp__row' + (isFocus ? ' is-focus' : '');
      var style = { gridRow: String(i + 2) };
      lp.appendChild(h('span', { 'class': row + ' ac-lp__cat', style: style }, r[0]));
      var track = h('span', { 'class': row + ' ac-lp__track', style: style },
        h('span', { 'class': 'ac-lp__stem', style: { left: Math.min(v, m).toFixed(3) + '%', width: Math.abs(v - m).toFixed(3) + '%' } }),
        h('span', { 'class': 'ac-lp__dot', style: { left: v.toFixed(3) + '%' } }));
      if (isFocus) {
        track.appendChild(h('span', { 'class': 'ac-lp__note', style: { left: ((v + m) / 2).toFixed(3) + '%' } }, MINUS + HALT.belowMean));
      }
      lp.appendChild(track);
      lp.appendChild(h('span', { 'class': row + ' ac-lp__val', style: style }, r[1]));
    });
    var axis = h('span', { 'class': 'ac-lp__axis', style: { gridRow: String(nRows + 2) } });
    HALT.x.ticks.forEach(function (t) { axis.appendChild(h('span', { style: { left: pctStr(t, HALT.x) } }, t)); });
    lp.appendChild(axis);
    lp.appendChild(h('span', { 'class': 'ac-lp__xtitle', style: { gridRow: String(nRows + 3) } }, 'Mean first-pass halting probability'));

    var tableB = h('div', { 'class': 'sr-only' }, h('table', null,
      h('caption', null, 'Mean first-pass halting probability by token category for ALoDLM-8B, values as printed in Figure 4 (right). Cross-dataset mean: ' + HALT.mean + '.'),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Token category'), h('th', { scope: 'col' }, 'Mean first-pass halting probability'))),
      h('tbody', null, HALT.rows.map(function (r) {
        return h('tr', null, h('th', { scope: 'row' }, r[0]), h('td', null, r[1]));
      }))));

    var cardB = h('section', { 'class': 'ac-card ac-card--halt', 'aria-labelledby': 'ac-halt-title' },
      h('div', { 'class': 'ac-head' },
        h('p', { 'class': 'ac-label' }, h('b', null, 'Figure 4'), ' \u00b7 right'),
        h('h3', { 'class': 'ac-title', id: 'ac-halt-title' }, 'Token-adaptive recurrence'),
        h('p', { 'class': 'ac-sub' },
          h('strong', null, 'Numbers halt least'), ' at the first pass (', h('span', { 'class': 'ac-num' }, '0.369'),
          ', about ', h('span', { 'class': 'ac-num' }, HALT.belowMean), ' below the cross-dataset mean of ',
          h('span', { 'class': 'ac-num' }, HALT.mean), '), so they receive more latent refinement: a preference learned without difficulty labels.')),
      h('div', { 'class': 'ac-body' }, lp, tableB),
      h('p', { 'class': 'ac-cap' }, 'Mean first-pass halting probability of ALoDLM-8B by token category, averaged equally over GSM8K, MATH-500, MBPP (sanitized) and HumanEval. ' +
        'Values as printed in Figure 4 (right); the axis is zoomed to 0.35\u20130.45, while the figure above shows the bars from zero.'));

    root.appendChild(h('div', { 'class': 'ac-grid' }, cardA, cardB));

    /* autoplay wiring, after the DOM is in place */
    if (!play.done) {
      var onScreen = false;
      play.stopVis = A.onVisible(cardA, function (visible) {
        onScreen = visible;
        if (visible && !document.hidden) { startPlay(); } else { pausePlay(); }
      }, 0.4);
      if (play.done && play.stopVis) { play.stopVis(); play.stopVis = null; }
      A.onPageVisibility(function (pageVisible) {
        if (play.done) { return; }
        if (pageVisible && onScreen) { startPlay(); } else { pausePlay(); }
      });
      A.onReducedMotionChange(function (r) { if (r && !play.done) { stopPlay(true); } });
    }

    ui.setQ = function (i) { userSelect(Math.max(0, Math.min(n - 1, i | 0))); };
    ui.qState = function () { return { index: idx, q: Q_SWEEP.q[idx], playing: play.active, done: play.done }; };
  });
})();
