/* Continual Learning for Embodied AI: page shell (app.js, loaded last with defer).

   Creates window.CLEAI = { data, bus, modules, util }, renders the shell from window.CLEAI_DATA (data/site-data.js,
   schema in data/SCHEMA.md) and then calls CLEAI.modules[name].init() for every registered module.
   The shell owns: hero, scroll progress, table of contents with scroll-spy, lightbox, abstract, inline figures,
   figure gallery, propositions grid, settings tabs, programs accordion, assessment boxes, citation block, footer,
   reference popovers for citation links and the shared tooltip.
   Contract for the modules (charts.js, explorer.js, library.js): ../../DESIGN.md. No framework, no build step. */
(function () {
  'use strict';

  /* ================================================================== namespace */
  var NS = (window.CLEAI = window.CLEAI || { modules: {} });
  if (!NS.modules) NS.modules = {};
  var D = window.CLEAI_DATA || null;
  NS.data = D;
  if (!(NS.bus instanceof EventTarget)) NS.bus = new EventTarget();
  var bus = NS.bus;

  /* ================================================================== helpers */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  /* rich-text objects {text, html, cites, pos}: insert html as is (the builder emits safe HTML only) */
  const rich = r => (r == null ? '' : typeof r === 'string' ? esc(r) : r.html != null ? r.html : esc(r.text || ''));
  const plain = r => (r == null ? '' : typeof r === 'string' ? r : r.text || '');
  const get = (path, root) => String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), root === undefined ? D : root);
  const icon = (id, cls) => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtDate = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso || '');
  };
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  const on = (name, fn) => { bus.addEventListener(name, fn); return () => bus.removeEventListener(name, fn); };
  const debounce = (fn, ms) => { let t = 0; return function () { const a = arguments, self = this; clearTimeout(t); t = setTimeout(() => fn.apply(self, a), ms); }; };
  const capitalizeFirst = html => String(html).replace(/^((?:\s|<[^>]+>)*)([a-z])/, (m, tags, ch) => tags + ch.toUpperCase());
  /* URL fragments: a malformed escape (#evidence?q=100%) is kept as written instead of throwing */
  const decode = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  const safe = (name, fn) => { try { return fn(); } catch (err) { console.error('[CLEAI] shell: ' + name + ' failed:', err); return undefined; } };

  /* element builder: h('button', {class: 'btn', type: 'button', onClick: fn, 'aria-label': '…'}, [children]) */
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(k => {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    [].concat(children == null ? [] : children).forEach(c => {
      if (c == null || c === false) return;
      el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  /* per-viewer conveniences only; the page works without storage */
  const store = {
    get(key, fallback) {
      try { const v = window.localStorage.getItem('cleai:' + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { window.localStorage.setItem('cleai:' + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    }
  };

  /* runs fn once, on the next animation frame or after 100 ms, whichever comes first
     (frames are throttled in background tabs and some embedded views; work must not stall there) */
  function nextFrame(fn) {
    let done = false, t = 0;
    const go = () => { if (done) return; done = true; clearTimeout(t); fn(); };
    t = setTimeout(go, 100);
    requestAnimationFrame(go);
  }

  /* calls cb(width, height) once the element has a non-zero width and again whenever that width changes
     (height-only changes are ignored, so a chart that sets its own height does not loop); returns a disconnect fn */
  function onResize(el, cb) {
    let lastW = -1, pending = false, live = true;
    const run = () => {
      pending = false;
      if (!live) return;
      const w = el.clientWidth;
      if (!w || w === lastW) return;
      lastW = w;
      cb(w, el.clientHeight);
    };
    const queue = () => { if (!pending) { pending = true; nextFrame(run); } };
    let ro = null;
    if ('ResizeObserver' in window) { ro = new ResizeObserver(queue); ro.observe(el); }
    else window.addEventListener('resize', queue);
    queue();
    return () => { live = false; if (ro) ro.disconnect(); else window.removeEventListener('resize', queue); };
  }

  /* ------------------------------------------------------------------ toast and clipboard */
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
  }
  function copyText(text) {
    const fallback = () => new Promise(resolve => {
      const prev = document.activeElement;
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
      /* inside the open popover or dialog, so that focus never leaves it (which would close the popover) */
      ((prev && prev.closest && prev.closest('.popover, [role="dialog"]')) || document.body).appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (prev && prev.focus) prev.focus({ preventScroll: true });
      resolve(ok);
    });
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, fallback);
    return fallback();
  }
  function copy(text, okMsg) {
    return copyText(String(text)).then(ok => {
      toast(ok ? (okMsg || 'Copied to the clipboard') : 'Copy failed: select the text and copy it manually');
      return ok;
    });
  }

  /* ------------------------------------------------------------------ shared tooltip (#cleai-tooltip) */
  const tooltip = (function () {
    let el = null, anchor = null, queued = false;
    const node = () => {
      if (!el) el = $('#cleai-tooltip') || document.body.appendChild(h('div', { class: 'tooltip', id: 'cleai-tooltip', role: 'tooltip', hidden: true }));
      return el;
    };
    /* after any scroll (page or inner container): a readout anchored to an element follows it and hides once the
       element leaves the viewport; a readout placed at the pointer or at {x, y} no longer points at anything and hides */
    const onScroll = () => {
      if (!el || el.hidden || queued) return;
      queued = true;
      nextFrame(() => {
        queued = false;
        if (!el || el.hidden) return;
        const r = anchor && document.contains(anchor) ? anchor.getBoundingClientRect() : null;
        if (!r || (!r.width && !r.height) || r.bottom < 0 || r.top > window.innerHeight) { el.hidden = true; anchor = null; return; }
        place(0, 0, anchor);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    function place(x, y, anchor) {
      const t = node();
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      const w = t.offsetWidth, ht = t.offsetHeight;
      let left, top;
      if (anchor) {
        const r = anchor.getBoundingClientRect();
        left = r.left + r.width / 2 - w / 2;
        top = r.top - ht - 8;
        if (top < 8) top = r.bottom + 8;
      } else {
        left = x + 14; top = y + 16;
        if (left + w > vw - 8) left = x - w - 14;
        if (top + ht > vh - 8) top = y - ht - 12;
      }
      t.style.left = Math.round(Math.max(8, Math.min(left, vw - w - 8))) + 'px';
      t.style.top = Math.round(Math.max(8, Math.min(top, vh - ht - 8))) + 'px';
    }
    return {
      /* content: HTML string (escape it yourself) or, with {text: true}, plain text.
         at: an Element (placed above it), a MouseEvent, or {x, y} in viewport pixels.
         A readout anchored to an element can be hovered (WCAG 1.4.13); one that follows the pointer cannot. */
      show(content, at, opts) {
        const t = node();
        if (opts && opts.text) t.textContent = content; else t.innerHTML = content;
        t.hidden = false;
        anchor = at && at.nodeType === 1 ? at : null;
        t.classList.toggle('is-hoverable', !!anchor);
        if (anchor) place(0, 0, anchor);
        else if (at && typeof at.clientX === 'number') place(at.clientX, at.clientY);
        else if (at && typeof at.x === 'number') place(at.x, at.y);
        else place(16, 16);
      },
      move(evt) { if (el && !el.hidden) { anchor = null; el.classList.remove('is-hoverable'); place(evt.clientX, evt.clientY); } },
      hide() { if (el) el.hidden = true; anchor = null; },
      get visible() { return !!(el && !el.hidden); },
      get element() { return node(); }
    };
  })();

  /* ------------------------------------------------------------------ modal helpers (scroll lock, focus trap) */
  const modal = (function () {
    let locks = 0, savedPad = '';
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = root => $$(FOCUSABLE, root).filter(el => el.getClientRects().length > 0 && !el.closest('[hidden]'));
    return {
      lock() {
        if (locks++ > 0) return;
        const sw = window.innerWidth - document.documentElement.clientWidth;
        savedPad = document.body.style.paddingRight;
        document.documentElement.style.overflow = 'hidden';
        if (sw > 0) document.body.style.paddingRight = sw + 'px';
      },
      unlock() {
        if (locks === 0 || --locks > 0) return;
        document.documentElement.style.overflow = '';
        document.body.style.paddingRight = savedPad;
      },
      isOpen() { return locks > 0; },                  /* a dialog (figure viewer, study drawer) is open */
      focusables,
      /* call from a keydown handler: keeps Tab inside root; returns true when it moved focus */
      trap(root, evt) {
        if (evt.key !== 'Tab') return false;
        const f = focusables(root);
        if (!f.length) { evt.preventDefault(); return true; }
        const first = f[0], last = f[f.length - 1], act = document.activeElement;
        if (evt.shiftKey && (act === first || !root.contains(act))) { evt.preventDefault(); last.focus(); return true; }
        if (!evt.shiftKey && (act === last || !root.contains(act))) { evt.preventDefault(); first.focus(); return true; }
        return false;
      }
    };
  })();

  function flash(el, ms) {
    if (!el) return;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), ms || 1600);
  }

  /* ================================================================== data lookups */
  const LIB = (D && D.library) || [];
  const FIGS = (D && D.figures) || [];
  const PROPS = (D && D.propositions && D.propositions.items) || [];
  const refByKey = new Map(LIB.map(r => [r.key, r]));
  const studyByKey = new Map(((D && D.studies) || []).map(s => [s.key, s]));
  const benchKeys = new Set(((D && D.benchmarks) || []).map(b => b.key));
  const figById = new Map(FIGS.map(f => [f.id, f]));
  const figByN = new Map(FIGS.map(f => [f.n, f]));
  const propByN = new Map(PROPS.map(p => [p.n, p]));
  const axisByCode = new Map(((D && D.axes) || []).map(a => [a.code, a]));
  const secById = new Map();
  (function walk(list) { (list || []).forEach(s => { secById.set(s.id, s); walk(s.subsections); }); })(D && D.sections);
  const iconSrc = name => (name && D && D.icons && D.icons.files && D.icons.files[name]) || null;
  const INK = { T: '#0E6B6B', E: '#7A4D00', B: '#A13A2C', F: '#4F3DB0', FM: '#1D5F99' };
  const axisColor = code => {
    const a = axisByCode.get(code);
    if (code === 'FM') return { color: '#4A9FE0', light: '#E3F0FB', ink: INK.FM };
    return a ? { color: a.color, light: a.light, ink: INK[code] || '#3E4A59' } : { color: '#3E4A59', light: '#EEF1F4', ink: '#3E4A59' };
  };
  const evidenceColor = code => ((D && D.meta && D.meta.evidence_colors) || {})[code] || null;
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* manuscript section id -> page target ({id, axis?}) */
  const SETTINGS_BY_SECTION = {};
  ((D && D.settings) || []).forEach(s => { SETTINGS_BY_SECTION[s.section] = s.axis; });
  function pageTarget(secId) {
    const id = String(secId == null ? '' : secId);
    const parts = id.split('.'), top = parts[0];
    if (SETTINGS_BY_SECTION[top]) return { id: 'settings', axis: SETTINGS_BY_SECTION[top] };
    if (top === '1' && parts[1] === '3') return { id: 'evidence' };
    if (top === '1' && parts[1] === '4') return { id: 'propositions' };
    if (top === '9') return { id: !parts[1] || parts[1] === '1' || parts[1] === '2' ? 'benchmarks' : 'evaluation' };
    const MAP = { 1: 'overview', 2: 'formulation', 3: 'mechanisms', 4: 'foundation', 10: 'outlook', 11: 'conclusion' };
    return MAP[top] ? { id: MAP[top] } : null;
  }
  function scrollToEl(el, opts) {
    if (!el) return;
    opts = opts || {};
    el.scrollIntoView({ block: opts.block || 'start', behavior: 'auto' });
    if (opts.focus === false) return;
    let target = el;
    if (el.matches('section')) target = $('h2', el) || el;
    if (!target.matches('a[href], button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  function goToSection(secId, opts) {
    const t = pageTarget(secId);
    if (!t) return false;
    if (t.axis) showSettingsTab(t.axis);
    const el = document.getElementById(t.id);
    if (!el) return false;
    scrollToEl(el, opts);
    return true;
  }

  /* ================================================================== hero */
  function bylineHTML(P) {
    const authors = (P.authors || []).map(a => {
      const marks = (a.affiliations || []).map(String);
      let sr = '';
      if (a.equal) { marks.push('†'); sr += ' (equal contribution)'; }
      if (a.corresponding) { marks.push('*'); sr += ' (corresponding author)'; }
      return `<span class="author">${esc(a.name)}${marks.length ? `<sup>${esc(marks.join(','))}</sup>` : ''}${sr ? `<span class="sr-only">${sr}</span>` : ''}</span>`;
    }).join(',\n');
    const affils = (P.affiliations || []).map(af => `<li title="${esc(af.name)}"><sup>${esc(af.n)}</sup>${esc(af.short || af.name)}</li>`).join('');
    const notes = [];
    const N = P.notes || {};
    if (N.equal && (P.authors || []).some(a => a.equal)) notes.push(`<span class="note-item"><sup aria-hidden="true">†</sup> ${esc(N.equal)}</span>`);
    if (N.corresponding) {
      let txt = esc(N.corresponding);
      (P.authors || []).filter(a => a.corresponding && a.email).forEach(a => {
        const e = esc(a.email);
        txt = txt.split(e).join(`<a href="mailto:${e}">${e}</a>`);
      });
      notes.push(`<span class="note-item"><sup aria-hidden="true">*</sup> ${txt}</span>`);
    }
    return `<p class="authors">${authors}</p>` +
      (affils ? `<ol class="affils" aria-label="Affiliations">${affils}</ol>` : '') +
      (notes.length ? `<p class="hero-notes">${notes.join('\n')}</p>` : '');
  }
  function actionsHTML(M) {
    const paper = M.paper || {};
    const url = /^https:\/\//.test(String(paper.url || '')) ? paper.url : null;   /* only https links become buttons */
    const paperBtn = url
      ? `<a class="btn btn-primary" href="${esc(url)}">${icon('doc')}Paper${paper.arxiv ? ' (arXiv)' : ''}</a>`
      : `<button type="button" class="btn" disabled>${icon('doc')}Paper (arXiv, coming soon)</button>`;
    return paperBtn +
      `<a class="btn btn-primary" href="#citation">${icon('braces')}BibTeX</a>` +
      `<a class="btn btn-primary" href="#library">${icon('books')}Library</a>`;
  }
  /* bare logos at one height, as on the world model survey page; institutions without a logo file are named in
     plain text (the full name when it is short, else the usual abbreviation) */
  function logoHTML(ins) {
    if (ins.logo && ins.logo.src) {
      const ht = 46, w = Math.round((Number(ins.logo.w) / Number(ins.logo.h)) * ht) || ht;
      return `<li class="logo" title="${esc(ins.name)}"><img src="${esc(ins.logo.src)}" alt="${esc(ins.logo.alt || ins.name + ' logo')}" width="${w}" height="${ht}" decoding="async"></li>`;
    }
    const name = String(ins.name || '').length <= 32 ? ins.name : (ins.short || ins.name);
    return `<li class="logo logo-name"${name !== ins.name ? ` title="${esc(ins.name)}"` : ''}>${esc(name)}</li>`;
  }
  const TOY_NAMES = { arm: 'a robot arm', quadruped: 'a quadruped', car: 'a car', humanoid: 'a humanoid robot' };
  function renderHeroVisual(M) {
    const card = $('#hero-card');
    if (!card) return;
    const hero = M.hero;
    if (hero && hero.src) {
      let img = $('img', card);
      if (!img) { img = h('img', { decoding: 'async', fetchpriority: 'high' }); card.replaceChildren(img); }
      const set = (k, v) => { if (v != null && img.getAttribute(k) !== String(v)) img.setAttribute(k, String(v)); };
      set('src', hero.src); set('srcset', hero.srcset); set('width', hero.w); set('height', hero.h); set('alt', hero.alt || '');
      return;
    }
    const toys = M.hero_fallback || [];
    if (toys.length) {
      card.innerHTML = `<div class="hero-composite">${toys.map(t => `<img src="${esc(t.src)}" width="${esc(t.w)}" height="${esc(t.h)}" alt="" decoding="async">`).join('')}</div>`;
      card.setAttribute('role', 'img');
      card.setAttribute('aria-label', 'Illustrations of ' + toys.map(t => TOY_NAMES[t.name] || t.name).join(', ').replace(/, ([^,]*)$/, ' and $1') + '.');
      return;
    }
    /* no illustration: the text column (with the logos under the byline) takes the full width */
    const visual = card.parentElement;
    if (visual) visual.hidden = true;
    const hero0 = $('.hero');
    if (hero0) hero0.classList.add('no-visual');
  }
  function renderHero() {
    const M = D.meta || {}, P = D.people || {};
    const title = $('#hero-title'), sub = $('#hero-subtitle');
    if (title && M.title && title.textContent !== M.title) title.textContent = M.title;
    if (sub && M.subtitle && sub.textContent !== M.subtitle) sub.textContent = M.subtitle;
    const by = $('#hero-byline');
    if (by && P.authors && P.authors.length) by.innerHTML = bylineHTML(P);
    const act = $('#hero-actions');
    if (act) act.innerHTML = actionsHTML(M);
    const meta = $('#hero-meta');
    if (meta) {
      const bits = [];
      if (M.manuscript_date) bits.push('Manuscript version of ' + M.manuscript_date);
      if (M.literature_cutoff) bits.push('literature reviewed to ' + M.literature_cutoff);
      meta.innerHTML = bits.map(b => `<span class="nowrap">${esc(b)}</span>`).join(' · ');
      meta.hidden = !bits.length;
    }
    const logos = $('#hero-logos');
    if (logos && P.institutions && P.institutions.length) logos.innerHTML = P.institutions.map(logoHTML).join('');
    renderHeroVisual(M);
  }

  /* ================================================================== text from the data */
  function fillText() {
    $$('[data-rich]').forEach(el => {
      const v = get(el.dataset.rich);
      if (v == null || (typeof v === 'object' && v.html == null && v.text == null)) { el.hidden = true; return; }
      let html = rich(v);
      if (el.hasAttribute('data-capitalize')) html = capitalizeFirst(html);
      el.innerHTML = html;
    });
    $$('[data-text]').forEach(el => {
      const v = get(el.dataset.text);
      if (v == null || v === '') return;
      el.textContent = typeof v === 'object' ? plain(v) : String(v);
    });
    $$('[data-table-caption]').forEach(el => {
      const t = ((D && D.tables) || []).find(x => String(x.n) === el.dataset.tableCaption);
      if (t) el.innerHTML = `Table ${esc(t.n)} of the review: ${rich(t.caption)}`;
      else el.hidden = true;
    });
  }
  function renderKeywords() {
    const host = $('#keywords'), kw = D.meta && D.meta.keywords;
    if (!host) return;
    if (!kw || !kw.length) { host.hidden = true; return; }
    /* plain text, not chips (chips on this page are filters); the manuscript capitalizes only the first keyword,
       the list is set in one style (acronyms are left alone) */
    const norm = w => (/^[A-Z][a-z]/.test(w) ? w.charAt(0).toLowerCase() + w.slice(1) : w);
    host.innerHTML = `<span class="keywords-label">Keywords:</span> ${kw.map(w => esc(norm(w))).join('; ')}`;
  }
  function assessmentHTML(a, sec) {
    if (!a) return '';
    const s = sec || a.section || '';
    return `<aside class="assessment" aria-label="Our assessment, Section ${esc(s)}">` +
      `<div class="assessment-head"><p class="assessment-title">Our assessment</p><span class="assessment-sec">Section ${esc(s)}</span></div>` +
      `<p>${rich(a)}</p></aside>`;
  }
  function renderAssessments() {
    $$('aside.assessment[data-assessment]').forEach(el => {
      const k = el.dataset.assessment, a = D.assessments && D.assessments[k];
      if (!a) { el.remove(); return; }
      el.outerHTML = assessmentHTML(a, k);
    });
  }
  function renderGrading() {
    const host = $('#grading-levels'), L = (D.grading && D.grading.levels) || [];
    if (!host) return;
    if (!L.length) { host.hidden = true; return; }
    host.innerHTML = L.map(l => {
      const def = l.definition || {};
      return `<div class="grade-card${def.builder_text ? ' is-builder' : ''}">` +
        `<p class="grade-head"><span class="badge badge-lg badge-${esc(l.code)}">${esc(l.code)}</span>${esc(l.label)}</p>` +
        `<p class="grade-def">${capitalizeFirst(rich(def))}</p>` +
        `<button type="button" class="btn-link" data-filter-evidence="${esc(l.code)}" aria-label="Show the studies graded ${esc(l.label)} in the explorer" hidden>${icon('filter')}Show in the explorer</button>` +
        `</div>`;
    }).join('');
  }

  /* ================================================================== figures */
  function firstSentence(t) {
    const m = /^(.*?[.!?])(\s|$)/.exec(t || '');
    let s = m ? m[1] : (t || '');
    if (s.length > 180) s = s.slice(0, 177).replace(/\s+\S*$/, '') + '…';
    return s;
  }
  const figAlt = f => `Figure ${f.n}: ${firstSentence(plain(f.caption))}`;
  const FIG_TITLE = { 1: 'Growth of continual learning, forgetting under sequential fine-tuning, and the review at a glance' };
  function figTitle(f) {
    if (FIG_TITLE[f.n]) return FIG_TITLE[f.n];
    let s = firstSentence(plain(f.caption)).replace(/\s*\([^)]*\)/g, '');
    s = s.split(/[:;]/)[0].trim().replace(/[.]$/, '');
    return s || 'Figure ' + f.n;
  }
  const FIG_SIZES = '(min-width: 1100px) 1000px, calc(100vw - 48px)';
  function renderInlineFigures() {
    $$('figure.paper-fig[data-fig]').forEach(fig => {
      if (fig.dataset.rendered) return;
      const f = figByN.get(Number(fig.dataset.fig));
      if (!f) { fig.hidden = true; return; }
      fig.dataset.rendered = '1';
      if (!fig.id) fig.id = 'figure-' + f.n;
      fig.innerHTML =
        `<button type="button" class="fig-zoom" data-zoom="${esc(f.id)}">` +
          `<img src="${esc(f.src)}" srcset="${esc(f.srcset || '')}" sizes="${FIG_SIZES}" width="${esc(f.w)}" height="${esc(f.h)}" loading="lazy" decoding="async" alt="${esc(figAlt(f))}">` +
          `<span class="sr-only">, open in the figure viewer</span>` +
          `<span class="fig-hint" aria-hidden="true">${icon('zoom-in')}Enlarge</span>` +
        `</button>` +
        `<figcaption><p class="fig-meta">Figure ${esc(f.n)} · Section ${esc(f.subsection)}</p><p class="fig-cap">${rich(f.caption)}</p></figcaption>`;
    });
  }
  function renderGallery() {
    const host = $('#figure-gallery');
    if (!host) return;
    /* thumbnails: the 640 px file for the 240-320 px tiles (also on 2x screens); the 1200 px one for full-width tiles on phones */
    host.innerHTML = FIGS.map(f =>
      `<li><button type="button" class="gallery-btn" data-zoom="${esc(f.id)}">` +
        `<span class="gallery-thumb"><img src="${esc(f.thumb || f.src)}"${f.thumb_srcset ? ` srcset="${esc(f.thumb_srcset)}" sizes="(min-width: 600px) 320px, calc(100vw - 32px)"` : ''} width="${esc(f.w)}" height="${esc(f.h)}" loading="lazy" decoding="async" alt=""></span>` +
        `<span class="gallery-meta"><span class="gallery-n">Figure ${esc(f.n)}</span><span class="gallery-t">${esc(figTitle(f))}</span>` +
        `<span class="gallery-sec">Section ${esc(f.subsection)}${f.section_title ? ' · ' + esc(f.section_title) : ''}</span></span>` +
      `</button></li>`).join('');
  }

  /* ------------------------------------------------------------------ lightbox */
  const LB = { el: null, idx: -1, zoom: false, opener: null, hi: -1 };
  function figIndex(id) {
    if (id == null) return -1;
    let i = FIGS.findIndex(f => f.id === id);
    if (i < 0) {
      const n = Number(String(id).replace(/^fig(ure)?-?/i, ''));
      i = FIGS.findIndex(f => f.n === n);
    }
    return i;
  }
  function layoutLB() {
    const f = FIGS[LB.idx];
    if (!f || !LB.el || LB.el.hidden) return;
    const pad = window.innerWidth < 600 ? 8 : 20;
    const sw = Math.max(80, LB.stage.clientWidth - 2 * pad), sh = Math.max(80, LB.stage.clientHeight - 2 * pad);
    const ar = f.w / f.h;
    const fitW = Math.min(sw, sh * ar);
    let w = fitW;
    if (LB.zoom) {
      w = Math.min(2400, Math.max(1200, fitW * 2));       /* the 2400 px source at most */
      if (w < fitW * 1.25) w = fitW * 1.5;
    }
    LB.img.style.width = Math.round(w) + 'px';
    LB.img.style.height = Math.round(w / ar) + 'px';
    LB.stage.classList.toggle('is-zoomed', LB.zoom);
    wantHiRes(w);
  }
  /* the 2400 px file only when the zoom or the frame (in device pixels) needs more than the 1200 px one;
     swapped in once loaded, and never fetched for figures that are only stepped through on a small screen */
  function wantHiRes(w) {
    const f = FIGS[LB.idx], i = LB.idx;
    if (!f || !f.src_2x || f.src_2x === f.src || LB.hi === i) return;
    if (!LB.zoom && w * (window.devicePixelRatio || 1) <= (Number(f.w) || 1200)) return;
    LB.hi = i;
    const hi = new Image();
    hi.decoding = 'async';
    hi.onload = () => { if (LB.idx === i && LB.el && !LB.el.hidden) LB.img.src = f.src_2x; };
    hi.src = f.src_2x;
  }
  function setZoom(z, cx, cy) {
    if (z === LB.zoom) return;
    const r = LB.img.getBoundingClientRect(), sr = LB.stage.getBoundingClientRect();
    const px = cx == null ? sr.left + sr.width / 2 : cx, py = cy == null ? sr.top + sr.height / 2 : cy;
    const fx = r.width ? Math.min(1, Math.max(0, (px - r.left) / r.width)) : 0.5;
    const fy = r.height ? Math.min(1, Math.max(0, (py - r.top) / r.height)) : 0.5;
    LB.zoom = z;
    layoutLB();
    LB.zoomBtn.setAttribute('aria-pressed', String(z));
    if (z) {
      /* keep the selected point under the pointer */
      const nr = LB.img.getBoundingClientRect();
      LB.stage.scrollLeft += nr.left + fx * nr.width - px;
      LB.stage.scrollTop += nr.top + fy * nr.height - py;
    }
  }
  function showFig(i) {
    const f = FIGS[i];
    if (!f) return;
    LB.idx = i;
    LB.zoom = false;
    LB.zoomBtn.setAttribute('aria-pressed', 'false');
    LB.title.textContent = 'Figure ' + f.n;
    LB.sec.textContent = 'Section ' + f.subsection + (f.section_title ? ' · ' + f.section_title : '');
    LB.cap.innerHTML = `<p>${rich(f.caption)}</p><p class="lb-hint">Select the image to zoom to full resolution; drag or scroll to pan. The arrow keys move between figures; Esc closes.</p>`;
    LB.count.textContent = (i + 1) + ' of ' + FIGS.length;
    LB.open.href = f.src_2x || f.src;
    LB.img.alt = figAlt(f);
    LB.img.src = f.src;
    LB.hi = -1;
    layoutLB();
    LB.stage.scrollLeft = 0;
    LB.stage.scrollTop = 0;
  }
  function stepFig(d) { if (FIGS.length) showFig((LB.idx + d + FIGS.length) % FIGS.length); }
  function lbKeys(e) {
    if (!LB.el || LB.el.hidden || e.defaultPrevented) return;   /* a key already handled (popover, tooltip) */
    const popOpen = !!(POP.el && !POP.el.hidden);
    if (popOpen && !LB.el.contains(POP.el)) return;
    if (e.key === 'Escape') { if (!popOpen) { e.preventDefault(); closeLightbox(); } return; }
    if (modal.trap(LB.el, e)) return;                     /* Tab stays in the viewer, a reference opened in it included */
    if (popOpen) return;                                  /* the arrow keys move between figures only without one */
    const panning = LB.zoom && document.activeElement === LB.stage;
    if (e.key === 'ArrowRight' && !panning) { e.preventDefault(); stepFig(1); }
    else if (e.key === 'ArrowLeft' && !panning) { e.preventDefault(); stepFig(-1); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(true); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(false); }
  }
  function openLightbox(id, opener) {
    const i = figIndex(id);
    if (i < 0 || !LB.el) return;
    closeCite(false);
    tooltip.hide();
    const opening = LB.el.hidden;
    if (opening) {
      LB.opener = opener || document.activeElement;
      LB.el.hidden = false;
      modal.lock();
      document.addEventListener('keydown', lbKeys, true);
      void LB.el.offsetWidth;                               /* commit opacity 0 so the short fade runs */
      LB.el.classList.add('is-open');
    }
    showFig(i);
    if (opening) LB.close.focus({ preventScroll: true });
  }
  function closeLightbox() {
    if (!LB.el || LB.el.hidden) return;
    LB.el.classList.remove('is-open');
    LB.el.hidden = true;
    modal.unlock();
    document.removeEventListener('keydown', lbKeys, true);
    const o = LB.opener;
    LB.opener = null;
    if (o && o.focus && document.contains(o)) o.focus({ preventScroll: true });
  }
  function initLightbox() {
    LB.el = $('#lightbox');
    if (!LB.el || !FIGS.length) return;
    LB.img = $('#lb-img'); LB.stage = $('#lb-stage'); LB.title = $('#lb-title'); LB.sec = $('#lb-sec');
    LB.cap = $('#lb-caption'); LB.count = $('#lb-count'); LB.zoomBtn = $('#lb-zoom'); LB.open = $('#lb-open');
    LB.close = $('#lb-close');
    $('#lb-prev').addEventListener('click', () => stepFig(-1));
    $('#lb-next').addEventListener('click', () => stepFig(1));
    LB.close.addEventListener('click', closeLightbox);
    LB.zoomBtn.addEventListener('click', () => setZoom(!LB.zoom));
    $$('[data-lb-close]', LB.el).forEach(x => x.addEventListener('click', closeLightbox));
    /* select the image to zoom at that point; drag with the mouse to pan when zoomed (touch pans natively) */
    let drag = null, moved = false;
    LB.stage.addEventListener('pointerdown', e => {
      if (!LB.zoom || e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, l: LB.stage.scrollLeft, t: LB.stage.scrollTop, id: e.pointerId };
      moved = false;
    });
    LB.stage.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 4) {
        moved = true;
        LB.stage.classList.add('is-dragging');
        try { LB.stage.setPointerCapture(drag.id); } catch (err) { /* capture is optional */ }
      }
      if (moved) { LB.stage.scrollLeft = drag.l - dx; LB.stage.scrollTop = drag.t - dy; }
    });
    const endDrag = () => { drag = null; LB.stage.classList.remove('is-dragging'); };
    LB.stage.addEventListener('pointerup', endDrag);
    LB.stage.addEventListener('pointercancel', endDrag);
    LB.stage.addEventListener('click', e => {
      if (moved) { moved = false; return; }
      if (e.target === LB.img) setZoom(!LB.zoom, e.clientX, e.clientY);
    });
    window.addEventListener('resize', debounce(layoutLB, 60));
    bus.addEventListener('figure:zoom', e => {
      const d = e.detail || {};
      openLightbox(d.id != null ? d.id : d.n, d.opener || null);
    });
  }

  /* ------------------------------------------------------------------ reference popover for citation links */
  const POP = { el: null, body: null, anchor: null, key: null };
  const lbOpen = () => !!(LB.el && !LB.el.hidden);
  function positionPop() {
    const el = POP.el, a = POP.anchor;
    if (!el || !a) return;
    const sheet = window.innerWidth < 600;
    el.classList.toggle('is-sheet', sheet);
    if (sheet) { el.style.left = ''; el.style.top = ''; return; }
    /* inside the figure viewer (a fixed layer covering the viewport) the coordinates are those of the viewport */
    const inLB = LB.el && LB.el.contains(el);
    const r = a.getBoundingClientRect(), w = el.offsetWidth, ht = el.offsetHeight;
    const vw = document.documentElement.clientWidth, sx = inLB ? 0 : window.scrollX, sy = inLB ? 0 : window.scrollY;
    const left = Math.max(sx + 12, Math.min(r.left + sx, sx + vw - w - 12));
    let top = r.bottom + sy + 8;
    if (r.bottom + 8 + ht > window.innerHeight - 8 && r.top - 8 - ht > 8) top = r.top + sy - ht - 8;
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
  }
  function popKeys(e) {
    if (!POP.el || POP.el.hidden) return;
    /* stopImmediatePropagation: the viewer's handler on the same node must not close the viewer as well */
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeCite(true); }
  }
  function popOutside(e) {
    if (!POP.el || POP.el.hidden) return;
    if (POP.el.contains(e.target) || (POP.anchor && POP.anchor.contains(e.target))) return;
    closeCite(false);
  }
  function openCite(a) {
    const key = a.dataset.key, r = refByKey.get(key);
    if (!POP.el || !r) return;
    if (POP.anchor === a && !POP.el.hidden) { closeCite(true); return; }
    tooltip.hide();
    POP.anchor = a;
    POP.key = key;
    const authors = r.authors || [];
    const names = authors.length > 8 ? authors.slice(0, 7).join(', ') + ', et al.' : authors.join(', ');
    const type = { journal: 'Journal article', conference: 'Conference paper', preprint: 'Preprint', chapter: 'Book chapter' }[r.type] || '';
    const venue = [r.venue, r.note].filter(Boolean).join(', ');
    const NEWTAB = '<span class="sr-only"> (opens in a new tab)</span>';
    const acts = [];
    if (r.doi) acts.push(`<a class="btn btn-sm" href="https://doi.org/${esc(encodeURI(r.doi))}" target="_blank" rel="noopener">${icon('external')}DOI${NEWTAB}</a>`);
    if (r.arxiv) acts.push(`<a class="btn btn-sm" href="https://arxiv.org/abs/${esc(encodeURIComponent(r.arxiv))}" target="_blank" rel="noopener">${icon('external')}arXiv${NEWTAB}</a>`);
    if (r.bibtex) acts.push(`<button type="button" class="btn btn-sm" data-pop-act="bib">${icon('copy')}Copy BibTeX</button>`);
    if (studyByKey.has(key) && NS.modules.explorer) acts.push(`<button type="button" class="btn btn-sm" data-pop-act="study">${icon('filter')}Study details</button>`);
    const lib = NS.modules.library;
    if (benchKeys.has(key) && lib && typeof lib.showBenchmark === 'function') acts.push(`<button type="button" class="btn btn-sm" data-pop-act="bench">${icon('list')}Benchmark details</button>`);
    acts.push(`<button type="button" class="btn btn-sm" data-pop-act="lib">${icon('books')}In the library</button>`);
    POP.body.innerHTML =
      `<p class="pop-kicker">${esc(r.cite)}</p>` +
      `<p class="pop-title" id="cite-pop-title">${esc(r.title)}</p>` +
      (names ? `<p class="pop-authors">${esc(names)}</p>` : '') +
      `<p class="pop-venue">${esc([venue, r.year, type].filter(Boolean).join(' · '))}</p>` +
      `<div class="pop-actions">${acts.join('')}</div>`;
    /* a citation in a figure caption opens its reference inside the (modal) viewer, so that it is reachable there */
    const host = lbOpen() && LB.el.contains(a) ? LB.el : document.body;
    if (POP.el.parentNode !== host) host.appendChild(POP.el);
    POP.el.hidden = false;
    positionPop();
    POP.el.focus({ preventScroll: true });
  }
  function closeCite(restoreFocus) {
    if (!POP.el || POP.el.hidden) return;
    POP.el.hidden = true;
    const a = POP.anchor;
    POP.anchor = null;
    POP.key = null;
    if (restoreFocus && a && document.contains(a)) a.focus({ preventScroll: true });
  }
  function revealRef(key) {
    const done = el => {
      if (el) { scrollToEl(el, { block: 'center' }); flash(el); }
      else scrollToEl($('#library'));
    };
    let el = document.getElementById('ref-' + key);
    const lib = NS.modules.library;
    if (!el && lib && typeof lib.reveal === 'function') {
      let res = null;
      try { res = lib.reveal(key); } catch (err) { console.error('[CLEAI] library.reveal failed:', err); }
      if (res && typeof res.then === 'function') {
        res.then(x => done((x && x.nodeType === 1 && x) || document.getElementById('ref-' + key)), () => done(null));
        return;
      }
      el = (res && res.nodeType === 1 && res) || document.getElementById('ref-' + key);
    }
    done(el);
  }
  function initCitePopover() {
    POP.el = $('#cite-pop');
    POP.body = $('#cite-pop-body');
    if (!POP.el || !POP.body) return;
    $('#cite-pop-close').addEventListener('click', () => closeCite(true));
    POP.el.addEventListener('click', e => {
      const b = e.target.closest('[data-pop-act]');
      if (!b) return;
      const key = POP.key, r = refByKey.get(key);
      if (!r) return;
      const act = b.dataset.popAct;
      if (act === 'bib') { copy(r.bibtex, 'BibTeX copied'); return; }
      /* the other actions lead to page content: close the reference and, if it was opened from a figure caption, the
         figure viewer first; focus later returns to the element that started it (the figure button for the viewer) */
      const anchor = POP.anchor;
      closeCite(false);
      let opener = anchor;
      if (lbOpen()) { opener = LB.opener || anchor; closeLightbox(); }
      if (act === 'study') emit('study:open', { key: key, opener: opener });
      else if (act === 'bench') {
        let shown = false;
        try { shown = NS.modules.library.showBenchmark(key) !== false; } catch (err) { console.error('[CLEAI] library.showBenchmark failed:', err); }
        if (!shown) revealRef(key);
      }
      else if (act === 'lib') revealRef(key);
    });
    /* focus leaving the reference (Tab past its last button, Shift+Tab before the first) closes it */
    POP.el.addEventListener('focusout', e => {
      const inside = n => n && (POP.el.contains(n) || (POP.anchor && POP.anchor.contains(n)));
      if (POP.el.hidden || inside(e.relatedTarget)) return;
      if (e.relatedTarget) { closeCite(false); return; }
      setTimeout(() => {                                   /* no new target: ignore a window switch */
        if (!POP.el.hidden && document.hasFocus() && !inside(document.activeElement)) closeCite(false);
      }, 0);
    });
    document.addEventListener('keydown', popKeys, true);
    document.addEventListener('pointerdown', popOutside, true);
    window.addEventListener('resize', debounce(positionPop, 60));
  }

  /* ================================================================== propositions */
  const COLOR_TOKENS = new Set(['slate', 'sky', 'teal', 'amber', 'coral', 'violet']);
  const sectionColor = id => {
    const b = ((D.taxonomy && D.taxonomy.branches) || []).find(x => x.id === String(id));
    return b && COLOR_TOKENS.has(b.color) ? `var(--${b.color})` : 'var(--rule-3)';
  };
  const secTitle = id => (secById.get(String(id)) || {}).title || '';
  function goToProposition(n) {
    const card = document.getElementById('prop-' + n);
    if (!card) return;
    scrollToEl(card, { block: 'center' });
    card.classList.add('is-flash');
    setTimeout(() => card.classList.remove('is-flash'), 1600);
  }
  function matrixCardHTML() {
    const secIds = ((D && D.sections) || []).map(s => s.id);
    if (!secIds.length) return '';
    let max = 1;
    PROPS.forEach(p => (p.sections || []).forEach(s => { if (s.count > max) max = s.count; }));
    const head = secIds.map(id => `<th scope="col" title="${esc('Section ' + id + ': ' + secTitle(id))}">${esc(id)}</th>`).join('');
    const rows = PROPS.map(p => {
      const counts = new Map((p.sections || []).map(s => [s.id, s.count]));
      const cells = secIds.map(id => {
        const c = counts.get(id) || 0;
        if (!c || !pageTarget(id)) return `<td class="empty-cell"><span class="sr-only">not tagged</span></td>`;
        const d = 8 + Math.round((12 * c) / max);
        const label = `${p.id} in Section ${id}, ${secTitle(id)}: ${c} tagged passage${c === 1 ? '' : 's'}`;
        return `<td><button type="button" data-goto-section="${esc(id)}" data-tip="${esc(label)}" aria-label="${esc(label + '. Go to this section.')}">` +
          `<span class="dot" style="width:${d}px;height:${d}px;--sc:${sectionColor(id)}"></span></button></td>`;
      }).join('');
      return `<tr><th scope="row"><span class="pos">${esc(p.id)}</span></th>${cells}</tr>`;
    }).join('');
    return `<article class="prop-card prop-matrix-card" aria-labelledby="prop-matrix-t">` +
      `<div class="prop-head"><h3 class="prop-title" id="prop-matrix-t">Where each proposition is developed</h3></div>` +
      `<p class="prop-text">Dots mark the sections of the review whose text carries a proposition’s badge; a larger dot means more tagged passages. Select a dot to go to that part of this page.</p>` +
      `<table class="prop-matrix"><thead><tr><th scope="col"><span class="sr-only">Proposition</span></th>${head}</tr></thead><tbody>${rows}</tbody></table>` +
      `</article>`;
  }
  function renderPropositions() {
    const host = $('#propositions-grid');
    if (!host || !PROPS.length) return;
    const cards = PROPS.map(p => {
      const chips = (p.sections || []).filter(s => pageTarget(s.id)).map(s => {
        const label = `Section ${s.id}, ${s.title || secTitle(s.id)}: ${s.count} tagged passage${s.count === 1 ? '' : 's'}`;
        return `<button type="button" class="sec-chip" data-goto-section="${esc(s.id)}" data-tip="${esc(label)}" aria-label="${esc('Go to ' + label)}">${esc(s.id)}</button>`;
      }).join('');
      return `<article class="prop-card" id="prop-${esc(p.n)}" tabindex="-1" aria-labelledby="prop-${esc(p.n)}-t">` +
        `<div class="prop-head"><span class="pos" aria-hidden="true">${esc(p.id)}</span>` +
        `<h3 class="prop-title" id="prop-${esc(p.n)}-t"><span class="sr-only">${esc(p.id)}: </span>${esc(p.title)}</h3></div>` +
        `<p class="prop-text">${rich(p.statement)}</p>` +
        (chips ? `<div class="prop-foot"><p class="prop-foot-label">Developed in Sections</p><div class="sec-chips">${chips}</div></div>` : '') +
        `</article>`;
    });
    cards.push(matrixCardHTML());
    host.innerHTML = cards.join('');
  }

  /* ================================================================== settings tabs (Sections 5-8) */
  const TAB_LABEL = { T: 'Tasks', E: 'Environments', B: 'Embodiments', F: 'Feedback' };
  let activeAxis = null, modulesReady = false;
  const profiled = new Set();
  function ensureProfile(axis) {
    if (!modulesReady || !axis || profiled.has(axis)) return;
    const charts = NS.modules.charts;
    if (!charts || typeof charts.evidenceProfile !== 'function') return;
    const s = (D.settings || []).find(x => x.axis === axis);
    const el = s && document.getElementById(s.container);
    if (!el) return;
    profiled.add(axis);
    try { charts.evidenceProfile(el, axis); } catch (err) { console.error('[CLEAI] charts.evidenceProfile(' + axis + ') failed:', err); }
  }
  function showSettingsTab(axis, opts) {
    const tabs = $$('#settings-tabs [role="tab"]');
    if (!tabs.length) return;
    const tab = tabs.find(t => t.dataset.axis === axis) || tabs[0];
    tabs.forEach(t => {
      const sel = t === tab;
      t.setAttribute('aria-selected', String(sel));
      t.tabIndex = sel ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls'));
      if (p) p.hidden = !sel;
    });
    const changed = activeAxis !== tab.dataset.axis;
    activeAxis = tab.dataset.axis;
    if (opts && opts.focus) tab.focus();
    ensureProfile(activeAxis);
    if (changed) emit('settings:tab', { axis: activeAxis });
  }
  function renderSettings() {
    const host = $('#settings-tabs'), S = D.settings || [];
    if (!host || !S.length) return;
    /* tabs carry the axis letter (T, E, B, F) in the axis color, as the paper's tables do; no table icons here */
    const tabs = S.map(s => {
      const ax = axisByCode.get(s.axis) || {};
      return `<button type="button" role="tab" class="tab ax-${esc(s.axis)}" id="settings-tab-${esc(s.axis)}" data-axis="${esc(s.axis)}" aria-controls="settings-panel-${esc(s.axis)}" aria-selected="false" tabindex="-1">` +
        `<span class="tab-badge" aria-hidden="true">${esc(s.axis)}</span>` +
        `<span class="tab-text"><span class="tab-name">${esc(TAB_LABEL[s.axis] || ax.name || s.axis)}</span><span class="tab-sec">Section ${esc(s.section)}</span></span></button>`;
    }).join('');
    const panels = S.map(s => {
      const ax = axisByCode.get(s.axis) || {};
      /* Sec. 2.3: feedback is supervision, not a fourth axis of change */
      const filed = s.axis === 'F' ? 'filed under feedback' : `filed under the ${(ax.name || s.axis).toLowerCase()} axis`;
      const figs = (s.figures || []).map(n => `<figure class="paper-fig" data-fig="${esc(n)}"></figure>`).join('');
      return `<section role="tabpanel" class="tabpanel" id="settings-panel-${esc(s.axis)}" data-axis="${esc(s.axis)}" aria-labelledby="settings-tab-${esc(s.axis)}" tabindex="0" hidden>` +
        `<div class="settings-grid">` +
          `<div class="settings-text"><p class="settings-kicker">${esc(s.title)}</p><h3>${esc(TAB_LABEL[s.axis] || ax.name || s.axis)} (Section ${esc(s.section)})</h3><p>${rich(s.lead)}</p>${assessmentHTML(s.assessment, s.section)}</div>` +
          `<div class="settings-side"><article class="panel" aria-labelledby="settings-ev-${esc(s.axis)}-t">` +
            `<header class="panel-head"><p class="panel-kicker">Section ${esc(s.section)}</p><h4 class="panel-title" id="settings-ev-${esc(s.axis)}-t">Evidence profile</h4></header>` +
            `<p class="panel-intro">Coded studies ${esc(filed)}.</p>` +
            `<div id="${esc(s.container)}" class="mount chart" data-axis="${esc(s.axis)}"></div>` +
            `<footer class="panel-foot"><button type="button" class="btn-link" data-filter-axis="${esc(s.axis)}" hidden>${icon('filter')}Show these studies in the evidence explorer</button></footer>` +
          `</article></div>` +
        `</div>${figs}</section>`;
    }).join('');
    host.innerHTML = `<div class="tablist" role="tablist" aria-label="Sections 5 to 8">${tabs}</div>${panels}`;
    const list = $('[role="tablist"]', host);
    list.addEventListener('click', e => {
      const t = e.target.closest('[role="tab"]');
      if (t) showSettingsTab(t.dataset.axis);
    });
    list.addEventListener('keydown', e => {
      const tabs = $$('[role="tab"]', list), i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j < 0) return;
      e.preventDefault();
      showSettingsTab(tabs[j].dataset.axis, { focus: true });
    });
  }

  /* ================================================================== research programs (accordion) */
  function renderPrograms() {
    const host = $('#programs'), P = (D.outlook && D.outlook.programs) || [];
    if (!host || !P.length) return;
    const table = D.outlook.table;
    host.innerHTML = P.map((p, i) => {
      const L = esc(p.letter), open = i === 0;
      const ic = iconSrc(p.icon);
      const badges = (p.propositions || []).map(n => `<span class="pos">P${esc(n)}</span>`).join('');
      const posLinks = (p.propositions || []).map(n => `<span class="pos" data-pos="${esc(n)}">P${esc(n)}</span>`).join(' ');
      const testbeds = (p.testbeds || []).map(t => `<li>${rich(t)}</li>`).join('');
      return `<div class="acc-item${open ? ' is-open' : ''}" id="program-${L}">` +
        `<h3 class="acc-h"><button type="button" class="acc-btn" id="program-${L}-btn" aria-expanded="${open}" aria-controls="program-${L}-body">` +
          `<span class="prog-letter" aria-hidden="true">${L}</span>` +
          (ic ? `<img class="prog-icon" src="${esc(ic)}" alt="" width="36" height="36" decoding="async">` : '<span class="prog-icon" aria-hidden="true"></span>') +
          `<span class="prog-titles"><span class="prog-title"><span class="sr-only">Program ${L}: </span>${esc(p.title)}</span><span class="prog-q">${esc(p.question)}</span></span>` +
          `<span class="prog-badges" aria-hidden="true">${badges}<span class="horizon">${esc(p.horizon)}</span></span>` +
          icon('chev-down', 'acc-chev') +
        `</button></h3>` +
        `<div class="acc-body" id="program-${L}-body" role="region" aria-labelledby="program-${L}-btn"><div class="acc-inner"><div class="acc-content">` +
          `<p>${rich(p.lead)}</p>` +
          `<div class="callout"><p class="callout-label">Discriminating experiment</p><p>${rich(p.discriminating_experiment)}</p></div>` +
          `<dl class="prog-facts">` +
            `<div><dt>Discriminating comparison</dt><dd>${esc(p.comparison)}</dd></div>` +
            `<div><dt>Hidden failure</dt><dd>${esc(p.hidden_failure)}</dd></div>` +
            (testbeds ? `<div><dt>Candidate testbeds</dt><dd><ul>${testbeds}</ul></dd></div>` : '') +
            (posLinks ? `<div><dt>Propositions revisited</dt><dd>${posLinks}</dd></div>` : '') +
            `<div><dt>Horizon (the authors’ judgment)</dt><dd>${esc(p.horizon)}</dd></div>` +
            `<div><dt>In the review</dt><dd>Section ${esc(p.section)}, Figure ${esc(p.figure_panel)}${table ? ', Table ' + esc(table) : ''}</dd></div>` +
          `</dl>` +
        `</div></div></div></div>`;
    }).join('');
    host.addEventListener('click', e => {
      const b = e.target.closest('.acc-btn');
      if (!b) return;
      const item = b.closest('.acc-item'), open = !item.classList.contains('is-open');
      item.classList.toggle('is-open', open);
      b.setAttribute('aria-expanded', String(open));
    });
  }
  function openProgram(item) {
    if (!item || item.classList.contains('is-open')) return;
    item.classList.add('is-open');
    const b = $('.acc-btn', item);
    if (b) b.setAttribute('aria-expanded', 'true');
  }

  /* ================================================================== citation block, footer, section anchors */
  function renderCitation() {
    const code = $('#bibtex'), btn = $('#copy-bib'), status = $('#bib-status');
    if (code && D.meta && D.meta.bibtex) code.textContent = D.meta.bibtex;
    if (!btn || !code) return;
    let t = 0;
    btn.addEventListener('click', () => {
      copyText(code.textContent).then(ok => {
        const label = $('span', btn), use = $('use', btn);
        clearTimeout(t);
        if (ok) {
          if (label) label.textContent = 'Copied';
          if (use) use.setAttribute('href', '#i-check');
          if (status) status.textContent = 'BibTeX copied to the clipboard.';
          t = setTimeout(() => {
            if (label) label.textContent = 'Copy';
            if (use) use.setAttribute('href', '#i-copy');
            if (status) status.textContent = '';
          }, 2000);
        } else {
          if (status) status.textContent = 'Copy failed: select the entry and copy it manually.';
          toast('Copy failed: select the entry and copy it manually');
        }
      });
    });
  }
  function renderFooter() {
    const u = $('#updated'), M = D.meta || {};
    if (u && M.updated) { u.textContent = fmtDate(M.updated); if (u.tagName === 'TIME') u.setAttribute('datetime', M.updated); }
    const home = $('#home-link');
    if (home && M.homepage_url) home.href = M.homepage_url;
  }
  function addAnchors() {
    $$('.section').forEach(sec => {
      const head = $('.section-head', sec), h2 = head && $('h2', head);
      if (!h2 || $('.anchor', head)) return;
      head.appendChild(h('a', { class: 'anchor', href: '#' + sec.id, 'aria-label': 'Link to this section: ' + h2.textContent.trim(), html: icon('link') }));
    });
  }

  /* ================================================================== citations and proposition badges anywhere on the page */
  function enhance(root) {
    root = root || document;
    $$('.pos[data-pos]', root).forEach(s => {
      if (s.dataset.enhanced) return;
      s.dataset.enhanced = '1';
      if (s.parentElement && s.parentElement.closest('button, a, [role="button"], [role="link"], [role="tab"]')) return;
      const p = propByN.get(Number(s.dataset.pos));
      s.setAttribute('tabindex', '0');
      s.setAttribute('role', 'link');
      s.setAttribute('aria-label', 'Proposition ' + s.dataset.pos + (p ? ': ' + p.title : ''));
    });
    $$('a.cite[data-key]', root).forEach(a => {
      if (a.dataset.enhanced) return;
      a.dataset.enhanced = '1';
      a.setAttribute('aria-haspopup', 'dialog');
    });
  }
  let tipTarget = null;
  const TIP_SEL = '.pos[data-pos][role="link"], [data-tip]';
  function showTipFor(t) {
    if (t.matches('.pos[data-pos]')) {
      const p = propByN.get(Number(t.dataset.pos));
      if (p) tooltip.show(`<b>${esc(p.id)}</b> ${esc(p.title)}`, t);
    } else if (t.dataset.tip) tooltip.show(esc(t.dataset.tip), t);
  }
  function initDelegation() {
    document.addEventListener('click', e => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      const cite = t.closest('a.cite[data-key]');
      if (cite) { e.preventDefault(); openCite(cite); return; }
      const zoom = t.closest('[data-zoom]');
      if (zoom) { e.preventDefault(); openLightbox(zoom.dataset.zoom, zoom); return; }
      const pos = t.closest('.pos[data-pos][role="link"]');
      if (pos) { e.preventDefault(); goToProposition(Number(pos.dataset.pos)); return; }
      const go = t.closest('[data-goto-section]');
      if (go) { e.preventDefault(); tooltip.hide(); goToSection(go.dataset.gotoSection); return; }
      const fa = t.closest('[data-filter-axis]');
      if (fa) { emit('explorer:filter', { axis: fa.dataset.filterAxis, reset: true }); return; }
      const fe = t.closest('[data-filter-evidence]');
      if (fe) { emit('explorer:filter', { evidence: fe.dataset.filterEvidence, reset: true }); }
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !(e.target instanceof Element)) return;
      if (e.target.matches('.pos[data-pos][role="link"]')) { e.preventDefault(); goToProposition(Number(e.target.dataset.pos)); }
    });
    /* [data-tip] readouts: shown on hover and focus; the pointer may move onto the readout (a short delay before
       hiding), and Escape dismisses any readout without moving the pointer or focus (WCAG 1.4.13) */
    let hideTimer = 0;
    const cancelHide = () => { clearTimeout(hideTimer); hideTimer = 0; };
    const inTip = n => n instanceof Node && tooltip.element.contains(n);
    document.addEventListener('mouseover', e => {
      if (inTip(e.target)) { if (tipTarget) cancelHide(); return; }
      const t = e.target instanceof Element ? e.target.closest(TIP_SEL) : null;
      if (!t) return;
      cancelHide();
      if (t === tipTarget) return;
      tipTarget = t;
      showTipFor(t);
    });
    document.addEventListener('mouseout', e => {
      if (!tipTarget) return;
      const to = e.relatedTarget;
      if (to instanceof Node && (tipTarget.contains(to) || inTip(to))) return;
      cancelHide();
      hideTimer = setTimeout(() => { hideTimer = 0; if (tipTarget) { tipTarget = null; tooltip.hide(); } }, 150);
    });
    document.addEventListener('focusin', e => {
      const t = e.target instanceof Element ? e.target.closest(TIP_SEL) : null;
      if (t) { cancelHide(); tipTarget = t; showTipFor(t); }
    });
    document.addEventListener('focusout', () => { if (tipTarget) { cancelHide(); tipTarget = null; tooltip.hide(); } });
    window.addEventListener('scroll', () => { if (tipTarget) { cancelHide(); tipTarget = null; tooltip.hide(); } }, { passive: true });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !tooltip.visible) return;
      if ((POP.el && !POP.el.hidden) || modal.isOpen()) return;   /* those close themselves on Escape */
      cancelHide();
      tipTarget = null;
      tooltip.hide();
      emit('tooltip:dismiss', {});
      e.preventDefault();
    });
    /* module content inserted later gets the same treatment */
    let queued = false;
    if ('MutationObserver' in window) {
      new MutationObserver(() => {
        if (queued) return;
        queued = true;
        nextFrame(() => { queued = false; enhance(document); });
      }).observe($('#main') || document.body, { childList: true, subtree: true });
    }
  }

  /* ================================================================== table of contents, scroll-spy, progress */
  /* the current section is the one crossing a reading line at 30 % of the window height (at most 260 px from the
     top), tracked with an IntersectionObserver on a one-pixel band at that line; at the bottom of the page the last
     entry is current. Returns {atEnd(bool)} for the scroll handler, which reads the page height anyway. */
  function initToc() {
    const toc = $('#toc'), toggle = $('#toc-toggle'), cur = $('#toc-current');
    if (!toc) return { atEnd() {} };
    const links = $$('.toc-list a', toc);
    const items = links.map(a => ({ a: a, el: document.getElementById(decode(a.hash.slice(1))) })).filter(x => x.el);
    const setOpen = open => { toc.classList.toggle('is-open', open); if (toggle) toggle.setAttribute('aria-expanded', String(open)); };
    if (toggle) toggle.addEventListener('click', () => setOpen(!toc.classList.contains('is-open')));
    links.forEach(a => a.addEventListener('click', () => setOpen(false)));
    $$('.toc-foot a', toc).forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('click', e => { if (toc.classList.contains('is-open') && !toc.contains(e.target)) setOpen(false); });
    toc.addEventListener('keydown', e => {
      if (e.key === 'Escape' && toc.classList.contains('is-open')) { e.preventDefault(); setOpen(false); if (toggle) toggle.focus(); }
    });
    /* the open dropdown (below 1100 px) must not cover the element that receives focus next */
    toc.addEventListener('focusout', e => {
      if (toc.classList.contains('is-open') && !(e.relatedTarget instanceof Node && toc.contains(e.relatedTarget))) setOpen(false);
    });
    if (!items.length) return { atEnd() {} };

    let active = null, end = false;
    const crossing = new Set();
    const lineY = () => Math.min(window.innerHeight * 0.3, 260);
    /* nothing crosses the line: above the first section (one read, only in this case), or in a gap between sections */
    const aboveFirst = () => items[0].el.getBoundingClientRect().top > lineY();
    function setActive(hit) {
      if (hit === active) return;
      if (active) active.a.removeAttribute('aria-current');
      active = hit;
      if (cur) cur.textContent = hit ? hit.a.textContent : '';
      if (!hit) return;
      hit.a.setAttribute('aria-current', 'location');
      /* keep the active entry visible when the sidebar itself scrolls (short windows) */
      if (toggle && toggle.offsetParent === null && toc.scrollHeight > toc.clientHeight) {
        const tr = toc.getBoundingClientRect(), lr = hit.a.getBoundingClientRect();
        if (lr.top < tr.top) toc.scrollTop -= tr.top - lr.top + 8;
        else if (lr.bottom > tr.bottom) toc.scrollTop += lr.bottom - tr.bottom + 8;
      }
    }
    function pick() {
      if (end) { setActive(aboveFirst() ? null : items[items.length - 1]); return; }
      for (let k = items.length - 1; k >= 0; k--) if (crossing.has(items[k].el)) { setActive(items[k]); return; }
      if (aboveFirst()) setActive(null);                     /* otherwise keep the last one */
    }
    if (!('IntersectionObserver' in window)) {                /* old browsers: measure on scroll instead */
      return {
        atEnd(isEnd) {
          end = isEnd;
          const line = lineY();
          crossing.clear();
          let hit = null;
          for (let k = 0; k < items.length; k++) { if (items[k].el.getBoundingClientRect().top - line <= 0) hit = items[k]; else break; }
          if (hit) crossing.add(hit.el);
          pick();
        }
      };
    }
    let io = null;
    const observe = () => {
      if (io) io.disconnect();
      crossing.clear();
      const vh = window.innerHeight, line = Math.round(lineY());
      io = new IntersectionObserver(entries => {
        entries.forEach(en => { if (en.isIntersecting) crossing.add(en.target); else crossing.delete(en.target); });
        pick();
      }, { rootMargin: `-${line}px 0px -${Math.max(0, vh - line - 1)}px 0px`, threshold: 0 });
      items.forEach(x => io.observe(x.el));
    };
    observe();
    window.addEventListener('resize', debounce(observe, 150));
    return { atEnd(isEnd) { if (isEnd !== end) { end = isEnd; pick(); } } };
  }
  function initScrollWatch(spy) {
    const bar = $('#progress-bar');
    let ticking = false;
    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const y = window.scrollY, vh = window.innerHeight, sh = doc.scrollHeight;   /* all reads before the one write */
      const max = sh - vh;
      if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, Math.max(0, y / max)) : 0).toFixed(4) + ')';
      spy.atEnd(max > 0 && y + vh >= sh - 2);
    };
    const queue = () => { if (!ticking) { ticking = true; nextFrame(update); } };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    if ('ResizeObserver' in window) new ResizeObserver(queue).observe(document.body);
    update();
  }

  /* ================================================================== taxonomy: interactive tree or Figure 2 */
  function initTaxonomyToggle() {
    const wrap = $('#taxonomy-toggle'), tree = $('#taxonomy-tree'), fig = $('#taxonomy-figure');
    if (!wrap || !tree || !fig) return;
    const available = () => tree.childElementCount > 0;
    const setView = (v, save) => {
      const isTree = v === 'tree' && available();
      tree.hidden = !isTree;
      fig.hidden = isTree;
      $$('button[data-view]', wrap).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === (isTree ? 'tree' : 'figure'))));
      if (save) store.set('taxonomyView', isTree ? 'tree' : 'figure');
    };
    const refresh = () => {
      const ok = available();
      wrap.hidden = !ok;
      setView(ok ? store.get('taxonomyView', 'tree') : 'figure', false);
    };
    wrap.addEventListener('click', e => {
      const b = e.target.closest('button[data-view]');
      if (b) setView(b.dataset.view, true);
    });
    refresh();
    if (!available() && 'MutationObserver' in window) {
      const mo = new MutationObserver(() => { if (available()) { mo.disconnect(); refresh(); } });
      mo.observe(tree, { childList: true });
    }
  }

  /* ================================================================== deep links */
  function handleHash(initial) {
    const raw = location.hash.slice(1);
    if (!raw) return;
    const id = decode(raw);
    const el = document.getElementById(id);
    if (!el) { if (id.indexOf('ref-') === 0) revealRef(id.slice(4)); return; }
    let revealed = false;
    const panel = el.closest('[role="tabpanel"]');
    if (panel && panel.hidden) { showSettingsTab(panel.dataset.axis); revealed = true; }
    const acc = el.closest('.acc-item');
    if (acc && !acc.classList.contains('is-open')) { openProgram(acc); revealed = true; }
    if (initial || revealed) el.scrollIntoView({ block: 'start' });
  }

  /* ================================================================== modules */
  const initialized = new WeakSet();
  function initModules() {
    Object.keys(NS.modules).forEach(name => {
      const m = NS.modules[name];
      if (!m || typeof m.init !== 'function' || initialized.has(m)) return;
      initialized.add(m);
      try { m.init(); } catch (err) { console.error('[CLEAI] module "' + name + '" failed to initialize:', err); }
    });
    modulesReady = true;
  }

  /* ================================================================== public util (see DESIGN.md) */
  NS.util = {
    $: $, $$: $$, esc: esc, h: h, rich: rich, plain: plain, get: get, icon: icon, fmtDate: fmtDate, debounce: debounce,
    emit: emit, on: on, store: store, onResize: onResize, nextFrame: nextFrame, reducedMotion: reducedMotion,
    copy: copy, copyText: copyText, toast: toast, tooltip: tooltip, modal: modal, flash: flash, enhance: enhance,
    iconSrc: iconSrc, cssVar: cssVar, axisColor: axisColor, evidenceColor: evidenceColor,
    palette: (D && D.meta && D.meta.palette) || {},
    ref: key => refByKey.get(key) || null,
    study: key => studyByKey.get(key) || null,
    figure: id => figById.get(id) || figByN.get(Number(id)) || null,
    proposition: n => propByN.get(Number(n)) || null,
    axis: code => axisByCode.get(code) || null,
    section: id => secById.get(String(id)) || null,
    pageTarget: pageTarget, goToSection: goToSection, scrollToEl: scrollToEl, revealRef: revealRef,
    openFigure: (id, opener) => openLightbox(id, opener), showSettingsTab: axis => showSettingsTab(axis),
    openReference: anchorOrKey => {
      if (anchorOrKey && anchorOrKey.nodeType === 1) openCite(anchorOrKey);
      else revealRef(String(anchorOrKey));
    }
  };
  NS.shell = { ready: false, version: '2026-10-28', renderHero: () => safe('hero', renderHero) };

  /* ================================================================== boot */
  function boot() {
    if (!D) {
      const main = $('#main');
      if (main) main.insertAdjacentHTML('afterbegin', '<p class="noscript">The page data (data/site-data.js) could not be loaded. Reload the page to try again.</p>');
      return;
    }
    safe('hero', renderHero);
    safe('text', fillText);
    safe('keywords', renderKeywords);
    safe('assessments', renderAssessments);
    safe('grading', renderGrading);
    safe('propositions', renderPropositions);
    safe('settings', renderSettings);
    safe('programs', renderPrograms);
    safe('figures', renderInlineFigures);
    safe('gallery', renderGallery);
    safe('citation', renderCitation);
    safe('footer', renderFooter);
    safe('anchors', addAnchors);
    safe('enhance', () => enhance(document));
    safe('delegation', initDelegation);
    safe('lightbox', initLightbox);
    safe('popover', initCitePopover);
    const spy = safe('toc', initToc) || { atEnd() {} };
    safe('scroll', () => initScrollWatch(spy));

    /* first settings tab, or the one a deep link points into */
    let firstAxis = null;
    safe('hash', () => {
      const id = location.hash.slice(1);
      const el = id && document.getElementById(decode(id));
      const panel = el && el.closest('[role="tabpanel"]');
      if (panel) firstAxis = panel.dataset.axis;
    });
    safe('settings tab', () => showSettingsTab(firstAxis));

    initModules();

    safe('after modules', () => {
      const hasExplorer = !!NS.modules.explorer;
      $$('[data-filter-axis], [data-filter-evidence]').forEach(b => { b.hidden = !hasExplorer; });
      ensureProfile(activeAxis);
      initTaxonomyToggle();
      enhance(document);
      handleHash(true);
    });
    window.addEventListener('hashchange', () => handleHash(false));
    NS.shell.ready = true;
    emit('shell:ready', {});
  }

  let booted = false;
  const start = () => { if (booted) return; booted = true; boot(); };
  if (document.readyState === 'complete') start();
  else {
    document.addEventListener('DOMContentLoaded', start, { once: true });
    window.addEventListener('load', start, { once: true });
  }
})();
