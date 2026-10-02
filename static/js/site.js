/* ==========================================================================
   site.js: shared page behaviour + the window.ALODLM API for widget scripts.

   Loaded as a classic deferred script after static/data/*.js and before the
   widget scripts, so widgets can use window.ALODLM immediately.

   Page behaviour
     - theme toggle (light/dark; a choice that differs from the system theme
       is remembered in localStorage inside try/catch)
     - scroll-spy on the nav (IntersectionObserver, aria-current="true"); the
       mobile chip row keeps the active or focused chip in view
     - heading permalinks for [data-anchor] headings
     - KaTeX rendering of [data-tex] elements (raw TeX stays visible in
       <code> when KaTeX is unavailable); display equations with line-broken
       forms (data-tex-mid / data-tex-narrow) show the widest form that fits
     - figure lightbox (<dialog id="lightbox">) for .fig cards / img[data-zoom]
     - copy buttons ([data-copy-target]) with clipboard API + fallback
     - CSS tooltips ([data-tip]) can be dismissed with Escape
     - hyphenated model names (e.g. ALoDLM-8B) are kept on one line

   window.ALODLM API
     prefersReducedMotion()            -> boolean
     onReducedMotionChange(cb)         -> unsubscribe(); cb(boolean)
     onVisible(el, cb, threshold=0.25) -> stop(); cb(visible:boolean, entry)
     onPageVisibility(cb)              -> unsubscribe(); cb(pageVisible:boolean)
     theme()                           -> 'light' | 'dark' (effective theme)
     setTheme('light' | 'dark')
     onThemeChange(cb)                 -> unsubscribe(); cb(theme)
     cssVar(name, el?)                 -> trimmed computed custom property
     passColors(s, {terminal})         -> {bg, ink} for commitment pass s
     announce(text)                    -> polite screen-reader announcement
     renderMath(root?)                 -> renders [data-tex] inside root
     tex(el, source, displayMode?)     -> sets data-tex on el and renders it
     lightbox.open({src, alt, title, captionHTML, zoomWidth, zoomMin, trigger})
     lightbox.close()
     copyText(text)                    -> Promise<boolean>
     mount(id | el, init)              -> clears fallback, sets data-mounted,
                                          runs init(el); restores fallback on error
     ready(fn)                         -> runs fn once the DOM is parsed
     h(tag, props, ...children)        -> HTMLElement builder
     svg(tag, props, ...children)      -> SVGElement builder
     icon(name, className?)            -> <svg><use href="#i-name"></svg>
     data.traces / data.results        -> window.ALODLM_TRACES / _RESULTS
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var THEME_KEY = 'alodlm-theme';
  var THEME_COLORS = { light: '#ffffff', dark: '#0b1220' };
  var SVGNS = 'http://www.w3.org/2000/svg';

  function mq(query) {
    try { return window.matchMedia ? window.matchMedia(query) : null; } catch (e) { return null; }
  }
  var mqDark = mq('(prefers-color-scheme: dark)');
  var mqReduce = mq('(prefers-reduced-motion: reduce)');

  /* ------------------------------------------------------------ utilities */
  function each(list, fn) { Array.prototype.forEach.call(list || [], fn); }
  function noop() {}

  function onMediaChange(m, fn) {
    if (!m) { return noop; }
    if (m.addEventListener) {
      m.addEventListener('change', fn);
      return function () { m.removeEventListener('change', fn); };
    }
    if (m.addListener) {
      m.addListener(fn);
      return function () { m.removeListener(fn); };
    }
    return noop;
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try {
      if (value == null) { window.localStorage.removeItem(key); }
      else { window.localStorage.setItem(key, value); }
    } catch (e) { /* private mode, blocked storage: ignore */ }
  }

  function dispatch(name, detail) {
    try { doc.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { /* very old browser */ }
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* --------------------------------------------------------- DOM builders */
  function append(el, child) {
    if (child == null || child === false || child === true) { return; }
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(doc.createTextNode(String(child)));
      return;
    }
    el.appendChild(child);
  }

  function setProps(el, props) {
    if (!props) { return; }
    Object.keys(props).forEach(function (key) {
      var v = props[key];
      if (v == null || v === false) { return; }
      if (key === 'class' || key === 'className') { el.setAttribute('class', v); }
      else if (key === 'text') { el.textContent = v; }
      else if (key === 'html') { el.innerHTML = v; }
      else if (key === 'style' && typeof v === 'object') {
        Object.keys(v).forEach(function (p) {
          if (p.indexOf('--') === 0) { el.style.setProperty(p, v[p]); } else { el.style[p] = v[p]; }
        });
      }
      else if (key === 'dataset' && typeof v === 'object') {
        Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
      }
      else if (key.slice(0, 2) === 'on' && typeof v === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), v);
      }
      else { el.setAttribute(key, v === true ? '' : v); }
    });
  }

  function h(tag, props) {
    var el = doc.createElement(tag);
    setProps(el, props);
    for (var i = 2; i < arguments.length; i++) { append(el, arguments[i]); }
    return el;
  }

  function svg(tag, props) {
    var el = doc.createElementNS(SVGNS, tag);
    setProps(el, props);
    for (var i = 2; i < arguments.length; i++) { append(el, arguments[i]); }
    return el;
  }

  function icon(name, className) {
    var s = svg('svg', { 'class': className || 'icon', 'aria-hidden': 'true', focusable: 'false' });
    var use = doc.createElementNS(SVGNS, 'use');
    use.setAttribute('href', '#i-' + name);
    s.appendChild(use);
    return s;
  }

  function ready(fn) {
    if (doc.readyState === 'loading') { doc.addEventListener('DOMContentLoaded', fn, { once: true }); }
    else { fn(); }
  }

  /* -------------------------------------------------------------- motion */
  function prefersReducedMotion() { return !!(mqReduce && mqReduce.matches); }
  function onReducedMotionChange(cb) {
    return onMediaChange(mqReduce, function () { cb(prefersReducedMotion()); });
  }

  /* ---------------------------------------------------------- visibility */
  function onVisible(el, cb, threshold) {
    var t = typeof threshold === 'number' ? threshold : 0.25;
    if (!el || typeof cb !== 'function') { return noop; }
    if (!('IntersectionObserver' in window)) { cb(true, null); return noop; }
    var steps = [];
    for (var i = 0; i <= 20; i++) { steps.push(i / 20); }
    var state = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var vh = en.rootBounds ? en.rootBounds.height : (window.innerHeight || 1);
        var visible = en.isIntersecting && (
          en.intersectionRatio >= t - 0.001 ||
          en.intersectionRect.height >= t * vh - 1   /* element taller than the viewport */
        );
        if (visible !== state) { state = visible; cb(visible, en); }
      });
    }, { threshold: steps });
    io.observe(el);
    return function () { io.disconnect(); };
  }

  function onPageVisibility(cb) {
    var fn = function () { cb(!doc.hidden); };
    doc.addEventListener('visibilitychange', fn);
    return function () { doc.removeEventListener('visibilitychange', fn); };
  }

  /* --------------------------------------------------------------- theme */
  var themeSubs = [];

  function systemTheme() { return mqDark && mqDark.matches ? 'dark' : 'light'; }

  function currentTheme() {
    var a = root.getAttribute('data-theme');
    if (a === 'light' || a === 'dark') { return a; }
    return systemTheme();
  }

  function syncThemeUI(theme) {
    var dark = theme === 'dark';
    each(doc.querySelectorAll('[data-theme-toggle]'), function (btn) {
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('data-tip', dark ? 'Switch to light theme' : 'Switch to dark theme');
    });
    var explicit = root.getAttribute('data-theme');
    each(doc.querySelectorAll('meta[name="theme-color"]'), function (m) {
      var media = m.getAttribute('media') || '';
      var which = explicit || (media.indexOf('dark') > -1 ? 'dark' : 'light');
      m.setAttribute('content', THEME_COLORS[which] || THEME_COLORS.light);
    });
  }

  function notifyTheme() {
    var theme = currentTheme();
    syncThemeUI(theme);
    themeSubs.slice().forEach(function (fn) {
      try { fn(theme); } catch (e) { if (window.console) { console.error(e); } }
    });
    dispatch('alodlm:themechange', { theme: theme });
  }

  /* A choice equal to the system theme is not stored, so the page follows the
     system again; only a choice that differs from it is remembered. */
  function setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') { return; }
    if (theme === systemTheme()) {
      root.removeAttribute('data-theme');
      storageSet(THEME_KEY, null);
    } else {
      root.setAttribute('data-theme', theme);
      storageSet(THEME_KEY, theme);
    }
    notifyTheme();
  }

  function onThemeChange(fn) {
    if (typeof fn !== 'function') { return noop; }
    themeSubs.push(fn);
    return function () {
      var i = themeSubs.indexOf(fn);
      if (i > -1) { themeSubs.splice(i, 1); }
    };
  }

  function initTheme() {
    each(doc.querySelectorAll('[data-theme-toggle]'), function (btn) {
      btn.addEventListener('click', function () {
        setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
      });
    });
    onMediaChange(mqDark, function () {
      if (!root.hasAttribute('data-theme')) { notifyTheme(); }
    });
    syncThemeUI(currentTheme());
  }

  function cssVar(name, el) {
    try { return getComputedStyle(el || root).getPropertyValue(name).trim(); } catch (e) { return ''; }
  }

  function passColors(s, opts) {
    var n = Math.max(1, Math.min(4, Math.round(+s || 1)));
    var p = opts && opts.terminal ? '--t' : '--d';
    return { bg: cssVar(p + n), ink: cssVar(p + n + '-ink') };
  }

  /* ------------------------------------------------------------ announce */
  function announce(text) {
    var node = doc.getElementById('a11y-live');
    if (!node) { return; }
    node.textContent = '';
    setTimeout(function () { node.textContent = String(text || ''); }, 40);
  }

  /* --------------------------------------------------------------- KaTeX */
  var KATEX_MACROS = {
    '\\E': '\\mathbb{E}',
    '\\KL': 'D_{\\mathrm{KL}}',
    '\\stopgrad': '\\operatorname{sg}',
    '\\Unif': '\\operatorname{Unif}',
    '\\emb': '\\operatorname{Emb}',
    '\\sigmoid': '\\sigma'
  };

  function showTexFallback(el, src) {
    var only = el.childNodes.length === 1 && el.firstChild.nodeName === 'CODE';
    if (!only) {
      el.textContent = '';
      var code = doc.createElement('code');
      code.textContent = src;
      el.appendChild(code);
    }
    el.classList.add('tex-fallback');
  }

  function renderTexEl(el) {
    var src = el.getAttribute('data-tex');
    if (!src) {
      src = (el.textContent || '').trim();
      if (!src) { return false; }
      el.setAttribute('data-tex', src);
    }
    if (el.getAttribute('data-tex-rendered') === src) { return true; }
    var katex = window.katex;
    if (!katex || typeof katex.render !== 'function') { showTexFallback(el, src); return false; }
    try {
      katex.render(src, el, {
        displayMode: el.hasAttribute('data-display'),
        throwOnError: false,
        strict: 'ignore',
        output: 'htmlAndMathml',
        macros: Object.assign({}, KATEX_MACROS)
      });
      el.setAttribute('data-tex-rendered', src);
      el.classList.remove('tex-fallback');
      return true;
    } catch (err) {
      showTexFallback(el, src);
      return false;
    }
  }

  function renderMath(scope) {
    var count = 0;
    each((scope || doc).querySelectorAll('[data-tex]'), function (el) {
      if (renderTexEl(el)) { count++; }
    });
    return count;
  }

  function setTex(el, src, displayMode) {
    if (!el) { return false; }
    el.setAttribute('data-tex', String(src));
    el.removeAttribute('data-tex-rendered');
    if (displayMode) { el.setAttribute('data-display', ''); } else { el.removeAttribute('data-display'); }
    return renderTexEl(el);
  }

  /* ------------------------------------------------------------ lightbox */
  var LB = null;

  function lbSetup() {
    var dlg = doc.getElementById('lightbox');
    if (!dlg) { return; }
    LB = {
      dlg: dlg,
      img: dlg.querySelector('.lightbox__img'),
      stage: dlg.querySelector('.lightbox__stage'),
      title: dlg.querySelector('.lightbox__title'),
      hint: dlg.querySelector('.lightbox__hint'),
      caption: dlg.querySelector('.lightbox__caption'),
      zoomBtn: dlg.querySelector('[data-lb-zoom]'),
      zoomLabel: dlg.querySelector('[data-lb-zoom-label]'),
      closeBtn: dlg.querySelector('[data-lb-close]'),
      supported: typeof dlg.showModal === 'function',
      trigger: null,
      zoomed: false,
      isSvg: false,
      zoomPref: 0,
      zoomMin: 0,
      drag: null,
      dragMoved: false
    };
    if (!LB.supported) { return; }

    LB.closeBtn.addEventListener('click', lbClose);
    LB.zoomBtn.addEventListener('click', function () { setZoom(!LB.zoomed); });
    LB.img.addEventListener('click', function (e) {
      if (LB.dragMoved) { LB.dragMoved = false; return; }
      setZoom(!LB.zoomed, e);
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) { lbClose(); } });
    dlg.addEventListener('close', function () {
      root.classList.remove('has-modal');
      dlg.classList.remove('is-zoomed', 'is-panning');
      LB.zoomed = false;
      var t = LB.trigger;
      LB.trigger = null;
      if (t && typeof t.focus === 'function' && doc.contains(t)) {
        try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
      }
    });
    dlg.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) { return; }
      if (e.key === '+' || e.key === '=') { setZoom(true); e.preventDefault(); }
      else if (e.key === '-' || e.key === '0') { setZoom(false); e.preventDefault(); }
    });

    /* Drag to pan with a mouse when zoomed (touch pans natively). */
    var stage = LB.stage;
    stage.addEventListener('pointerdown', function (e) {
      LB.dragMoved = false;
      if (!LB.zoomed || e.pointerType !== 'mouse' || e.button !== 0) { return; }
      LB.drag = { x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop, id: e.pointerId };
    });
    stage.addEventListener('pointermove', function (e) {
      var d = LB.drag;
      if (!d) { return; }
      var dx = e.clientX - d.x;
      var dy = e.clientY - d.y;
      if (!LB.dragMoved && Math.abs(dx) + Math.abs(dy) > 4) {
        LB.dragMoved = true;
        dlg.classList.add('is-panning');
        try { stage.setPointerCapture(d.id); } catch (err) { /* ignore */ }
      }
      if (LB.dragMoved) {
        stage.scrollLeft = d.sl - dx;
        stage.scrollTop = d.st - dy;
      }
    });
    function endDrag() {
      if (!LB.drag) { return; }
      try { stage.releasePointerCapture(LB.drag.id); } catch (err) { /* ignore */ }
      LB.drag = null;
      dlg.classList.remove('is-panning');
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    window.addEventListener('resize', function () {
      if (LB && LB.dlg.open) { setZoom(LB.zoomed); lbCaptionScroll(); }
    });
  }

  /* A caption taller than its box scrolls; while it does, it is a named,
     focusable region so keyboard users can scroll it too. */
  function lbCaptionScroll() {
    var c = LB.caption;
    if (!c) { return; }
    if (!c.hidden && c.scrollHeight > c.clientHeight + 1) {
      c.setAttribute('tabindex', '0');
      c.setAttribute('role', 'region');
      c.setAttribute('aria-label', 'Figure caption, scrolls');
    } else if (c.hasAttribute('tabindex')) {
      c.removeAttribute('tabindex');
      c.removeAttribute('role');
      c.removeAttribute('aria-label');
    }
  }

  function lbPad() {
    var p = parseFloat(getComputedStyle(LB.img).paddingLeft);
    return isNaN(p) ? 0 : p;
  }

  function lbFitWidth() {
    var nw = LB.img.naturalWidth || 0;
    var nh = LB.img.naturalHeight || 0;
    var pad = lbPad();
    var aw = Math.max(0, LB.stage.clientWidth - 2 * pad);
    var ah = Math.max(0, LB.stage.clientHeight - 2 * pad);
    if (!nw || !nh) { return aw; }
    var fit = Math.min(aw, ah * (nw / nh));
    if (!LB.isSvg) { fit = Math.min(fit, nw); }   /* never upscale bitmaps */
    return fit;
  }

  function lbZoomWidth(fit) {
    var nw = LB.img.naturalWidth || 0;
    var pref = LB.zoomPref || (LB.isSvg ? 2 * (nw || 800) : (nw || 1600));
    var w = Math.min(pref, fit * 2.2);
    if (LB.isSvg) { w = Math.max(w, fit * 1.8); }   /* vector: always a real enlargement */
    if (LB.zoomMin) { w = Math.max(w, LB.zoomMin); }
    if (!LB.isSvg && nw) { w = Math.min(w, Math.max(nw, LB.zoomMin || 0)); }
    return Math.round(w);
  }

  var mqTouch = mq('(hover: none)');
  function lbHint(canZoom) {
    if (!LB.hint) { return; }
    var touch = !!(mqTouch && mqTouch.matches);
    LB.hint.textContent = !canZoom ? '' : LB.zoomed
      ? (touch ? 'Drag to pan the zoomed figure' : 'Drag to pan \u00b7 Esc to close')
      : (touch ? 'Tap the figure to zoom' : 'Click the figure to zoom \u00b7 Esc to close');
  }

  function setZoom(on, ev) {
    if (!LB) { return; }
    var fit = lbFitWidth();
    var w = lbZoomWidth(fit);
    var canZoom = w >= fit * 1.3;
    LB.zoomBtn.hidden = !canZoom;
    LB.dlg.classList.toggle('no-zoom', !canZoom);
    if (on && !canZoom) { on = false; }

    /* Zoom to the clicked point; otherwise start at the left edge, where a
       multi-panel figure begins. */
    var fx = 0;
    var fy = 0.5;
    if (on && ev && typeof ev.clientX === 'number') {
      var r = LB.img.getBoundingClientRect();
      var pad = lbPad();
      fx = clamp01((ev.clientX - r.left - pad) / Math.max(1, r.width - 2 * pad));
      fy = clamp01((ev.clientY - r.top - pad) / Math.max(1, r.height - 2 * pad));
    }

    LB.zoomed = !!on;
    LB.dlg.classList.toggle('is-zoomed', LB.zoomed);
    LB.dlg.style.setProperty('--zoom-w', w + 'px');
    LB.zoomBtn.setAttribute('aria-pressed', LB.zoomed ? 'true' : 'false');
    if (LB.zoomLabel) { LB.zoomLabel.textContent = LB.zoomed ? 'Fit to screen' : 'Zoom in'; }
    lbHint(canZoom);
    var use = LB.zoomBtn.querySelector('use');
    if (use) { use.setAttribute('href', LB.zoomed ? '#i-zoom-out' : '#i-zoom-in'); }

    /* In fit mode, bitmaps are never upscaled past their natural size. */
    if (!LB.isSvg && LB.img.naturalWidth) {
      var pad2 = 2 * lbPad();
      LB.img.style.maxWidth = LB.zoomed ? '' : (LB.img.naturalWidth + pad2) + 'px';
      LB.img.style.maxHeight = LB.zoomed ? '' : (LB.img.naturalHeight + pad2) + 'px';
      LB.img.style.margin = LB.zoomed ? '' : 'auto';
    } else {
      LB.img.style.maxWidth = '';
      LB.img.style.maxHeight = '';
      LB.img.style.margin = '';
    }

    var stage = LB.stage;
    if (LB.zoomed) {
      var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
      raf(function () {
        stage.scrollLeft = fx * LB.img.offsetWidth - stage.clientWidth / 2;
        stage.scrollTop = fy * LB.img.offsetHeight - stage.clientHeight / 2;
      });
    } else {
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
    }
  }

  function lbOpen(opts) {
    opts = opts || {};
    if (!opts.src) { return; }
    if (!LB || !LB.supported) {
      window.open(opts.src, '_blank', 'noopener');
      return;
    }
    LB.trigger = opts.trigger || doc.activeElement;
    LB.title.textContent = opts.title || 'Figure';
    LB.caption.innerHTML = opts.captionHTML || '';
    LB.caption.hidden = !opts.captionHTML;
    LB.isSvg = /\.svg(?:[?#]|$)/i.test(opts.src);
    LB.zoomPref = +opts.zoomWidth || 0;
    LB.zoomMin = +opts.zoomMin || 0;
    LB.zoomed = false;
    LB.dlg.classList.remove('is-zoomed', 'is-panning');
    LB.img.alt = opts.alt || '';
    LB.img.style.maxWidth = '';
    LB.img.style.maxHeight = '';
    LB.img.style.margin = '';
    LB.img.src = opts.src;

    root.classList.add('has-modal');
    if (!LB.dlg.open) { LB.dlg.showModal(); }
    lbCaptionScroll();

    var decide = function () {
      setZoom(false);
      if (LB.zoomMin && lbFitWidth() < LB.zoomMin * 0.98) { setZoom(true); }
    };
    if (LB.img.complete && LB.img.naturalWidth) { decide(); }
    else { LB.img.addEventListener('load', decide, { once: true }); }
  }

  function lbClose() {
    if (LB && LB.dlg.open) { LB.dlg.close(); }
  }

  function openFigure(fig, trigger) {
    var img = fig.querySelector('img[data-zoom]') || fig.querySelector('img');
    if (!img) { return; }
    var label = fig.querySelector('.fig__label');
    var cap = fig.querySelector('figcaption');
    lbOpen({
      src: img.currentSrc || img.src,
      alt: img.getAttribute('alt') || '',
      title: label ? label.textContent.replace(/\s+/g, ' ').trim() : 'Figure',
      captionHTML: cap ? cap.innerHTML : '',
      zoomWidth: img.getAttribute('data-zoom-width'),
      zoomMin: img.getAttribute('data-zoom-min'),
      trigger: trigger || fig.querySelector('.fig__zoom') || img
    });
  }

  function initFigures() {
    doc.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) { return; }
      var btn = t.closest('.fig__zoom');
      if (btn) {
        var fig = btn.closest('.fig');
        if (fig) { e.preventDefault(); openFigure(fig, btn); }
        return;
      }
      var img = t.closest('img[data-zoom]');
      if (img && !img.closest('.lightbox')) {
        e.preventDefault();
        var f = img.closest('.fig');
        if (f) { openFigure(f, f.querySelector('.fig__zoom') || img); }
        else {
          lbOpen({
            src: img.currentSrc || img.src,
            alt: img.getAttribute('alt') || '',
            title: img.getAttribute('data-zoom-title') || 'Figure',
            zoomWidth: img.getAttribute('data-zoom-width'),
            zoomMin: img.getAttribute('data-zoom-min'),
            trigger: img
          });
        }
      }
    });
  }

  /* ---------------------------------------------------------------- copy */
  function legacyCopy(text) {
    var active = doc.activeElement;
    var ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '0';
    ta.style.opacity = '0';
    doc.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
    doc.body.removeChild(ta);
    if (active && typeof active.focus === 'function') {
      try { active.focus({ preventScroll: true }); } catch (e) { active.focus(); }
    }
    return ok;
  }

  function copyText(text) {
    text = String(text == null ? '' : text);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext !== false) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  function selectContents(el) {
    try {
      var range = doc.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) { /* ignore */ }
  }

  function initCopy() {
    doc.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-copy-target]') : null;
      if (!btn) { return; }
      var target = doc.getElementById(btn.getAttribute('data-copy-target'));
      if (!target) { return; }
      var label = btn.querySelector('.copy-btn__label');
      var status = doc.getElementById(btn.getAttribute('data-copy-status') || 'copy-status');
      copyText(target.textContent).then(function (ok) {
        clearTimeout(btn._alodlmCopyTimer);
        btn.classList.toggle('is-copied', ok);
        btn.classList.toggle('is-error', !ok);
        if (label) { label.textContent = ok ? 'Copied' : 'Copy failed'; }
        if (!ok) { selectContents(target); }
        var msg = ok ? 'Copied to clipboard.' : 'Copy failed. The text is selected; press Control+C or Command+C to copy it.';
        if (status) {
          status.textContent = '';
          setTimeout(function () { status.textContent = msg; }, 40);
        } else {
          announce(msg);
        }
        btn._alodlmCopyTimer = setTimeout(function () {
          btn.classList.remove('is-copied', 'is-error');
          if (label) { label.textContent = 'Copy'; }
        }, 2200);
      });
    });
  }

  /* ----------------------------------------------------------- scroll-spy */
  function initScrollSpy() {
    var links = {};
    each(doc.querySelectorAll('.nav__links a[href^="#"]'), function (a) {
      links[a.getAttribute('href').slice(1)] = a;
    });
    var row = doc.querySelector('.nav__links');
    var current;
    var EDGE = 32;   /* px a focused chip keeps from the row's fade masks */

    /* The chip row scrolls sideways on narrow screens (style.css). */
    function rowScrolls() { return !!row && row.scrollWidth > row.clientWidth + 2; }
    function scrollRow(left) {
      left = Math.max(0, Math.min(left, row.scrollWidth - row.clientWidth));
      if (Math.abs(left - row.scrollLeft) < 1) { return; }
      try { row.scrollTo({ left: left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }
      catch (e) { row.scrollLeft = left; }
    }
    /* center: the active chip (scroll-spy); otherwise just clear of the edges (focus) */
    function reveal(a, center) {
      if (!a || !rowScrolls()) { return; }
      var rr = row.getBoundingClientRect();
      var ar = a.getBoundingClientRect();
      if (center) { scrollRow(row.scrollLeft + (ar.left - rr.left) - (row.clientWidth - ar.width) / 2); }
      else if (ar.left < rr.left + EDGE) { scrollRow(row.scrollLeft - (rr.left + EDGE - ar.left)); }
      else if (ar.right > rr.right - EDGE) { scrollRow(row.scrollLeft + (ar.right - (rr.right - EDGE))); }
    }
    function syncEdges() {
      var max = row.scrollWidth - row.clientWidth;
      row.classList.toggle('is-scrolled', row.scrollLeft > 1);
      row.classList.toggle('is-end', max > 2 && row.scrollLeft >= max - 1);
    }

    function activate(key) {
      if (key === current) { return; }
      current = key;
      Object.keys(links).forEach(function (k) {
        if (k === key) { links[k].setAttribute('aria-current', 'true'); }
        else { links[k].removeAttribute('aria-current'); }
      });
      var a = key ? links[key] : null;
      if (a) { reveal(a, true); }
      else if (rowScrolls()) { scrollRow(0); }   /* no active chip: show the first ones */
    }

    if (row) {
      var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
      row.addEventListener('focusin', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a') : null;
        if (a) { raf(function () { reveal(a, false); }); }
      });
      row.addEventListener('scroll', syncEdges, { passive: true });
      window.addEventListener('resize', syncEdges);
      syncEdges();
    }

    if (!('IntersectionObserver' in window)) { return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { activate(en.target.getAttribute('data-spy') || null); }
      });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
    each(doc.querySelectorAll('[data-spy]'), function (s) { io.observe(s); });
  }

  /* ---------------------------------------------------- heading anchors */
  /* The heading text moves into a span that names the heading (and any region
     labelled by it), so the permalink does not become part of those names. */
  function initAnchors() {
    each(doc.querySelectorAll('[data-anchor]'), function (hd) {
      var id = hd.getAttribute('data-anchor');
      if (!id || hd.querySelector('.anchor')) { return; }
      var text = doc.createElement('span');
      text.id = (hd.id || 'h-' + id) + '-text';
      while (hd.firstChild) { text.appendChild(hd.firstChild); }
      hd.appendChild(text);
      hd.setAttribute('aria-labelledby', text.id);
      if (hd.id) {
        each(doc.querySelectorAll('[aria-labelledby="' + hd.id + '"]'), function (el) {
          el.setAttribute('aria-labelledby', text.id);
        });
      }
      var a = doc.createElement('a');
      a.className = 'anchor';
      a.href = '#' + id;
      a.textContent = '#';
      a.setAttribute('aria-label', 'Link to section: ' + (text.textContent || '').replace(/\s+/g, ' ').trim());
      hd.appendChild(a);
    });
  }

  /* ------------------------------------------------------------ tooltips */
  /* Escape hides the CSS tooltip ([data-tip]) that is shown by hover or focus,
     until the pointer has left the element and focus has moved away. */
  function initTips() {
    function release(el) {
      if (el.matches(':hover') || el === doc.activeElement) { return false; }
      el.removeAttribute('data-tip-off');
      return true;
    }
    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.key !== 'Esc') { return; }
      var shown = [];
      each(doc.querySelectorAll('[data-tip]:hover'), function (el) { shown.push(el); });
      var f = doc.activeElement && doc.activeElement.closest ? doc.activeElement.closest('[data-tip]') : null;
      if (f) { shown.push(f); }
      shown.forEach(function (el) {
        if (el.hasAttribute('data-tip-off')) { return; }
        el.setAttribute('data-tip-off', '');
        var off = function () {
          setTimeout(function () {
            if (release(el)) {
              el.removeEventListener('pointerleave', off);
              el.removeEventListener('focusout', off);
            }
          }, 0);
        };
        el.addEventListener('pointerleave', off);
        el.addEventListener('focusout', off);
      });
    });
  }

  /* ------------------------------------------- responsive display equations */
  /* A display equation may carry narrower, line-broken forms of the same TeX
     (data-tex-mid, data-tex-narrow). The widest form that fits its box is shown.
     A form that still overflows scrolls sideways; while it does, the box is a
     named, focusable group so keyboard users can scroll it. */
  var eqEls = [];
  var eqQueued = 0;
  var fontEpoch = 0;

  /* Width the rendered maths needs: squeezed to 1px, the box scrolls by
     exactly the content's extent, including glyphs that stick out of their
     base (big delimiters) and excluding clipped parts (stretchy SVGs). */
  function texWidth(el) {
    var prev = el.style.width;
    el.style.width = '1px';
    var w = el.scrollWidth;
    el.style.width = prev;
    return w;
  }

  function eqKey(el) {
    var k = el.querySelector('.katex');
    return (k ? getComputedStyle(k).fontSize : '') + '|' + fontEpoch;
  }

  /* Natural width of every form at the current maths size (cached per size). */
  function formWidths(el) {
    var key = eqKey(el);
    el._texW = el._texW || {};
    if (!el._texW[key]) {
      el._texW[key] = el._texForms.map(function (src) { setTex(el, src, true); return texWidth(el); });
    }
    return el._texW[key];
  }

  function firstFit(widths, avail) {
    for (var i = 0; i < widths.length; i++) { if (widths[i] <= avail + 0.5) { return i; } }
    return -1;
  }

  function fitEq(el) {
    var forms = el._texForms;
    var avail = el.clientWidth;
    if (!forms || !avail) { return; }              /* not set up, or hidden (closed <details>) */
    if (window.katex) {
      /* Widest form that fits; if none does, the same at body size (.is-tight). */
      el.classList.remove('is-tight');
      var pick = firstFit(formWidths(el), avail);
      if (pick < 0) {
        el.classList.add('is-tight');
        pick = firstFit(formWidths(el), avail);
        if (pick < 0) { pick = forms.length - 1; }
      }
      if (el.getAttribute('data-tex-rendered') !== forms[pick]) { setTex(el, forms[pick], true); }
    }
    var over = el.scrollWidth > el.clientWidth + 1;
    if (over) {
      var eq = el.closest('.eq');
      var lab = eq ? eq.querySelector('.eq__label') : null;
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', (lab ? lab.textContent.replace(/\s+/g, ' ').trim() : 'Equation') + ', scrolls sideways');
    } else if (el.hasAttribute('tabindex')) {
      el.removeAttribute('tabindex');
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
    }
  }

  function initEqFit() {
    each(doc.querySelectorAll('.eq__math[data-tex][data-display]'), function (el) {
      var forms = [el.getAttribute('data-tex') || (el.textContent || '').trim()];
      ['data-tex-mid', 'data-tex-narrow'].forEach(function (name) {
        var v = el.getAttribute(name);
        if (v) { forms.push(v.trim()); }
      });
      el._texForms = forms;
      eqEls.push(el);
    });
    if (!eqEls.length) { return; }
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    var run = function () { eqQueued = 0; eqEls.forEach(fitEq); };
    var queue = function () { if (!eqQueued) { eqQueued = raf(run); } };
    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(queue);
      eqEls.forEach(function (el) { ro.observe(el); });
    } else {
      window.addEventListener('resize', queue);
    }
    each(doc.querySelectorAll('details'), function (d) { d.addEventListener('toggle', queue); });
    /* Widths depend on the KaTeX fonts: measure again once they have loaded. */
    if (doc.fonts) {
      var refresh = function () { fontEpoch++; queue(); };
      if (doc.fonts.ready && typeof doc.fonts.ready.then === 'function') { doc.fonts.ready.then(refresh, noop); }
      if (doc.fonts.addEventListener) { doc.fonts.addEventListener('loadingdone', refresh); }
    }
    run();
  }

  /* ------------------------------------------------ model names on one line */
  var NAME_RE = /\b(?:ALoDLM|Qwen3|WeDLM|SDAR|LLaDA|Dream)-(?:1\.7|7|8)B\b|\bFast-dLLM-v2\b|\bvLLM-served\b/g;
  var NAME_SKIP = 'script, style, code, pre, kbd, samp, textarea, select, option, svg, .nowrap, .katex, [data-tex], .dr-tx, .sr-only, .visually-hidden';

  function keepNames(scope) {
    if (!scope || !doc.createTreeWalker) { return; }
    var walker = doc.createTreeWalker(scope, 4 /* NodeFilter.SHOW_TEXT */, null);
    var hits = [];
    var node;
    while ((node = walker.nextNode())) {
      NAME_RE.lastIndex = 0;
      if (!NAME_RE.test(node.nodeValue)) { continue; }
      var p = node.parentElement;
      if (p && !p.closest(NAME_SKIP)) { hits.push(node); }
    }
    hits.forEach(function (n) {
      var text = n.nodeValue;
      var frag = doc.createDocumentFragment();
      var last = 0;
      var m;
      NAME_RE.lastIndex = 0;
      while ((m = NAME_RE.exec(text))) {
        if (m.index > last) { frag.appendChild(doc.createTextNode(text.slice(last, m.index))); }
        var s = doc.createElement('span');
        s.className = 'nowrap';
        s.textContent = m[0];
        frag.appendChild(s);
        last = m.index + m[0].length;
      }
      if (last < text.length) { frag.appendChild(doc.createTextNode(text.slice(last))); }
      n.parentNode.replaceChild(frag, n);
    });
  }

  /* --------------------------------------------- aria-disabled controls */
  function initDisabled() {
    doc.addEventListener('click', function (e) {
      var d = e.target && e.target.closest ? e.target.closest('[aria-disabled="true"]') : null;
      if (d) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  /* ------------------------------------------------------------ mounting */
  function mount(target, init) {
    var el = typeof target === 'string' ? doc.getElementById(target) : target;
    if (!el || typeof init !== 'function') { return null; }
    if (el.hasAttribute('data-mounted')) { return el; }
    var fallback = doc.createDocumentFragment();
    while (el.firstChild) { fallback.appendChild(el.firstChild); }
    el.setAttribute('data-mounted', '');
    try {
      init(el);
      return el;
    } catch (err) {
      el.textContent = '';
      el.appendChild(fallback);
      el.removeAttribute('data-mounted');
      if (window.console) { console.error('[ALODLM] widget "' + (el.id || '?') + '" failed to mount:', err); }
      return null;
    }
  }

  /* ---------------------------------------------------------------- API */
  var data = {};
  Object.defineProperty(data, 'traces', { enumerable: true, get: function () { return window.ALODLM_TRACES || null; } });
  Object.defineProperty(data, 'results', { enumerable: true, get: function () { return window.ALODLM_RESULTS || null; } });

  var api = window.ALODLM || {};
  api.version = '1.0.0';
  api.prefersReducedMotion = prefersReducedMotion;
  api.onReducedMotionChange = onReducedMotionChange;
  api.onVisible = onVisible;
  api.onPageVisibility = onPageVisibility;
  api.theme = currentTheme;
  api.setTheme = setTheme;
  api.onThemeChange = onThemeChange;
  api.cssVar = cssVar;
  api.passColors = passColors;
  api.announce = announce;
  api.renderMath = renderMath;
  api.tex = setTex;
  api.lightbox = { open: lbOpen, close: lbClose };
  api.copyText = copyText;
  api.mount = mount;
  api.ready = ready;
  api.h = h;
  api.svg = svg;
  api.icon = icon;
  api.data = data;
  window.ALODLM = api;

  /* --------------------------------------------------------------- init */
  ready(function () {
    var steps = [initTheme, initAnchors, initScrollSpy, lbSetup, initFigures, initCopy, initDisabled, initTips,
      function () { renderMath(doc); }, initEqFit];
    steps.forEach(function (fn) {
      try { fn(); } catch (err) { if (window.console) { console.error('[ALODLM] init step failed:', err); } }
    });
  });

  /* After every deferred script has run, so widget text is included. */
  function afterWidgets() {
    try { keepNames(doc.body); } catch (err) { if (window.console) { console.error('[ALODLM] init step failed:', err); } }
  }
  if (doc.readyState === 'complete') { afterWidgets(); }
  else { doc.addEventListener('DOMContentLoaded', afterWidgets, { once: true }); }
})();

/* Mobius "oo" in the hero title: enable the ribbon only once Google Sans 700 is
   available (it is fitted to that face); otherwise the real letters stay visible. */
(function () {
  var h1 = document.querySelector('.hero__title');
  if (!h1 || !h1.querySelector('.mobius') || !document.fonts || !document.fonts.load) { return; }
  document.fonts.load('700 1em "Google Sans"').then(function (faces) {
    if (faces && faces.length) { h1.classList.add('mobius-on'); }
  }, function () {});
})();
