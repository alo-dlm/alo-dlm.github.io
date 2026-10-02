/* ==========================================================================
   results.js: Table 1 (main results).

   Mounts
     #results-table   (data-widget="results")          Table 1, from window.ALODLM_RESULTS

   Uses window.ALODLM from static/js/site.js.
   Styles: static/css/results.css (prefix rt-).
   Debug hook: window.ALODLM_RESULTS_UI (state setters and the result of the data check).
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
    if (n < 2) { return 'DLM'; }
    /* Narrow screens show the short form, so the sticky Ours column never
       covers the label (results.css). */
    return [h('span', { 'class': 'rt-grp__full' }, 'Diffusion LMs'), h('span', { 'class': 'rt-grp__abbr' }, 'DLM')];
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
})();
