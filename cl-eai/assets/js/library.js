/* Continual Learning for Embodied AI: library module (assets/js/library.js; loaded with defer before app.js).

   Fills two mount points of the page shell (contract: ../../DESIGN.md; data: ../../data/SCHEMA.md):
   - #benchmark-explorer: the entries of Tables 12 and 13 (benchmarks with explicit continual learning protocols,
     reusable resources and simulators): facet filters, a timeline dot plot by year and domain (D3 scales, SVG),
     a list grouped as in the two tables, and a detail panel for the selected entry;
   - #library-browser: every reference of the full version, grouped under colored header bars by the section that
     first cites it, with search, a year range (menus and a year histogram), type filters, marks for coded studies
     and benchmarks, DOI and arXiv links, BibTeX copy, "show more" per group and a live readout.

   Registers CLEAI.modules.library = { init, reveal(key), showBenchmark(key) }. The shell calls reveal(key) for
   "In the library" and #ref-<key> links. The bus event "benchmark:select" {key} also selects a benchmark.
   Counts are printed only as live readouts of these views; nothing is animated from JavaScript. */
(function () {
  'use strict';

  var NS = (window.CLEAI = window.CLEAI || { modules: {} });
  NS.modules = NS.modules || {};

  let D = null;   // CLEAI.data, available from init() on
  let U = null;   // CLEAI.util, available from init() on

  const BX = { ready: false };   // benchmark explorer
  const LB = { ready: false };   // library

  NS.modules.library = { init: init, reveal: reveal, showBenchmark: showBenchmark };

  /* ================================================================== helpers */
  const esc = s => U.esc(s);
  const icon = (id, cls) => U.icon(id, cls);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const doiURL = doi => 'https://doi.org/' + encodeURI(doi);
  const arxivURL = id => 'https://arxiv.org/abs/' + encodeURIComponent(id);
  const scholarURL = title => 'https://scholar.google.com/scholar?q=' + encodeURIComponent('"' + title + '"');
  const hasExplorer = () => !!(NS.modules && NS.modules.explorer);

  function guard(name, fn) {
    try { return fn(); } catch (err) { console.error('[CLEAI] library module: ' + name + ' failed:', err); return undefined; }
  }
  function joinList(items) {
    if (items.length < 2) return items.join('');
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }
  const capFirst = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  /* ------------------------------------------------------------------ search: case and diacritic folding */
  const FOLD = {
    'ł': 'l', 'Ł': 'l', 'ø': 'o', 'Ø': 'o', 'æ': 'ae', 'Æ': 'ae', 'œ': 'oe', 'Œ': 'oe', 'ß': 'ss', 'đ': 'd', 'Đ': 'd',
    'ð': 'd', 'þ': 'th', 'ı': 'i', 'π': 'pi', 'Π': 'pi', '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-',
    '\u00a0': ' '
  };
  function foldChar(ch) {
    if (FOLD[ch] != null) return FOLD[ch];
    let f = ch;
    try { f = ch.normalize('NFKD'); } catch (e) { f = ch; }
    return f.replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  /* folded string plus a map from each folded position to its position in the original string */
  function foldMap(str) {
    str = String(str == null ? '' : str);
    let s = '';
    const map = [];
    for (let i = 0; i < str.length; i++) {
      const f = foldChar(str[i]);
      for (let j = 0; j < f.length; j++) { s += f[j]; map.push(i); }
    }
    map.push(str.length);
    return { s: s, map: map };
  }
  const fold = str => foldMap(str).s;
  function queryTerms(q) {
    const out = [];
    fold(q).split(/\s+/).forEach(t => { if (t && out.indexOf(t) < 0) out.push(t); });
    return out;
  }
  /* escaped text with every occurrence of the search terms wrapped in <mark> */
  function highlight(text, terms) {
    text = String(text == null ? '' : text);
    if (!terms || !terms.length) return esc(text);
    const fm = foldMap(text);
    const ranges = [];
    terms.forEach(t => {
      let from = 0, idx;
      while ((idx = fm.s.indexOf(t, from)) !== -1) {
        ranges.push([fm.map[idx], fm.map[idx + t.length - 1] + 1]);
        from = idx + t.length;
      }
    });
    if (!ranges.length) return esc(text);
    ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    ranges.forEach(r => {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    });
    let out = '', pos = 0;
    merged.forEach(r => {
      out += esc(text.slice(pos, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + '</mark>';
      pos = r[1];
    });
    return out + esc(text.slice(pos));
  }

  /* ------------------------------------------------------------------ shared markup */
  const venueBadge = (short, preprint, terms) => short
    ? `<span class="lib-venue${preprint ? ' is-pre' : ''}">${terms ? highlight(short, terms) : esc(short)}</span>` : '';
  const yearBadge = y => `<span class="lib-year">${esc(y)}</span>`;
  /* a code badge whose meaning is in a tooltip for the mouse and in visually hidden text for screen readers */
  const codeBadge = (cls, code, label) =>
    `<span class="badge ${cls}" data-tip="${esc(label)}" aria-hidden="true">${esc(code)}</span><span class="sr-only">${esc(label)}</span>`;

  /* BibTeX copy with a toast (#toast is role=status, aria-live=polite) and a short "Copied" state on the button */
  function copyBib(key, btn) {
    const r = U.ref(key);
    if (!r || !r.bibtex) return;
    U.copy(r.bibtex, 'BibTeX entry copied: ' + r.cite).then(ok => {
      if (!ok || !btn || !btn.isConnected) return;
      const label = btn.querySelector('[data-copy-label]');
      const use = btn.querySelector('use');
      clearTimeout(btn._copyTimer);
      if (label) { if (btn._copyText == null) btn._copyText = label.textContent; label.textContent = 'Copied'; }
      if (use) use.setAttribute('href', '#i-check');
      btn.classList.add('is-copied');
      btn._copyTimer = setTimeout(() => {
        if (label && btn._copyText != null) label.textContent = btn._copyText;
        if (use) use.setAttribute('href', '#i-copy');
        btn.classList.remove('is-copied');
      }, 1800);
    });
  }

  /* ------------------------------------------------------------------ section colors (as in Figure 2) */
  const COLOR_SETS = {
    slate: ['var(--slate)', 'var(--gray)', 'var(--slate)'],
    sky: ['var(--sky)', 'var(--sky-light)', 'var(--sky-ink)'],
    teal: ['var(--teal)', 'var(--teal-light)', 'var(--teal-ink)'],
    amber: ['var(--amber)', 'var(--amber-light)', 'var(--amber-ink)'],
    coral: ['var(--coral)', 'var(--coral-light)', 'var(--coral-ink)'],
    violet: ['var(--violet)', 'var(--violet-light)', 'var(--violet-ink)']
  };
  const NEUTRAL_SET = ['var(--rule-3)', 'var(--bg-soft)', 'var(--text-2)'];
  const SHORT_SECTION = { 1: 'Introduction', 2: 'Formulation', 10: 'Outlook', 11: 'Conclusion' };
  const branchOf = id => ((D.taxonomy && D.taxonomy.branches) || []).find(b => b.id === String(id)) || null;
  function sectionColors(id) { const b = branchOf(id); return (b && COLOR_SETS[b.color]) || NEUTRAL_SET; }
  function sectionShort(id) {
    const b = branchOf(id);
    return (b && b.name) || SHORT_SECTION[id] || ((U.section(id) || {}).title) || 'Section ' + id;
  }
  function sectionTitle(id) { const s = U.section(id); return (s && s.title) || sectionShort(id); }
  const colorStyle = c => `--g:${c[0]};--g-l:${c[1]};--g-i:${c[2]}`;
  const chipStyle = c => `--chip-c:${c[0]};--chip-l:${c[1]};--chip-i:${c[2]}`;

  /* ================================================================== init */
  function init() {
    D = NS.data;
    U = NS.util;
    if (!D || !U) return;
    const bxEl = document.getElementById('benchmark-explorer');
    if (bxEl && Array.isArray(D.benchmarks) && D.benchmarks.length) guard('benchmark explorer', () => initBenchmarks(bxEl));
    const libEl = document.getElementById('library-browser');
    if (libEl && Array.isArray(D.library) && D.library.length) guard('library', () => initLibrary(libEl));
    if (typeof U.on === 'function') U.on('benchmark:select', e => { const k = e && e.detail && e.detail.key; if (k) showBenchmark(k); });
  }

  /* ================================================================== benchmark explorer */
  const DOMAIN_ORDER = ['perception', 'manipulation', 'household', 'navigation', 'driving', 'locomotion', '_other', 'simulator'];
  const GROUPS = {
    native: { label: 'Continual protocol', short: 'Benchmark', table: 12, cls: 'g-native' },
    resource: { label: 'Reusable resource', short: 'Resource', table: 13, cls: 'g-resource' },
    simulator: { label: 'Simulator', short: 'Simulator', table: 13, cls: 'g-simulator' }
  };
  const GROUP_ORDER = ['native', 'resource', 'simulator'];
  const groupOf = b => GROUPS[b.group] || GROUPS.resource;
  /* Task ID at test as in Table 12; its legend does not define the dash, so the page says only that there is no entry */
  const TASKID = {
    Yes: { short: 'Given', long: 'Given at test (✓ in Table 12)' },
    No: { short: 'Withheld', long: 'Withheld at test (✗ in Table 12)' },
    'Lang.': { short: 'By instruction', long: 'Identified by the instruction (Lang.)' },
    '--': { short: 'No entry (–)', long: 'No entry: a dash in Table 12', text: '–' }
  };
  const tidText = v => (TASKID[v] && TASKID[v].text) || v;
  const SCEN = { TIL: 'task-incremental', CIL: 'class-incremental', DIL: 'domain-incremental', TF: 'task-free' };
  const NATIVE_ONLY_NOTE = 'Stream, task identity, learning signal, and platform are coded for the benchmarks of Table 12 only.';

  const domKey = b => b.domain_group || '_other';
  function domInfo(k) {
    const V = (D.vocab && D.vocab.domain) || {};
    return V[k === '_other' ? '' : k] || { label: k === '_other' ? 'Other' : capFirst(k), icon: null };
  }
  const domIconHTML = (k, size, cls) => {
    const src = U.iconSrc(domInfo(k).icon);
    return src ? `<img class="${cls || ''}" src="${esc(src)}" alt="" width="${size}" height="${size}" decoding="async">` : '';
  };
  const axisName = a => ((D.vocab && D.vocab.axis) || {})[a] || a;
  const signalName = s => ((D.vocab && D.vocab.learning_signal) || {})[s] || s;
  const platformName = p => ((D.vocab && D.vocab.platform) || {})[p] || p;
  const caveatName = c => ((D.vocab && D.vocab.caveat) || {})[c] || c;
  const needName = c => ((D.vocab && D.vocab.cl_needs) || {})[c] || c;
  const roleName = c => ((D.vocab && D.vocab.role) || {})[c] || c;

  function bxFacetDefs() {
    const defs = [
      { key: 'group', label: 'Table', get: b => [b.group], order: GROUP_ORDER,
        text: v => GROUPS[v] ? `${GROUPS[v].label} (Table ${GROUPS[v].table})` : v },
      { key: 'domain', label: 'Domain', get: b => [b._dom], order: DOMAIN_ORDER, text: v => domInfo(v).label },
      { key: 'stream', label: 'What changes in the stream', get: b => b.stream || [], order: ['T', 'E', 'B', 'F'], text: axisName },
      { key: 'taskid', label: 'Task identity at test', get: b => (b.task_id_test ? [b.task_id_test] : []), order: ['Yes', 'No', 'Lang.', '--'],
        text: v => (TASKID[v] ? TASKID[v].short : v), tip: v => (TASKID[v] ? TASKID[v].long : '') },
      { key: 'signal', label: 'Learning signal', get: b => (b.learning ? [b.learning] : []),
        order: Object.keys((D.vocab && D.vocab.learning_signal) || {}), text: signalName },
      { key: 'platform', label: 'Platform', get: b => b.platform_tags || [], order: ['Sim', 'Real', 'Log'], text: platformName }
    ];
    defs.forEach(f => {
      const present = new Set();
      BX.all.forEach(b => f.get(b).forEach(v => present.add(v)));
      f.values = f.order.filter(v => present.has(v));
      present.forEach(v => { if (f.values.indexOf(v) < 0) f.values.push(v); });
    });
    return defs.filter(f => f.values.length);
  }

  function bxPasses(b, except) {
    const st = BX.st;
    if (st.terms.length && !st.terms.every(t => b._hay.indexOf(t) >= 0)) return false;
    for (let i = 0; i < BX.facets.length; i++) {
      const f = BX.facets[i];
      if (f.key === except) continue;
      const sel = st.f[f.key];
      if (!sel || !sel.size) continue;
      if (!f.get(b).some(v => sel.has(v))) return false;
    }
    return true;
  }
  const bxFiltered = () => BX.st.terms.length > 0 || Object.keys(BX.st.f).some(k => BX.st.f[k].size > 0);

  function initBenchmarks(el) {
    BX.el = el;
    BX.all = D.benchmarks.map((b, i) => Object.assign({}, b, { _i: i, _dom: domKey(b), _match: true }));
    BX.byKey = new Map(BX.all.map(b => [b.key, b]));
    BX.all.forEach(b => {
      b._hay = fold([b.name, b.cite, b.key, b.venue_short, b.year, b.scale, b.scale_short, domInfo(b._dom).label,
        b.platform, b.role ? roleName(b.role) : '', b.obs, b.action].filter(Boolean).join(' | '));
    });
    const years = BX.all.map(b => b.year).filter(y => typeof y === 'number');
    BX.minYear = Math.min.apply(null, years);
    BX.maxYear = Math.max.apply(null, years);
    BX.domains = DOMAIN_ORDER.filter(d => BX.all.some(b => b._dom === d));
    BX.all.forEach(b => { if (BX.domains.indexOf(b._dom) < 0) BX.domains.push(b._dom); });
    const domIdx = d => BX.domains.indexOf(d);
    BX.sorted = BX.all.slice().sort((a, b) => groupOf(a).table - groupOf(b).table || domIdx(a._dom) - domIdx(b._dom) ||
      a.year - b.year || String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' }));
    BX.levels = new Map(((D.evaluation && D.evaluation.levels) || []).map(l => [l.level, l]));
    BX.facets = bxFacetDefs();
    BX.st = { q: '', terms: [], f: {} };
    BX.facets.forEach(f => { BX.st.f[f.key] = new Set(); });
    BX.sel = null;
    BX.origin = null;
    BX.focusKey = null;
    BX.wide = false;

    el.replaceChildren();
    el.insertAdjacentHTML('beforeend', bxSkeletonHTML());
    const root = el.querySelector('.bx');
    BX.dom = {
      root: root,
      filters: root.querySelector('.bx-filters'),
      fcount: root.querySelector('.bx-fcount'),
      search: root.querySelector('#bx-q'),
      readout: root.querySelector('#bx-readout'),
      clear: root.querySelector('.bx-status [data-bx-act="clear"]'),
      dimKey: root.querySelector('.bx-key-dim'),
      chartCard: root.querySelector('.bx-chart-card'),
      chart: root.querySelector('#bx-chart'),
      aside: root.querySelector('#bx-detail'),
      list: root.querySelector('#bx-list')
    };

    root.addEventListener('click', onBxClick);
    root.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !BX.sel || !(e.target instanceof Element)) return;
      if (e.target.closest('.bx-detail')) { e.preventDefault(); closeBxDetail(); }
    });
    BX.dom.search.addEventListener('input', U.debounce(() => {
      BX.st.q = BX.dom.search.value;
      BX.st.terms = queryTerms(BX.st.q);
      refreshBx();
    }, 120));

    refreshBx();
    /* module width decides the layout: a sticky detail column from 820 px, collapsible facets below 600 px.
       Applied and drawn synchronously first, so that nothing changes height after the shell resolves a deep link. */
    const applyWidth = w => {
      if (!w) return;
      root.classList.toggle('is-narrow', w < 600);
      const wide = w >= 820;
      if (wide === BX.wide) return;
      BX.wide = wide;
      root.classList.toggle('is-wide', wide);
      placeBxDetail();
    };
    applyWidth(el.clientWidth);
    guard('benchmark chart', drawBxChart);
    U.onResize(el, applyWidth);
    U.onResize(BX.dom.chart, () => guard('benchmark chart', drawBxChart));
    BX.ready = true;
  }

  function bxSkeletonHTML() {
    const facets = BX.facets.map(bxFacetHTML).join('');
    const legend = GROUP_ORDER.map(g => `<li class="legend-item"><span class="bx-key ${GROUPS[g].cls}" aria-hidden="true"></span>${esc(GROUPS[g].label)} (Table ${GROUPS[g].table})</li>`).join('') +
      '<li class="legend-item bx-key-dim" hidden><span class="bx-key g-native is-dim" aria-hidden="true"></span>Outside the current filters</li>';
    return `<div class="bx">
  <div class="bx-filters" role="search" aria-label="Benchmark filters">
    <div class="toolbar bx-toolbar">
      <label class="field grow"><span class="field-label">Search</span><span class="search">${icon('search')}<input class="input" type="search" id="bx-q" placeholder="Name, author, or scope" autocomplete="off" spellcheck="false"></span></label>
      <button type="button" class="btn bx-ftoggle" data-bx-act="ftoggle" aria-expanded="false" aria-controls="bx-facets">${icon('filter')}Filters<span class="bx-fcount"></span></button>
    </div>
    <div class="bx-facets-wrap" id="bx-facets">
      <div class="facets bx-facets">${facets}</div>
      <p class="bx-note">${esc(NATIVE_ONLY_NOTE)}</p>
    </div>
  </div>
  <div class="bx-status">
    <p class="readout" id="bx-readout" aria-live="polite"></p>
    <button type="button" class="btn btn-sm btn-ghost" data-bx-act="clear" hidden>${icon('close')}Clear filters</button>
  </div>
  <div class="bx-chart-card" role="group" aria-labelledby="bx-chart-title">
    <div class="bx-chart-head">
      <h3 class="bx-chart-title" id="bx-chart-title">Year of the cited release, by domain</h3>
      <ul class="legend bx-legend" aria-label="Marks">${legend}</ul>
    </div>
    <div class="chart bx-chart" id="bx-chart"></div>
    <p class="bx-chart-hint">Select a mark to show the entry’s details. With the keyboard, tab into the chart and move between marks with the arrow keys.</p>
  </div>
  <div class="bx-body">
    <aside class="bx-detail" id="bx-detail" aria-label="Details of the selected entry" hidden></aside>
    <div class="bx-list" id="bx-list"></div>
  </div>
</div>`;
  }

  function bxFacetHTML(f) {
    const chips = f.values.map(v => {
      let lead = '', cls = '';
      if (f.key === 'group' && GROUPS[v]) lead = `<span class="bx-key ${GROUPS[v].cls}" aria-hidden="true"></span>`;
      else if (f.key === 'domain') lead = domIconHTML(v, 18, 'bx-chip-icon');
      else if (f.key === 'stream') { lead = '<span class="chip-dot" aria-hidden="true"></span>'; cls = ' ax-' + v; }
      const tip = f.tip ? f.tip(v) : '';
      return `<button type="button" class="chip${cls}" data-bx-act="facet" data-facet="${esc(f.key)}" data-value="${esc(v)}" aria-pressed="false"${tip ? ` data-tip="${esc(tip)}"` : ''}>${lead}${esc(f.text(v))}<span class="chip-n"></span></button>`;
    }).join('');
    return `<fieldset class="facet"><legend class="facet-label">${esc(f.label)}</legend><div class="facet-options">${chips}</div></fieldset>`;
  }

  function onBxClick(e) {
    const t = e.target instanceof Element ? e.target.closest('[data-bx-act]') : null;
    if (!t || !BX.dom.root.contains(t)) return;
    const act = t.getAttribute('data-bx-act'), key = t.getAttribute('data-key');
    if (act === 'facet') {
      const set = BX.st.f[t.getAttribute('data-facet')];
      const v = t.getAttribute('data-value');
      if (!set) return;
      if (!set.has(v) && t.getAttribute('aria-disabled') === 'true') return;   /* no entry left with this value */
      if (set.has(v)) set.delete(v); else set.add(v);
      refreshBx();
    } else if (act === 'clear') {
      const hadFocus = t.contains(document.activeElement);
      resetBx();
      if (hadFocus && BX.dom.search) BX.dom.search.focus();
    } else if (act === 'ftoggle') {
      const open = !BX.dom.filters.classList.contains('is-open');
      BX.dom.filters.classList.toggle('is-open', open);
      t.setAttribute('aria-expanded', String(open));
    } else if (act === 'select') {
      selectBx(key, 'list', { focusDetail: true });
    } else if (act === 'close') {
      closeBxDetail();
    } else if (act === 'study') {
      U.emit('study:open', { key: key, opener: t });
    } else if (act === 'lib') {
      U.revealRef(key);
    } else if (act === 'bib') {
      copyBib(key, t);
    }
  }

  function resetBx() {
    BX.st.q = '';
    BX.st.terms = [];
    if (BX.dom.search) BX.dom.search.value = '';
    Object.keys(BX.st.f).forEach(k => BX.st.f[k].clear());
    refreshBx();
  }

  function refreshBx() {
    BX.all.forEach(b => { b._match = bxPasses(b); });
    updateBxChips();
    const n = BX.all.filter(b => b._match).length;
    BX.dom.readout.textContent = `Showing ${n} of ${BX.all.length} benchmarks and resources`;
    const filtered = bxFiltered();
    BX.dom.clear.hidden = !filtered;
    if (BX.dom.dimKey) BX.dom.dimKey.hidden = !filtered;
    const active = Object.keys(BX.st.f).reduce((s, k) => s + BX.st.f[k].size, 0);
    if (BX.dom.fcount) BX.dom.fcount.innerHTML = active ? `${active}<span class="sr-only"> active</span>` : '';
    renderBxList();
    updateBxChart();
    placeBxDetail();
  }

  function updateBxChips() {
    BX.facets.forEach(f => {
      const counts = new Map();
      BX.all.forEach(b => { if (bxPasses(b, f.key)) f.get(b).forEach(v => counts.set(v, (counts.get(v) || 0) + 1)); });
      BX.dom.root.querySelectorAll('[data-bx-act="facet"]').forEach(btn => {
        if (btn.getAttribute('data-facet') !== f.key) return;
        const v = btn.getAttribute('data-value'), n = counts.get(v) || 0, on = BX.st.f[f.key].has(v);
        btn.setAttribute('aria-pressed', String(on));
        btn.classList.toggle('is-zero', !n && !on);
        if (!n && !on) btn.setAttribute('aria-disabled', 'true'); else btn.removeAttribute('aria-disabled');
        const cn = btn.querySelector('.chip-n');
        if (cn) cn.textContent = String(n);
      });
    });
  }

  /* ------------------------------------------------------------------ list (grouped as Tables 12 and 13) */
  function renderBxList() {
    const host = BX.dom.list;
    const visible = BX.sorted.filter(b => b._match);
    if (!visible.length) {
      host.innerHTML = `<div class="empty"><p>No benchmarks or resources match these filters.</p><button type="button" class="btn btn-sm" data-bx-act="clear">Clear filters</button></div>`;
      return;
    }
    let html = '';
    [12, 13].forEach(tab => {
      const all = BX.sorted.filter(b => groupOf(b).table === tab);
      const items = all.filter(b => b._match);
      if (!items.length) return;
      const t = (D.tables || []).find(x => x.n === tab);
      const cap = t ? U.plain(t.caption).replace(/\.\s*$/, '') : (tab === 12 ? 'Native benchmarks' : 'Resources');
      const count = items.length === all.length ? plural(all.length, 'entry', 'entries') : `${items.length} of ${plural(all.length, 'entry', 'entries')}`;
      html += `<div class="bx-group ${tab === 12 ? 'is-native' : 'is-resource'}">` +
        `<h3 class="bx-gbar"><span class="bx-gnum">Table ${tab}</span><span class="bx-gtitle">${esc(cap)}</span><span class="bx-gcount">${esc(count)}</span></h3>`;
      const doms = [];
      items.forEach(b => { if (doms.indexOf(b._dom) < 0) doms.push(b._dom); });
      doms.forEach(d => {
        html += `<div class="bx-dblock"><h4 class="bx-dom">${domIconHTML(d, 24, 'bx-dom-icon')}${esc(domInfo(d).label)}</h4><ul class="bx-items">` +
          items.filter(b => b._dom === d).map(bxItemHTML).join('') + '</ul></div>';
      });
      html += keyHTML(tab, items) + '</div>';
    });
    host.innerHTML = html;
  }

  /* the codes used in the rows of a table, spelled out once under its list (from the same labels as the tooltips) */
  function keyHTML(tab, items) {
    const used = get => { const s = new Set(); items.forEach(b => get(b).forEach(v => { if (v) s.add(v); })); return s; };
    const list = (set, order, name) => order.filter(v => set.has(v)).concat(Array.from(set).filter(v => order.indexOf(v) < 0))
      .map(v => `${v} ${name(v)}`).join(', ');
    const parts = [];
    if (tab === 12) {
      const pl = used(b => b.platform_tags || []), st = used(b => b.stream || []), sc = used(b => b.scenario_codes || []);
      const ti = used(b => [b.task_id_test]), le = used(b => [b.learning]), cv = used(b => b.caveats || []);
      if (pl.size) parts.push('Platform: ' + list(pl, ['Sim', 'Real', 'Log'], p => platformName(p).toLowerCase()));
      if (st.size) parts.push('Stream (what changes): ' + list(st, ['T', 'E', 'B', 'F'], a => axisName(a).toLowerCase()));
      if (sc.size) parts.push('Scenario: ' + list(sc, ['TIL', 'CIL', 'DIL', 'TF'], c => SCEN[c] || c));
      if (ti.size) parts.push('Task ID at test: ' + ['Yes', 'No', 'Lang.', '--'].filter(v => ti.has(v))
        .map(v => `${tidText(v)} ${(TASKID[v] ? TASKID[v].short : v).replace(/\s*\(–\)$/, '').toLowerCase()}`).join(', '));
      if (le.size) parts.push('Learning signal: ' + list(le, ['IL', 'RL', 'SL'], s => signalName(s).toLowerCase()));
      if (cv.size) parts.push('Caveats: ' + list(cv, [], c => caveatName(c)));
    } else {
      const nd = used(b => b.cl_needs || []);
      if (nd.size) parts.push('Needed for a continual learning claim: ' + list(nd, ['Ord', 'Re', 'Acc', 'Ovl', 'Sep', 'Mem'], needName));
    }
    return parts.length ? `<p class="bx-keyline">${esc(parts.join('. ') + '.')}</p>` : '';
  }

  function bxItemHTML(b) {
    const on = BX.sel === b.key, k = esc(b.key), g = groupOf(b);
    return `<li class="bx-item${on ? ' is-selected' : ''}" id="bx-item-${k}" data-key="${k}">` +
      `<div class="bx-item-head"><span class="bx-key ${g.cls}" aria-hidden="true"></span>` +
      `<button type="button" class="bx-name" data-bx-act="select" data-key="${k}" aria-pressed="${on}">${esc(b.name)}</button>` +
      `<span class="bx-item-cite"><a class="cite" href="#ref-${k}" data-key="${k}">${esc(b.cite)}</a></span>` +
      `<span class="bx-item-badges">${venueBadge(b.venue_short, b.preprint)}${yearBadge(b.year)}</span></div>` +
      `<div class="bx-facts">${bxFactsHTML(b)}</div>` +
      `<div class="bx-slot" id="bx-slot-${k}" hidden></div></li>`;
  }

  const fact = (text, tip) => `<span class="bx-fact"${tip ? ` data-tip="${esc(tip)}"` : ''}>${esc(text)}</span>`;

  function bxFactsHTML(b) {
    const out = [];
    if (b.group === 'native') {
      (b.platform_tags || []).forEach(p => out.push(codeBadge('pl-' + p, p, 'Platform: ' + (b.platform || platformName(p)))));
      (b.stream || []).forEach(a => out.push(codeBadge('ax-' + a, a, 'Changes in the stream: ' + axisName(a).toLowerCase())));
      if (b.scenario && b.scenario !== '--') {
        const gl = (b.scenario_codes || []).map(c => SCEN[c] || c);
        out.push(fact(b.scenario, gl.length ? 'Scenario: ' + gl.join(', ') : 'Scenario'));
      }
      if (b.task_id_test) out.push(fact('Task ID: ' + tidText(b.task_id_test), 'Task identity at test: ' + (TASKID[b.task_id_test] ? TASKID[b.task_id_test].long : b.task_id_test)));
      if (b.learning) out.push(fact(b.learning, 'Learning signal: ' + signalName(b.learning)));
      if (b.scale_short) out.push(fact(b.scale_short, 'Released scope: ' + (b.scale || b.scale_short)));
      if ((b.caveats || []).length) {
        out.push('<span class="bx-facts-label">Caveats</span>' + b.caveats.map(c => codeBadge('cav-' + c, c, 'Caveat: ' + caveatName(c))).join(''));
      }
    } else {
      if (b.scale_short) out.push(fact(b.scale_short, 'Scale: ' + (b.scale || b.scale_short)));
      if (b.role) out.push(fact(roleName(b.role), 'Original role'));
      if ((b.cl_needs || []).length) {
        out.push('<span class="bx-facts-label">Needed</span>' + b.cl_needs.map(c => codeBadge('cav-' + c, c, 'Needed for a continual learning claim: ' + needName(c))).join(''));
      }
    }
    return out.join('');
  }

  /* ------------------------------------------------------------------ selection and detail panel */
  function selectBx(key, origin, opts) {
    opts = opts || {};
    if (key && key === BX.sel && !opts.force) key = null;   // a second press on the selected entry clears it
    BX.sel = key && BX.byKey.has(key) ? key : null;
    BX.origin = BX.sel ? origin : null;
    if (BX.sel) BX.focusKey = BX.sel;
    markBxList();
    updateBxChart();
    placeBxDetail();
    if (BX.sel && opts.focusDetail) {
      const t = document.getElementById('bx-detail-title');
      if (t) t.focus({ preventScroll: true });
    }
  }

  function closeBxDetail() {
    const key = BX.sel, origin = BX.origin;
    selectBx(null, null);
    if (!key) return;
    if (origin === 'chart') { focusMark(key); return; }
    const li = document.getElementById('bx-item-' + key);
    const btn = li && li.querySelector('.bx-name');
    if (btn) btn.focus({ preventScroll: true });
  }

  function markBxList() {
    BX.dom.list.querySelectorAll('.bx-item').forEach(li => {
      const on = li.getAttribute('data-key') === BX.sel;
      li.classList.toggle('is-selected', on);
      const btn = li.querySelector('.bx-name');
      if (btn) btn.setAttribute('aria-pressed', String(on));
    });
  }

  function placeBxDetail() {
    const aside = BX.dom.aside;
    BX.dom.list.querySelectorAll('.bx-slot').forEach(s => { if (!s.hidden) { s.hidden = true; s.replaceChildren(); } });
    const b = BX.sel ? BX.byKey.get(BX.sel) : null;
    if (!b) {
      if (BX.wide) {
        aside.hidden = false;
        aside.classList.add('is-empty');
        aside.innerHTML = `<div class="bx-detail-empty">${icon('info')}<p>Select a mark in the chart or a name in the list to show the entry’s details here.</p></div>`;
      } else {
        aside.hidden = true;
        aside.replaceChildren();
      }
      return;
    }
    const slot = !BX.wide && BX.origin === 'list' ? document.getElementById('bx-slot-' + b.key) : null;
    if (slot) {
      aside.hidden = true;
      aside.replaceChildren();
      slot.hidden = false;
      slot.innerHTML = `<div class="bx-detail is-inline">${bxDetailHTML(b, true)}</div>`;
    } else {
      aside.hidden = false;
      aside.classList.remove('is-empty');
      aside.innerHTML = bxDetailHTML(b);
    }
  }

  function levelText(b) {
    const lv = b.levels || [];
    if (!lv.length) return '';
    const name = l => esc(((BX.levels.get(l) || {}).name) || '');
    const parts = lv.filter(l => l !== 'L3').map(l => `${l} ${name(l)}`.trim());
    if (lv.indexOf('L3') >= 0) parts.push(b.l3_partial ? `adds a single L3 property (${name('L3')})` : `L3 ${name('L3')}`.trim());
    return capFirst(parts.join('; '));
  }

  function bxDetailHTML(b, inline) {
    const ht = inline ? 'h5' : 'h3';   // inside a list item the title nests under the h4 domain heading
    const g = groupOf(b), r = U.ref(b.key) || {}, s = U.study(b.key), k = esc(b.key);
    const sec = U.section(b.section);
    const kicker = `Table ${g.table} · Section ${b.section || ''}${sec && b.group === 'native' ? ' · ' + sec.title : ''}`;
    const rows = [];
    const row = (dt, dd) => { if (dd) rows.push(`<div><dt>${esc(dt)}</dt><dd>${dd}</dd></div>`); };
    if (b.group === 'native') {
      row('Platform', (b.platform_tags || []).map(p => `<span class="badge pl-${esc(p)}">${esc(p)}</span>`).join(' ') + (b.platform ? ' ' + esc(b.platform) : ''));
      row('Observations', b.obs ? (b.obs === '--' ? '–' : esc(b.obs)) : '');
      row('Actions', b.action ? (b.action === '--' ? '–' : esc(b.action)) : '');
      row('Released scope', esc(b.scale || b.scale_short || ''));
      row('What changes in the stream', (b.stream || []).map(a => `<span class="badge ax-${esc(a)}">${esc(a)}</span> ${esc(axisName(a))}`).join(', '));
      row('Scenario', b.scenario && b.scenario !== '--'
        ? esc(b.scenario) + ((b.scenario_codes || []).length ? `<span class="bx-gloss">${esc(b.scenario_codes.map(c => SCEN[c] || c).join(', '))}</span>` : '')
        : (b.scenario === '--' ? '–' : ''));
      row('Task identity at test', b.task_id_test ? esc(TASKID[b.task_id_test] ? TASKID[b.task_id_test].long : b.task_id_test) : '');
      row('Learning signal', b.learning ? `${esc(b.learning)} <span class="bx-gloss-inline">${esc(signalName(b.learning))}</span>` : '');
      row('Caveats', (b.caveats || []).map(c => `<span class="bx-code-line"><span class="badge cav-${esc(c)}">${esc(c)}</span> ${esc(caveatName(c))}</span>`).join(''));
      row('Difficulty hierarchy (Section 9.4)', levelText(b));
    } else {
      row('Scale', esc(b.scale || b.scale_short || ''));
      row('Original role', b.role ? esc(roleName(b.role)) : '');
      row('Needed for a continual learning claim', (b.cl_needs || []).map(c => `<span class="bx-code-line"><span class="badge cav-${esc(c)}">${esc(c)}</span> ${esc(needName(c))}</span>`).join(''));
    }
    if (s) {
      const ev = s.evidence || 'NG';
      row('Also a coded study', `<span class="badge ev-${esc(ev)}">${esc(ev)}</span> Evidence grade: ${esc(((D.vocab && D.vocab.evidence) || {})[ev] || ev)}`);
    }
    const acts = [];
    if (s && hasExplorer()) acts.push(`<button type="button" class="btn btn-sm" data-bx-act="study" data-key="${k}">${icon('filter')}Study details</button>`);
    if (r.key) acts.push(`<button type="button" class="btn btn-sm" data-bx-act="lib" data-key="${k}">${icon('books')}In the library</button>`);
    const doi = b.doi || r.doi;
    if (doi) acts.push(`<a class="btn btn-sm" href="${esc(doiURL(doi))}" target="_blank" rel="noopener">${icon('external')}DOI<span class="sr-only"> of ${esc(b.cite)} (opens in a new tab)</span></a>`);
    if (r.arxiv) acts.push(`<a class="btn btn-sm" href="${esc(arxivURL(r.arxiv))}" target="_blank" rel="noopener">${icon('external')}arXiv<span class="sr-only"> version of ${esc(b.cite)} (opens in a new tab)</span></a>`);
    if (r.bibtex) acts.push(`<button type="button" class="btn btn-sm" data-bx-act="bib" data-key="${k}" aria-label="Copy the BibTeX entry of ${esc(b.cite)}">${icon('copy')}<span data-copy-label>Copy BibTeX</span></button>`);
    if ((b.levels || []).length) acts.push(`<a class="btn btn-sm btn-ghost" href="#evaluation" data-goto-section="9.4">${icon('arrow-right')}Difficulty hierarchy</a>`);
    return `<div class="bx-detail-head">` +
      `<div class="bx-detail-titles"><p class="bx-detail-kicker">${esc(kicker)}</p>` +
      `<${ht} class="bx-detail-title" id="bx-detail-title" tabindex="-1">${esc(b.name)}</${ht}>` +
      `<p class="bx-detail-cite"><a class="cite" href="#ref-${k}" data-key="${k}">${esc(b.cite)}</a> ${venueBadge(b.venue_short, b.preprint)}${yearBadge(b.year)}</p></div>` +
      `<button type="button" class="btn btn-icon btn-sm btn-ghost" data-bx-act="close" aria-label="Close the details of ${esc(b.name)}">${icon('close')}</button></div>` +
      `<p class="bx-detail-tags"><span class="bx-tag">${domIconHTML(b._dom, 20, '')}${esc(domInfo(b._dom).label)}</span>` +
      `<span class="bx-tag"><span class="bx-key ${g.cls}" aria-hidden="true"></span>${esc(g.label)} (Table ${g.table})</span></p>` +
      `<dl class="bx-kv">${rows.join('')}</dl>` +
      (acts.length ? `<div class="bx-detail-acts">${acts.join('')}</div>` : '');
  }

  /* ------------------------------------------------------------------ timeline dot plot (D3 scales, SVG) */
  const cellOrder = (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
    String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' });

  function markLabel(b) {
    const g = groupOf(b);
    return `${b.name}, ${b.year}, ${domInfo(b._dom).label}, ${g.label.toLowerCase()} (Table ${g.table})`;
  }
  function markTip(b) {
    const g = groupOf(b);
    return `<b>${esc(b.name)}</b> ${esc(b.year)}<span class="tt-sub">${esc(g.label)} (Table ${g.table}) · ${esc(domInfo(b._dom).label)}</span>` +
      `<span class="tt-sub">${esc(b.cite)}${b.venue_short ? ' · ' + esc(b.venue_short) : ''}</span>`;
  }

  function drawBxChart() {
    const host = BX.dom.chart;
    const W = Math.floor(host.clientWidth);
    if (!W) return;
    if (BX.svg && BX.svg.isConnected && BX.geo && BX.geo.W === W) return;   // already drawn at this width
    const hadFocus = host.contains(document.activeElement);                 // a redraw keeps keyboard focus on its mark
    const d3 = window.d3;
    if (!d3 || typeof d3.scaleBand !== 'function') {
      host.innerHTML = '<p class="bx-nochart">The chart could not be drawn because the D3 library did not load. The list below shows every entry.</p>';
      BX.svg = null;
      return;
    }
    U.tooltip.hide();
    BX.hover = null;
    const narrow = W < 560;
    const R = narrow ? 5 : 7, STEP = narrow ? 13 : 18;
    const ML = narrow ? 2 : 196, MR = 8, MT = 4, AXH = 26, LABELH = narrow ? 22 : 0;
    BX.geo = { W: W, R: R, ML: ML, narrow: narrow };
    const years = d3.range(BX.minYear, BX.maxYear + 1);
    const x = d3.scaleBand().domain(years).range([ML, Math.max(ML + 120, W - MR)]).paddingInner(0);
    const band = x.bandwidth();
    const cols = Math.max(1, Math.floor((band - 4) / STEP));
    let y = MT;
    const rows = BX.domains.map((dom, i) => {
      const cells = d3.group(BX.all.filter(b => b._dom === dom), b => b.year);
      let lines = 1;
      cells.forEach(list => { lines = Math.max(lines, Math.ceil(list.length / cols)); });
      const inner = Math.max(narrow ? 26 : 32, lines * STEP + (narrow ? 8 : 12));
      const row = { dom: dom, i: i, top: y, h: LABELH + inner, cells: cells };
      row.cy = y + LABELH + inner / 2;
      y += row.h;
      return row;
    });
    const plotBottom = y, H = Math.ceil(y + AXH);
    rows.forEach(row => {
      row.cells.forEach((list, year) => {
        list.sort(cellOrder);
        const n = list.length, lines = Math.ceil(n / cols);
        list.forEach((b, k) => {
          const line = Math.floor(k / cols), col = k % cols, inLine = Math.min(cols, n - line * cols);
          b._x = x(year) + band / 2 + (col - (inLine - 1) / 2) * STEP;
          b._y = row.cy + (line - (lines - 1) / 2) * STEP;
          b._row = row.i;
        });
      });
    });

    const p = [];
    p.push(`<svg class="bx-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-labelledby="bx-svg-title" aria-describedby="bx-svg-desc">`);
    p.push('<title id="bx-svg-title">Benchmarks, datasets, and simulators by year of the cited release and domain</title>');
    p.push('<desc id="bx-svg-desc">Each mark is one entry of Table 12 or Table 13: dark circles are benchmarks with an explicit continual learning protocol, blue circles reusable resources, and outlined squares simulators. Arrow keys move between marks; Enter selects one.</desc>');
    rows.forEach(row => {
      p.push(`<rect class="bx-row-bg${row.i % 2 ? ' is-alt' : ''}" x="0" y="${row.top + 1}" width="${W}" height="${Math.max(0, row.h - 2)}" rx="6"/>`);
    });
    years.forEach((yr, i) => {
      if (i) p.push(`<line class="bx-grid" x1="${x(yr)}" x2="${x(yr)}" y1="${MT}" y2="${plotBottom}"/>`);
    });
    rows.forEach(row => {
      const info = domInfo(row.dom), src = U.iconSrc(info.icon);
      if (narrow) {
        p.push(`<g class="bx-row-head" transform="translate(${ML + 6},${row.top + 4})">` +
          (src ? `<image href="${esc(src)}" x="0" y="0" width="16" height="16"/>` : '') +
          `<text class="bx-row-label" x="${src ? 21 : 0}" y="12.5">${esc(info.label)}</text></g>`);
      } else {
        p.push(`<g class="bx-row-head" transform="translate(8,${row.cy})">` +
          (src ? `<image href="${esc(src)}" x="0" y="-12" width="24" height="24"/>` : '') +
          `<text class="bx-row-label" x="${src ? 31 : 0}" dy="0.35em">${esc(info.label)}</text></g>`);
      }
    });
    const short = band < 40;
    years.forEach(yr => {
      p.push(`<text class="bx-year" x="${(x(yr) + band / 2).toFixed(1)}" y="${plotBottom + 18}" text-anchor="middle">${short ? '’' + String(yr).slice(2) : yr}</text>`);
    });
    p.push('<g class="bx-marks">');
    BX.all.forEach(b => {
      if (b._x == null) return;
      const g = groupOf(b);
      const shape = b.group === 'simulator'
        ? `<rect class="bx-dot ${g.cls}" x="${-R + 0.8}" y="${-R + 0.8}" width="${2 * R - 1.6}" height="${2 * R - 1.6}" rx="2.5"/>`
        : `<circle class="bx-dot ${g.cls}" r="${R}"/>`;
      p.push(`<g class="bx-mark" data-key="${esc(b.key)}" transform="translate(${b._x.toFixed(1)},${b._y.toFixed(1)})" role="button" aria-pressed="false" aria-label="${esc(markLabel(b))}">` +
        `<circle class="bx-hit" r="${R + 4}"/>${shape}<circle class="bx-ring" r="${R + 3.5}"/><circle class="bx-focus" r="${R + 7}"/></g>`);
    });
    p.push('</g><text class="bx-sel-label" display="none" aria-hidden="true"></text></svg>');
    host.innerHTML = p.join('');

    const svg = host.querySelector('svg');
    BX.svg = svg;
    BX.markNodes = new Map();
    svg.querySelectorAll('.bx-mark').forEach(node => BX.markNodes.set(node.getAttribute('data-key'), node));
    bindBxChart(svg);
    updateBxChart();
    if (hadFocus && BX.focusKey) focusMark(BX.focusKey);
  }

  function bindBxChart(svg) {
    const markOf = e => {
      const g = e.target instanceof Element ? e.target.closest('.bx-mark') : null;
      return g && svg.contains(g) ? g : null;
    };
    svg.addEventListener('click', e => {
      const g = markOf(e);
      if (!g) return;
      U.tooltip.hide();
      BX.hover = null;
      selectBx(g.getAttribute('data-key'), 'chart');
    });
    svg.addEventListener('mouseover', e => {
      const g = markOf(e);
      if (!g || g === BX.hover) return;
      BX.hover = g;
      const b = BX.byKey.get(g.getAttribute('data-key'));
      if (b) U.tooltip.show(markTip(b), e);
    });
    svg.addEventListener('mousemove', e => { if (BX.hover) U.tooltip.move(e); });
    svg.addEventListener('mouseout', e => {
      if (!BX.hover) return;
      if (e.relatedTarget instanceof Node && BX.hover.contains(e.relatedTarget)) return;
      BX.hover = null;
      U.tooltip.hide();
    });
    svg.addEventListener('focusin', e => {
      const g = markOf(e);
      if (!g) return;
      BX.focusKey = g.getAttribute('data-key');
      setRoving();
      const b = BX.byKey.get(BX.focusKey);
      if (b) U.tooltip.show(markTip(b), g);
    });
    svg.addEventListener('focusout', () => { if (!BX.hover) U.tooltip.hide(); });
    svg.addEventListener('keydown', e => {
      const g = markOf(e);
      if (!g) return;
      const b = BX.byKey.get(g.getAttribute('data-key'));
      if (!b) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); selectBx(b.key, 'chart'); return; }
      if (e.key === 'Escape') { if (BX.sel) { e.preventDefault(); selectBx(null, null); } return; }
      const next = moveFrom(b, e.key);
      if (next === undefined) return;   // not a navigation key
      e.preventDefault();
      if (next) focusMark(next.key);
    });
  }

  /* arrow keys: left and right within a domain row (in time order), up and down to the nearest mark of the next row */
  function moveFrom(b, key) {
    const rowMarks = r => BX.all.filter(m => m._match && m._row === r && m._x != null).sort((p, q) => p._x - q._x || p._y - q._y);
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End') {
      const list = rowMarks(b._row), i = list.indexOf(b);
      if (key === 'Home') return list[0] || null;
      if (key === 'End') return list[list.length - 1] || null;
      return list[i + (key === 'ArrowRight' ? 1 : -1)] || null;
    }
    if (key !== 'ArrowUp' && key !== 'ArrowDown') return undefined;
    const dir = key === 'ArrowDown' ? 1 : -1;
    for (let r = b._row + dir; r >= 0 && r < BX.domains.length; r += dir) {
      const list = rowMarks(r);
      if (!list.length) continue;
      return list.reduce((best, m) => (!best || Math.abs(m._x - b._x) < Math.abs(best._x - b._x) - 0.1 ? m : best), null);
    }
    return null;
  }

  function setRoving() {
    if (!BX.markNodes) return;
    const ok = key => { const b = key && BX.byKey.get(key); return !!(b && b._match); };
    let k = ok(BX.focusKey) ? BX.focusKey : ok(BX.sel) ? BX.sel : null;
    if (!k) {
      const first = BX.all.filter(b => b._match && b._x != null).sort((p, q) => p._row - q._row || p._x - q._x || p._y - q._y)[0];
      k = first ? first.key : null;
    }
    BX.markNodes.forEach((node, key) => {
      const b = BX.byKey.get(key);
      if (!b || !b._match) node.removeAttribute('tabindex');
      else node.setAttribute('tabindex', key === k ? '0' : '-1');
    });
  }

  function focusMark(key) {
    const node = BX.markNodes && BX.markNodes.get(key);
    const b = BX.byKey.get(key);
    if (!node || !b || !b._match) return;
    BX.focusKey = key;
    setRoving();
    node.focus();
  }

  function updateBxChart() {
    if (!BX.svg || !BX.markNodes) return;
    BX.markNodes.forEach((node, key) => {
      const b = BX.byKey.get(key);
      const on = BX.sel === key;
      node.classList.toggle('is-dim', !b._match);
      node.classList.toggle('is-selected', on);
      node.setAttribute('aria-pressed', String(on));
      if (b._match) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', 'true');
    });
    setRoving();
    const lab = BX.svg.querySelector('.bx-sel-label');
    const s = BX.sel ? BX.byKey.get(BX.sel) : null;
    if (!lab) return;
    if (!s || s._x == null) { lab.setAttribute('display', 'none'); return; }
    const G = BX.geo;
    let ly = s._y - G.R - 9, anchor = 'middle', lx = s._x;
    if (ly < 12) ly = s._y + G.R + 17;
    if (lx > G.W - 72) anchor = 'end';
    else if (lx < G.ML + 56) anchor = 'start';
    if (anchor === 'end') lx = Math.min(lx + G.R, G.W - 2);
    if (anchor === 'start') lx = Math.max(lx - G.R, 2);
    lab.setAttribute('x', lx.toFixed(1));
    lab.setAttribute('y', ly.toFixed(1));
    lab.setAttribute('text-anchor', anchor);
    lab.textContent = s.name;
    lab.removeAttribute('display');
  }

  /* ------------------------------------------------------------------ public: show one benchmark (library marks, bus) */
  function showBenchmark(key) {
    if (!BX.ready || !key || !BX.byKey.has(key)) return false;
    const b = BX.byKey.get(key);
    if (!bxPasses(b)) resetBx();
    selectBx(key, 'external', { force: true });
    const target = BX.wide ? BX.dom.chartCard : (BX.dom.aside.hidden ? BX.dom.chartCard : BX.dom.aside);
    target.scrollIntoView({ block: 'start', behavior: 'auto' });
    const t = document.getElementById('bx-detail-title');
    if (t) t.focus({ preventScroll: true });
    if (U.flash) U.flash(BX.dom.aside.hidden ? BX.dom.chartCard : BX.dom.aside);
    return true;
  }

  /* ================================================================== library */
  const TYPE_FILTER = [['journal', 'Journal'], ['conference', 'Conference'], ['preprint', 'Preprint'], ['other', 'Book or other']];
  const TYPE_LONG = { journal: 'Journal article', conference: 'Conference paper', preprint: 'Preprint', chapter: 'Book chapter' };
  const MARK_FILTER = [['study', 'Coded studies'], ['bench', 'Benchmarks and resources']];
  const SORTS = [['new', 'Newest first'], ['old', 'Oldest first'], ['title', 'Title, A to Z'], ['author', 'First author, A to Z']];
  const LIMIT_ALL = 5, LIMIT_ONE = 12, MAX_AUTHORS = 6;
  const typeKey = r => (r.type === 'journal' || r.type === 'conference' || r.type === 'preprint' ? r.type : 'other');
  const surname = r => String(r.cite || (r.authors || [''])[0] || '').replace(/\s+\d{4}[a-z]?$/, '').replace(/\s+(et al\.|and\s.*)$/, '');

  function libPasses(r, except) {
    const st = LB.st;
    if (except !== 'q' && st.terms.length && !st.terms.every(t => r._hay.indexOf(t) >= 0)) return false;
    if (except !== 'year' && (r.year < st.from || r.year > st.to)) return false;
    if (except !== 'type' && st.types.size && !st.types.has(r._type)) return false;
    if (except !== 'marks' && st.marks.size && !((st.marks.has('study') && r.in_corpus) || (st.marks.has('bench') && r.is_benchmark))) return false;
    if (except !== 'section' && st.section && r._first !== st.section) return false;
    return true;
  }
  const libFiltered = () => {
    const st = LB.st;
    return st.terms.length > 0 || st.from !== LB.years[0] || st.to !== LB.years[LB.years.length - 1] ||
      st.types.size > 0 || st.marks.size > 0 || !!st.section;
  };

  function initLibrary(el) {
    LB.el = el;
    LB.list = D.library.map((r, i) => {
      const o = Object.assign({}, r);
      o._i = i;
      o._first = (r.sections && r.sections.length) ? String(r.sections[0]) : '';
      o._type = typeKey(r);
      o._hay = fold([r.title, (r.authors || []).join(' '), r.venue, r.venue_short, r.key, r.cite, r.year, r.note].filter(Boolean).join(' | '));
      o._tsort = fold(r.title);
      o._asort = fold(surname(r));
      return o;
    });
    LB.byKey = new Map(LB.list.map(r => [r.key, r]));
    LB.years = Array.from(new Set(LB.list.map(r => r.year).filter(y => typeof y === 'number'))).sort((a, b) => a - b);
    LB.groupIds = Array.from(new Set(LB.list.map(r => r._first))).sort((a, b) => (Number(a) || 99) - (Number(b) || 99));
    LB.groupTotals = new Map(LB.groupIds.map(id => [id, LB.list.filter(r => r._first === id).length]));
    LB.st = { q: '', terms: [], from: LB.years[0], to: LB.years[LB.years.length - 1], types: new Set(), marks: new Set(), section: '', sort: 'new', expanded: new Set() };

    el.replaceChildren();
    el.insertAdjacentHTML('beforeend', libSkeletonHTML());
    const root = el.querySelector('.lib');
    LB.dom = {
      root: root,
      filters: root.querySelector('.lib-filters'),
      fcount: root.querySelector('.lib-fcount'),
      search: root.querySelector('#lib-q'),
      from: root.querySelector('#lib-from'),
      to: root.querySelector('#lib-to'),
      sort: root.querySelector('#lib-sort'),
      hist: root.querySelector('#lib-hist'),
      readout: root.querySelector('#lib-readout'),
      clear: root.querySelector('.lib-status [data-lib-act="clear"]'),
      groups: root.querySelector('#lib-groups')
    };
    syncYearSelects();
    /* below 760 px of module width the year range, histogram and filter chips fold behind a "Filters" button, as in
       the evidence and benchmark explorers, so that the first references follow the search field */
    const applyWidth = w => { if (w) root.classList.toggle('is-narrow', w < 760); };
    applyWidth(el.clientWidth);
    U.onResize(el, applyWidth);

    LB.dom.search.addEventListener('input', U.debounce(() => {
      LB.st.q = LB.dom.search.value;
      LB.st.terms = queryTerms(LB.st.q);
      renderLib();
    }, 140));
    LB.dom.from.addEventListener('change', () => {
      const v = Number(LB.dom.from.value);
      setYears(v, Math.max(v, LB.st.to));
    });
    LB.dom.to.addEventListener('change', () => {
      const v = Number(LB.dom.to.value);
      setYears(Math.min(v, LB.st.from), v);
    });
    LB.dom.sort.addEventListener('change', () => { LB.st.sort = LB.dom.sort.value; renderLib(); });
    root.addEventListener('click', onLibClick);

    renderLib();
    U.onResize(LB.dom.hist, () => guard('year histogram', drawHist));
    LB.ready = true;
  }

  function libSkeletonHTML() {
    const yearOpts = LB.years.map(y => `<option value="${y}">${y}</option>`).join('');
    const sortOpts = SORTS.map(s => `<option value="${s[0]}">${esc(s[1])}</option>`).join('');
    const typeChips = TYPE_FILTER.map(t => `<button type="button" class="chip" data-lib-act="type" data-value="${t[0]}" aria-pressed="false">${esc(t[1])}<span class="chip-n"></span></button>`).join('');
    const markChips = MARK_FILTER.map(m => `<button type="button" class="chip" data-lib-act="mark" data-value="${m[0]}" aria-pressed="false">${esc(m[1])}<span class="chip-n"></span></button>`).join('');
    const secChips = `<button type="button" class="chip" data-lib-act="section" data-value="" aria-pressed="true">All sections<span class="chip-n"></span></button>` +
      LB.groupIds.filter(Boolean).map(id => `<button type="button" class="chip lib-sec-chip" data-lib-act="section" data-value="${esc(id)}" aria-pressed="false" style="${chipStyle(sectionColors(id))}" data-tip="${esc('Section ' + id + ': ' + sectionTitle(id))}"><span class="chip-dot" aria-hidden="true"></span><span class="lib-sec-num">${esc(id)}</span>${esc(sectionShort(id))}<span class="chip-n"></span></button>`).join('');
    return `<div class="lib">
  <div class="lib-filters" role="search" aria-label="Library filters">
    <div class="toolbar lib-toolbar">
      <label class="field grow lib-search-field"><span class="field-label">Search</span><span class="search">${icon('search')}<input class="input" type="search" id="lib-q" placeholder="Title, author, venue, or key" autocomplete="off" spellcheck="false"></span></label>
      <button type="button" class="btn lib-ftoggle" data-lib-act="ftoggle" aria-expanded="false" aria-controls="lib-more">${icon('filter')}Filters<span class="bx-fcount lib-fcount"></span></button>
      <label class="field lib-year-field lib-fold"><span class="field-label">From</span><select class="select" id="lib-from">${yearOpts}</select></label>
      <label class="field lib-year-field lib-fold"><span class="field-label">To</span><select class="select" id="lib-to">${yearOpts}</select></label>
      <label class="field lib-sort-field lib-fold"><span class="field-label">Sort</span><select class="select" id="lib-sort">${sortOpts}</select></label>
    </div>
    <div class="lib-more lib-fold" id="lib-more">
      <div class="lib-hist chart" id="lib-hist"></div>
      <div class="lib-facets">
        <fieldset class="facet"><legend class="facet-label">Type</legend><div class="facet-options">${typeChips}</div></fieldset>
        <fieldset class="facet"><legend class="facet-label">Show only</legend><div class="facet-options">${markChips}</div></fieldset>
      </div>
      <fieldset class="facet lib-secs"><legend class="facet-label">First cited in</legend><div class="facet-options">${secChips}</div></fieldset>
    </div>
  </div>
  <div class="lib-status">
    <p class="readout" id="lib-readout" aria-live="polite"></p>
    <button type="button" class="btn btn-sm btn-ghost" data-lib-act="clear" hidden>${icon('close')}Clear filters</button>
  </div>
  <div class="lib-groups" id="lib-groups"></div>
</div>`;
  }

  function onLibClick(e) {
    const t = e.target instanceof Element ? e.target.closest('[data-lib-act]') : null;
    if (!t || !LB.dom.root.contains(t)) return;
    const act = t.getAttribute('data-lib-act'), v = t.getAttribute('data-value'), key = t.getAttribute('data-key');
    const st = LB.st;
    /* a filter chip with no matching reference left is inactive (unless it is the one already selected) */
    if ((act === 'type' || act === 'mark' || act === 'section') && t.getAttribute('aria-disabled') === 'true' &&
        t.getAttribute('aria-pressed') !== 'true') return;
    if (act === 'ftoggle') {
      const open = !LB.dom.filters.classList.contains('is-open');
      LB.dom.filters.classList.toggle('is-open', open);
      t.setAttribute('aria-expanded', String(open));
      if (open) U.nextFrame(() => guard('year histogram', drawHist));   /* it had no width while folded */
      return;
    }
    if (act === 'type' || act === 'mark') {
      const set = act === 'type' ? st.types : st.marks;
      if (set.has(v)) set.delete(v); else set.add(v);
      renderLib();
    } else if (act === 'section') {
      st.section = v && st.section !== v ? v : '';
      renderLib();
    } else if (act === 'clear') {
      const hadFocus = t.contains(document.activeElement);
      resetLib();
      renderLib();
      if (hadFocus) LB.dom.search.focus();
    } else if (act === 'more') {
      toggleGroup(t.getAttribute('data-group'));
    } else if (act === 'bib') {
      copyBib(key, t);
    } else if (act === 'study') {
      U.emit('study:open', { key: key, opener: t });
    } else if (act === 'bench') {
      showBenchmark(key);
    }
  }

  function setYears(from, to) {
    LB.st.from = from;
    LB.st.to = to;
    syncYearSelects();
    renderLib();
  }
  function syncYearSelects() {
    if (!LB.dom) return;
    LB.dom.from.value = String(LB.st.from);
    LB.dom.to.value = String(LB.st.to);
  }
  function resetLib() {
    const st = LB.st;
    st.q = '';
    st.terms = [];
    LB.dom.search.value = '';
    st.from = LB.years[0];
    st.to = LB.years[LB.years.length - 1];
    st.types.clear();
    st.marks.clear();
    st.section = '';
    syncYearSelects();
  }

  function sortLib(list) {
    const s = LB.st.sort, arr = list.slice();
    const byTitle = (a, b) => a._tsort.localeCompare(b._tsort, 'en');
    if (s === 'old') arr.sort((a, b) => a.year - b.year || byTitle(a, b));
    else if (s === 'title') arr.sort((a, b) => byTitle(a, b) || b.year - a.year);
    else if (s === 'author') arr.sort((a, b) => a._asort.localeCompare(b._asort, 'en') || a.year - b.year || byTitle(a, b));
    else arr.sort((a, b) => a._i - b._i);   // data order: newest first, then title
    return arr;
  }

  function renderLib() {
    const matched = LB.list.filter(r => libPasses(r));
    LB.matched = sortLib(matched);
    updateLibChips();
    LB.dom.readout.textContent = `Showing ${matched.length} of ${LB.list.length} references`;
    LB.dom.clear.hidden = !libFiltered();
    const st = LB.st;
    const active = st.types.size + st.marks.size + (st.section ? 1 : 0) +
      (st.from !== LB.years[0] || st.to !== LB.years[LB.years.length - 1] ? 1 : 0);
    if (LB.dom.fcount) LB.dom.fcount.innerHTML = active ? `${active}<span class="sr-only"> active</span>` : '';
    renderLibGroups();
    guard('year histogram', drawHist);
  }

  function updateLibChips() {
    const st = LB.st, root = LB.dom.root;
    const countBy = (except, keyFn) => {
      const m = new Map();
      LB.list.forEach(r => { if (libPasses(r, except)) keyFn(r).forEach(k => m.set(k, (m.get(k) || 0) + 1)); });
      return m;
    };
    const types = countBy('type', r => [r._type]);
    const marks = countBy('marks', r => [r.in_corpus ? 'study' : null, r.is_benchmark ? 'bench' : null].filter(Boolean));
    const secs = countBy('section', r => [r._first]);
    let allSecs = 0;
    secs.forEach(n => { allSecs += n; });
    root.querySelectorAll('.lib-filters [data-lib-act]').forEach(btn => {
      const act = btn.getAttribute('data-lib-act'), v = btn.getAttribute('data-value');
      let n = 0, on = false;
      if (act === 'type') { n = types.get(v) || 0; on = st.types.has(v); }
      else if (act === 'mark') { n = marks.get(v) || 0; on = st.marks.has(v); }
      else if (act === 'section') { n = v ? secs.get(v) || 0 : allSecs; on = v ? st.section === v : !st.section; }
      else return;
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('is-zero', !n && !on);
      if (!n && !on) btn.setAttribute('aria-disabled', 'true'); else btn.removeAttribute('aria-disabled');
      const cn = btn.querySelector('.chip-n');
      if (cn) cn.textContent = String(n);
    });
  }

  function renderLibGroups() {
    const byGroup = new Map(LB.groupIds.map(id => [id, []]));
    LB.matched.forEach(r => { const g = byGroup.get(r._first); if (g) g.push(r); });
    let html = '';
    LB.groupIds.forEach(id => {
      const list = byGroup.get(id);
      if (list && list.length) html += groupHTML(id, list, LB.groupTotals.get(id) || list.length);
    });
    if (!html) {
      html = `<div class="empty"><p>No references match these filters.</p><button type="button" class="btn btn-sm" data-lib-act="clear">Clear filters</button></div>`;
    }
    LB.dom.groups.innerHTML = html;
  }

  function groupHTML(id, list, total) {
    const st = LB.st;
    const limit = st.section ? LIMIT_ONE : LIMIT_ALL;
    const open = st.expanded.has(id);
    const shown = open ? list : list.slice(0, limit);
    const rest = list.length - limit;
    const gid = esc(id || 'other');
    const count = list.length === total ? plural(total, 'reference', 'references') : `${list.length} of ${plural(total, 'reference', 'references')}`;
    /* heading: the short name of the section (as in Figure 2); the paper's own heading in gray beside it */
    const name = id ? sectionShort(id) : 'Other references';
    const full = id ? sectionTitle(id) : '';
    return `<div class="lib-group" style="${colorStyle(id ? sectionColors(id) : NEUTRAL_SET)}">` +
      `<h3 class="lib-gbar" id="lib-gh-${gid}">${id ? `<span class="lib-gnum" aria-hidden="true">${esc(id)}</span><span class="sr-only">Section ${esc(id)}: </span>` : ''}` +
      `<span class="lib-gtitle">${esc(name)}${full && full !== name ? `<span class="lib-gsub">${esc(full)}</span>` : ''}</span><span class="lib-gcount">${esc(count)}</span></h3>` +
      `<ol class="lib-list" id="lib-list-${gid}">${shown.map(entryHTML).join('')}</ol>` +
      (rest > 0 ? `<button type="button" class="show-more" data-lib-act="more" data-group="${esc(id)}" aria-expanded="${open}" aria-controls="lib-list-${gid}">${open ? 'Show fewer' : `Show ${rest} more`}${icon('chev-down')}</button>` : '') +
      '</div>';
  }

  function toggleGroup(id) {
    id = id || '';
    const st = LB.st;
    const wasOpen = st.expanded.has(id);
    if (wasOpen) st.expanded.delete(id); else st.expanded.add(id);
    renderLibGroups();
    const gid = id || 'other';
    const list = document.getElementById('lib-list-' + gid);
    if (!list) return;
    if (!wasOpen) {
      /* focus the first entry that the button revealed */
      const limit = st.section ? LIMIT_ONE : LIMIT_ALL;
      const li = list.children[limit];
      if (li) { li.setAttribute('tabindex', '-1'); li.focus({ preventScroll: true }); }
    } else {
      const head = document.getElementById('lib-gh-' + gid);
      if (head && head.getBoundingClientRect().top < 0) head.scrollIntoView({ block: 'start', behavior: 'auto' });
      const btn = list.parentNode.querySelector('.show-more');
      if (btn) btn.focus({ preventScroll: true });
    }
  }

  function authorsHTML(list, terms) {
    const n = list.length;
    if (!n) return '';
    if (n <= MAX_AUTHORS + 1) return list.map(a => highlight(a, terms)).join(', ');
    const show = [];
    for (let i = 0; i < MAX_AUTHORS; i++) show.push(i);
    if (terms.length) {
      for (let i = MAX_AUTHORS; i < n && show.length < MAX_AUTHORS + 3; i++) {
        const fa = fold(list[i]);
        if (terms.some(t => fa.indexOf(t) >= 0)) show.push(i);
      }
    }
    const parts = [];
    let prev = -1;
    show.forEach(i => {
      if (i !== prev + 1) parts.push('…');
      parts.push(highlight(list[i], terms));
      prev = i;
    });
    return parts.join(', ') + `, et al.<span class="sr-only"> (${n} authors)</span>`;
  }

  /* three lines per reference: badges, title and its links (DOI, arXiv or a Scholar search, BibTeX); authors; venue,
     type, citing sections, key and the marks for coded studies and benchmarks */
  function entryHTML(r) {
    const terms = LB.st.terms, k = esc(r.key);
    const meta = [];
    if (r.venue) meta.push(`<span>${highlight(r.venue, terms)}${r.note ? ', ' + esc(r.note) : ''}</span>`);
    if (!/preprint/i.test(r.venue || '')) meta.push(`<span>${esc(TYPE_LONG[r.type] || 'Other')}</span>`);   /* not "arXiv preprint · Preprint" */
    const secs = (r.sections || []).map(String);
    if (secs.length) meta.push(`<span>Cited in ${secs.length > 1 ? 'Sections' : 'Section'} ${esc(joinList(secs))}</span>`);
    meta.push(`<code class="lib-key">${highlight(r.key, terms)}</code>`);
    const marks = marksHTML(r);
    return `<li class="lib-item" id="ref-${k}" data-key="${k}">` +
      `<p class="lib-title">${venueBadge(r.venue_short, r.preprint, terms)}${yearBadge(r.year)}<span class="lib-ttext">${highlight(r.title, terms)}</span>${actsHTML(r)}</p>` +
      `<p class="lib-authors">${authorsHTML(r.authors || [], terms)}</p>` +
      `<p class="lib-meta">${meta.join('<span class="lib-sep" aria-hidden="true"> · </span>')}${marks}</p></li>`;
  }

  function marksHTML(r) {
    const out = [], k = esc(r.key);
    if (r.in_corpus) {
      const s = U.study(r.key), ev = (s && s.evidence) || 'NG';
      const evName = ((D.vocab && D.vocab.evidence) || {})[ev] || ev;
      const badge = `<span class="badge ev-${esc(ev)}" aria-hidden="true">${esc(ev)}</span>`;
      if (hasExplorer() && s) {
        out.push(`<button type="button" class="lib-mark is-study" data-lib-act="study" data-key="${k}" aria-label="Coded study, evidence grade ${esc(evName)}: show the study details">${badge}Coded study</button>`);
      } else {
        out.push(`<span class="lib-mark is-study is-static">${badge}Coded study<span class="sr-only">, evidence grade ${esc(evName)}</span></span>`);
      }
    }
    if (r.is_benchmark) {
      const b = BX.ready ? BX.byKey.get(r.key) : null;
      const g = b ? groupOf(b) : null;
      const label = g ? `${g.short}, Table ${g.table}` : 'Benchmark or resource';
      const key = `<span class="bx-key ${g ? g.cls : 'g-native'}" aria-hidden="true"></span>`;
      if (b) out.push(`<button type="button" class="lib-mark is-bench" data-lib-act="bench" data-key="${k}" aria-label="${esc(label)}: show it in the benchmark explorer">${key}${esc(label)}</button>`);
      else out.push(`<span class="lib-mark is-bench is-static">${key}${esc(label)}</span>`);
    }
    return out.length ? `<span class="lib-marks">${out.join('')}</span>` : '';
  }

  function actsHTML(r) {
    const out = [], who = esc(r.cite || r.key);
    if (r.doi) out.push(`<a class="lib-act" href="${esc(doiURL(r.doi))}" target="_blank" rel="noopener">DOI${icon('external')}<span class="sr-only"> of ${who} (opens in a new tab)</span></a>`);
    if (r.arxiv) out.push(`<a class="lib-act" href="${esc(arxivURL(r.arxiv))}" target="_blank" rel="noopener">arXiv${icon('external')}<span class="sr-only"> version of ${who} (opens in a new tab)</span></a>`);
    if (!r.doi && !r.arxiv && r.title) out.push(`<a class="lib-act" href="${esc(scholarURL(r.title))}" target="_blank" rel="noopener">Google Scholar${icon('external')}<span class="sr-only"> search for ${who} (opens in a new tab)</span></a>`);
    if (r.bibtex) out.push(`<button type="button" class="lib-act lib-bib" data-lib-act="bib" data-key="${esc(r.key)}" aria-label="Copy the BibTeX entry of ${who}">${icon('copy')}<span data-copy-label>BibTeX</span></button>`);
    return out.length ? `<span class="lib-acts">${out.join('')}</span>` : '';
  }

  /* ------------------------------------------------------------------ year histogram (D3 scales, SVG); drag to choose a range */
  /* one bar per year from 2016 (the review covers work since 2016), and one bar for the few earlier works, so that
     years far apart are not drawn as neighbors */
  const EARLY = 2016;
  function histBins() {
    const Y = LB.years, early = Y.filter(y => y < EARLY), bins = [];
    if (early.length > 1) bins.push({ years: early, early: true });
    Y.forEach(y => { if (!(early.length > 1 && y < EARLY)) bins.push({ years: [y] }); });
    return bins;
  }
  const binLabel = (b, full) => (b.early ? (full ? '<' + EARLY : '<’' + String(EARLY).slice(2)) : (full ? String(b.years[0]) : '’' + String(b.years[0]).slice(2)));
  const binName = b => (b.early ? `Before ${EARLY} (${b.years[0]}–${b.years[b.years.length - 1]})` : String(b.years[0]));
  const binOf = (bins, y) => { const i = bins.findIndex(b => b.years.indexOf(y) >= 0); return i < 0 ? 0 : i; };

  function drawHist() {
    const host = LB.dom && LB.dom.hist;
    if (!host) return;
    const d3 = window.d3;
    if (!d3 || typeof d3.scaleLinear !== 'function') { host.hidden = true; return; }
    const W = Math.floor(host.clientWidth);
    if (!W) return;
    if (LB.brush) return;   // never replace the SVG while a drag is in progress
    const Y = LB.years, st = LB.st, bins = histBins(), n = bins.length;
    const counts = bins.map(() => 0);
    LB.list.forEach(r => { if (libPasses(r, 'year')) { const i = bins.findIndex(b => b.years.indexOf(r.year) >= 0); if (i >= 0) counts[i] += 1; } });
    const gapAfterEarly = bins[0] && bins[0].early ? 1 : 0;
    const GAP = 0.6, unit = W / (n + GAP * gapAfterEarly);
    const TOP = 4, BH = 44, BASE = TOP + BH, H = BASE + 20;
    const max = Math.max(1, d3.max(counts) || 1);
    const yS = d3.scaleLinear().domain([0, max]).range([0, BH]);
    const bw = Math.max(3, Math.min(unit * 0.72, 30));
    const cx = i => (i + (gapAfterEarly && i >= 1 ? GAP : 0)) * unit + unit / 2;
    const labelAll = unit >= 22, full = unit >= 36;
    const p = [];
    p.push(`<svg class="lib-hist-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="lib-hist-title">`);
    p.push(`<title id="lib-hist-title">References per year of publication that match the other filters, ${Y[0]} to ${Y[Y.length - 1]}${gapAfterEarly ? `; works before ${EARLY} share one bar` : ''}. The From and To menus set the same range.</title>`);
    p.push(`<rect class="lib-band" x="0" y="0" width="0" height="${BASE + 2}" rx="5"/>`);
    if (gapAfterEarly) p.push(`<line class="lib-base" x1="${(cx(0) - unit / 2 + 2).toFixed(1)}" x2="${(cx(0) + unit / 2 - 2).toFixed(1)}" y1="${BASE + 0.5}" y2="${BASE + 0.5}"/>`);
    p.push(`<line class="lib-base" x1="${(cx(gapAfterEarly) - unit / 2 + 2).toFixed(1)}" x2="${(cx(n - 1) + unit / 2 - 2).toFixed(1)}" y1="${BASE + 0.5}" y2="${BASE + 0.5}"/>`);
    bins.forEach((b, i) => {
      const c = counts[i], h = c ? Math.max(2, yS(c)) : 0;
      p.push(`<rect class="lib-bar${b.early ? ' is-early' : ''}" data-i="${i}" x="${(cx(i) - bw / 2).toFixed(1)}" y="${(BASE - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>`);
      if (labelAll || b.early || (n - 1 - i) % 2 === 0) {
        p.push(`<text class="lib-hyear" data-i="${i}" x="${cx(i).toFixed(1)}" y="${BASE + 15}" text-anchor="middle">${esc(binLabel(b, full))}</text>`);
      }
    });
    p.push(`<rect class="lib-hit" x="0" y="0" width="${W}" height="${H}"/>`);
    p.push('</svg>');
    host.hidden = false;
    host.innerHTML = p.join('');
    const svg = host.querySelector('svg');
    LB.hist = { svg: svg, cx: cx, unit: unit, n: n, counts: counts, base: BASE, bins: bins };
    paintHist(binOf(bins, st.from), binOf(bins, st.to));
    bindHist(svg);
  }

  function paintHist(lo, hi) {
    const H = LB.hist;
    if (!H || !H.svg) return;
    const n = H.n, isFull = lo <= 0 && hi >= n - 1;
    const band = H.svg.querySelector('.lib-band');
    if (band) {
      if (isFull) band.setAttribute('width', '0');
      else {
        band.setAttribute('x', (H.cx(lo) - H.unit / 2 + 1).toFixed(1));
        band.setAttribute('width', Math.max(0, H.cx(hi) - H.cx(lo) + H.unit - 2).toFixed(1));
      }
    }
    H.svg.querySelectorAll('[data-i]').forEach(node => {
      const i = Number(node.getAttribute('data-i'));
      node.classList.toggle('is-in', i >= lo && i <= hi);
      node.classList.toggle('is-strong', !isFull && i >= lo && i <= hi);
    });
  }

  function bindHist(svg) {
    const d3 = window.d3;
    const bins = () => LB.hist.bins;
    const idxAt = e => {
      const pt = d3.pointer(e, svg), H = LB.hist;
      let best = 0, bd = Infinity;
      for (let i = 0; i < H.n; i++) { const dd = Math.abs(H.cx(i) - pt[0]); if (dd < bd) { bd = dd; best = i; } }
      return best;
    };
    const current = () => [binOf(bins(), LB.st.from), binOf(bins(), LB.st.to)];
    /* the selected range is exactly bar i (all of its years) */
    const isExactly = i => { const b = bins()[i]; return LB.st.from === b.years[0] && LB.st.to === b.years[b.years.length - 1]; };
    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const i = idxAt(e), cur = current();
      let anchor = i;
      if (e.shiftKey) anchor = Math.abs(i - cur[0]) >= Math.abs(i - cur[1]) ? cur[0] : cur[1];
      LB.brush = { anchor: anchor, cur: i, moved: false, single: !e.shiftKey && isExactly(i) };
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
      U.tooltip.hide();
      paintHist(Math.min(anchor, i), Math.max(anchor, i));
      e.preventDefault();
    });
    svg.addEventListener('pointermove', e => {
      const b = LB.brush;
      if (b) {
        const i = idxAt(e);
        if (i !== b.cur) { b.cur = i; b.moved = true; paintHist(Math.min(b.anchor, i), Math.max(b.anchor, i)); }
        return;
      }
      if (e.pointerType !== 'mouse') return;
      const i = idxAt(e), c = LB.hist.counts[i] || 0;
      U.tooltip.show(`<b>${esc(binName(bins()[i]))}</b> ${plural(c, 'reference', 'references')}<span class="tt-sub">Select a bar to show one year; drag across bars for a range.</span>`, e);
    });
    const end = commit => {
      const b = LB.brush;
      LB.brush = null;
      if (!b) return;
      if (!commit) { const cur = current(); paintHist(cur[0], cur[1]); return; }
      const B = bins();
      let lo = Math.min(b.anchor, b.cur), hi = Math.max(b.anchor, b.cur);
      if (!b.moved && b.single) { lo = 0; hi = B.length - 1; }   // a second click on the only selected bar clears the range
      setYears(B[lo].years[0], B[hi].years[B[hi].years.length - 1]);
    };
    svg.addEventListener('pointerup', () => end(true));
    svg.addEventListener('pointercancel', () => end(false));
    svg.addEventListener('pointerleave', () => { if (!LB.brush) U.tooltip.hide(); });
  }

  /* ------------------------------------------------------------------ public: make #ref-<key> exist and return it */
  function reveal(key) {
    if (!LB.ready || !key) return null;
    const r = LB.byKey.get(key);
    if (!r) return null;
    if (!libPasses(r)) { resetLib(); renderLib(); }
    const st = LB.st;
    const group = LB.matched.filter(x => x._first === r._first);
    const limit = st.section ? LIMIT_ONE : LIMIT_ALL;
    if (group.indexOf(r) >= limit && !st.expanded.has(r._first)) {
      st.expanded.add(r._first);
      renderLibGroups();
    }
    return document.getElementById('ref-' + key);
  }
})();
