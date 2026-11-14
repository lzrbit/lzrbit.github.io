/* Continual Learning for Embodied AI: explorer module (explorer.js, loaded with defer before app.js).

   Registers CLEAI.modules.explorer. From CLEAI.data (data/site-data.js, schema in data/SCHEMA.md) it renders
   - #evidence-explorer: faceted explorer of the coded studies (facets with live counts, free-text search, sorting,
     two linked summary charts, result cards with paging and a reset); the view is mirrored in the URL hash
     (#evidence?axis=T&evidence=D,P&years=2023-2026&q=replay) and follows "explorer:filter" on CLEAI.bus;
   - the study drawer, opened by "study:open" {key} (appended to body; Esc closes it, Tab stays inside);
   - #formulation-explorer: an interactive diagram of the embodied learner (Section 2);
   - #mechanism-grid: the mechanism families of Table 4, each able to filter the explorer by its mechanism codes;
   - #fm-list: the coded studies whose learner builds on a pretrained foundation model, grouped by primary axis.
   Every part does nothing when its container is absent. Contract with the shell: ../../DESIGN.md.

   Filter keys accepted on "explorer:filter": the keys of data.facets (axis, evidence, mechanism, platform, signal,
   backbone, retest, domain) and, specific to this module, fm ("yes"/"no": foundation-model learner),
   code ("yes"/"unknown"), years ([from, to], "2023-2026" or a single year), search, sort and reset. */
(function () {
  'use strict';

  var NS = (window.CLEAI = window.CLEAI || { modules: {} });
  NS.modules = NS.modules || {};

  /* ================================================================== constants */
  const AXES = ['T', 'E', 'B', 'F'];
  const GRADES = ['D', 'P', 'A', 'NG'];
  const GRADE_RANK = { D: 0, P: 1, A: 2, NG: 3 };
  /* results per page: 24 one-line rows (list) or 12 cards */
  const pageSize = () => (DENSITY === 'list' ? 24 : 12);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const SORTS = [
    { id: 'year-desc', label: 'Year, newest first' },
    { id: 'year-asc', label: 'Year, oldest first' },
    { id: 'name', label: 'Name, A to Z' },
    { id: 'evidence', label: 'Evidence grade, D to not graded' }
  ];
  /* facet order in the panel; data.facets supplies field, multi, vocabulary and label */
  const FACET_ORDER = ['axis', 'evidence', 'retest', 'platform', 'signal', 'mechanism', 'backbone', 'fm', 'domain', 'code'];
  const EXTRA_FACETS = [
    { key: 'fm', field: 'fm_learner', bool: true, label: 'Foundation-model learner', labels: { yes: 'Yes', no: 'No' } },
    { key: 'code', field: 'code', label: 'Code released', labels: { yes: 'Yes', unknown: 'Unknown' } }
  ];
  /* shorter chip labels where the facet legend already says what the value is about */
  const CHIP_LABELS = { retest: { yes: 'Yes', partial: 'Partly', no: 'No', unknown: 'Unknown' } };
  /* vocab.task_id legend: "train/test: yes given, no withheld, lang identified by the instruction, n/a single task, unknown unreported" */
  const TASK_ID_WORDS = { yes: 'given', no: 'withheld', lang: 'identified by the instruction', unknown: 'unreported' };
  /* Table 4 legend: "Task ID at test: ✓ given; ◐ boundaries or conditioning only, or method-dependent; ✗ none" */
  const TASK_ID_AT_TEST = { given: ['✓', 'given'], partial: ['◐', 'boundaries or conditioning only, or method-dependent'], none: ['✗', 'none'] };
  const BACKBONE_SHORT = { scratch: 'Scratch', pretrained: 'Pretrained', VLA: 'VLA', VLM: 'VLM', LLM: 'LLM', diffusion: 'Diffusion', unknown: 'Unknown' };
  const BRANCH_COLOR = { slate: '--slate', sky: '--sky', teal: '--teal', amber: '--amber', coral: '--coral', violet: '--violet' };

  /* ================================================================== module state */
  let D = null, U = null;
  let ENTRIES = [];                 /* [{s, key, hay, sortName, vals: {facetKey: [values]}, pass: {}, ok}] */
  const BYKEY = new Map();
  const LIB = new Map();
  let FACETS = [];
  const FACET = {};
  let FILTER_KEYS = [];
  let YEARS = [];
  let ST = null;                    /* explorer state */
  let TERMS = [];                   /* folded search terms of ST.q */
  let RESULTS = [];                 /* matching entries, sorted */
  let EX = null;                    /* explorer elements (null when #evidence-explorer is absent) */
  let lastMainFocus = null;
  let DENSITY = 'list';             /* results as one-line rows ("list") or cards; a per-viewer preference */
  let PARTIAL_YEAR = null;          /* the year of the literature cut-off, drawn hatched in the per-year chart */

  /* ================================================================== helpers */
  const esc = s => U.esc(s);
  const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
  const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const cap1 = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  const studiesWord = n => (n === 1 ? 'study' : 'studies');
  const capHTML = html => String(html).replace(/^((?:\s|<[^>]+>)*)([a-z])/, (m, tags, ch) => tags + ch.toUpperCase());
  function vocab(name, v) {
    const x = ((D.vocab || {})[name] || {})[v];
    return x == null ? '' : typeof x === 'object' ? (x.label || '') : String(x);
  }
  const axisName = a => vocab('axis', a) || a;
  const gradeName = g => vocab('evidence', g) || g;
  const gradeOf = s => (GRADES.indexOf(s.evidence) >= 0 ? s.evidence : 'NG');
  function cmpSection(a, b) {
    const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d;
    }
    return 0;
  }
  const secTitle = id => { const s = U.section(id); return s ? s.title : ''; };
  function secColor(id) {
    const top = String(id || '').split('.')[0];
    const b = ((D.taxonomy && D.taxonomy.branches) || []).find(x => x.id === top);
    return b && BRANCH_COLOR[b.color] ? `var(${BRANCH_COLOR[b.color]})` : 'var(--rule-3)';
  }
  function joinAnd(list) {
    if (list.length < 2) return list.join('');
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }
  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach(k => { if (attrs[k] != null) el.setAttribute(k, String(attrs[k])); });
    if (parent) parent.appendChild(el);
    return el;
  }
  function safe(name, fn) {
    try { return fn(); } catch (err) { console.error('[CLEAI] explorer: ' + name + ' failed:', err); return undefined; }
  }
  const animateOK = () => !U.reducedMotion();
  const NEWTAB = '<span class="sr-only"> (opens in a new tab)</span>';
  const doiURL = doi => 'https://doi.org/' + encodeURI(doi);

  /* ================================================================== data */
  function valuesOf(s, f) {
    const v = s[f.field];
    if (f.bool) return [v ? 'yes' : 'no'];
    if (f.multi) return Array.isArray(v) ? v.map(String) : (v == null || v === '' ? [] : [String(v)]);
    return [v == null ? '' : String(v)];
  }
  function buildFacets() {
    const defs = (D.facets || []).filter(f => f && f.key && f.field).map(f => Object.assign({}, f));
    EXTRA_FACETS.forEach(x => { if (!defs.some(d => d.key === x.key)) defs.push(x); });
    const keys = FACET_ORDER.filter(k => defs.some(d => d.key === k))
      .concat(defs.map(d => d.key).filter(k => FACET_ORDER.indexOf(k) < 0));
    FACETS = [];
    keys.forEach(k => {
      const d = defs.find(x => x.key === k);
      const voc = (d.vocab && (D.vocab || {})[d.vocab]) || {};
      const f = { key: k, field: d.field, multi: !!d.multi, bool: !!d.bool, label: d.label || cap1(k), voc: voc, fixed: d.labels || null };
      const count = new Map();
      ENTRIES.forEach(e => valuesOf(e.s, f).forEach(v => count.set(v, (count.get(v) || 0) + 1)));
      const order = f.bool ? ['yes', 'no'] : f.fixed ? Object.keys(f.fixed) : Object.keys(voc);
      f.values = order.filter(v => count.has(v)).concat(Array.from(count.keys()).filter(v => order.indexOf(v) < 0).sort());
      if (!f.values.length) return;
      FACETS.push(f);
      FACET[k] = f;
    });
  }
  /* label of a facet value on a chip */
  function chipLabel(f, v) {
    if (f.fixed && f.fixed[v] != null) return f.fixed[v];
    if (CHIP_LABELS[f.key] && CHIP_LABELS[f.key][v] != null) return CHIP_LABELS[f.key][v];
    const x = f.voc[v];
    const t = x == null ? '' : typeof x === 'object' ? x.label : String(x);
    if (!t) return v === '' ? 'Other' : v;
    return f.key === 'mechanism' ? cap1(t) : t;
  }
  function prepData() {
    (D.library || []).forEach(r => LIB.set(r.key, r));
    ENTRIES = (D.studies || []).filter(s => s && s.key).map(s => {
      const e = { s: s, key: s.key, vals: {}, pass: {}, ok: true };
      e.sortName = fold(s.short_name || s.title || s.key);
      e.hay = fold([s.short_name, s.title, s.cite, s.benchmark_short, s.persistent_state].filter(Boolean).join('\n'));
      BYKEY.set(s.key, e);
      return e;
    });
    const ys = ENTRIES.map(e => e.s.year).filter(y => typeof y === 'number' && isFinite(y));
    YEARS = [];
    if (ys.length) for (let y = Math.min.apply(null, ys); y <= Math.max.apply(null, ys); y++) YEARS.push(y);
    const cut = /(\d{4})\s*$/.exec((D.grading && D.grading.literature_cutoff) || '');
    PARTIAL_YEAR = cut && YEARS.indexOf(Number(cut[1])) >= 0 ? Number(cut[1]) : null;
    buildFacets();
    ENTRIES.forEach(e => FACETS.forEach(f => { e.vals[f.key] = valuesOf(e.s, f); }));
    FILTER_KEYS = FACETS.map(f => f.key).concat(['years', 'search']);
  }
  const mechLabels = s => (s.mechanisms || []).map(c => vocab('mechanism', c) || c);

  /* ================================================================== explorer state, filtering, hash */
  function freshState() {
    const f = {};
    FACETS.forEach(x => { f[x.key] = new Set(); });
    return { f: f, years: null, q: '', sort: SORTS[0].id, shown: pageSize() };
  }
  function setFacetValue(key, value) {
    const f = FACET[key];
    if (!f) return;
    const set = ST.f[key];
    set.clear();
    [].concat(value == null ? [] : value).forEach(v => {
      if (typeof v === 'boolean' && f.bool) v = v ? 'yes' : 'no';
      v = String(v);
      if (f.values.indexOf(v) >= 0) set.add(v);
    });
  }
  function normYears(v) {
    if (v == null || v === '' || v === false || !YEARS.length) return null;
    let a, b;
    if (Array.isArray(v)) { a = Number(v[0]); b = Number(v.length > 1 ? v[1] : v[0]); }
    else if (typeof v === 'number') { a = b = v; }
    else {
      const m = /^\s*(\d{4})(?:\s*[-–:]\s*(\d{4}))?\s*$/.exec(String(v));
      if (!m) return null;
      a = Number(m[1]); b = Number(m[2] || m[1]);
    }
    if (!isFinite(a) || !isFinite(b)) return null;
    const lo = YEARS[0], hi = YEARS[YEARS.length - 1];
    if (a > b) { const t = a; a = b; b = t; }
    a = Math.max(lo, Math.min(hi, a));
    b = Math.max(lo, Math.min(hi, b));
    return a === lo && b === hi ? null : [a, b];
  }
  function sortEntries(list) {
    const byName = (a, b) => (a.sortName < b.sortName ? -1 : a.sortName > b.sortName ? 1 : 0);
    const s = ST.sort;
    return list.slice().sort((a, b) => {
      if (s === 'year-asc') return a.s.year - b.s.year || byName(a, b);
      if (s === 'name') return byName(a, b) || b.s.year - a.s.year;
      if (s === 'evidence') return GRADE_RANK[gradeOf(a.s)] - GRADE_RANK[gradeOf(b.s)] || b.s.year - a.s.year || byName(a, b);
      return b.s.year - a.s.year || byName(a, b);
    });
  }
  function evaluate() {
    TERMS = fold(ST.q).split(/\s+/).filter(Boolean);
    const yr = ST.years;
    ENTRIES.forEach(e => {
      const p = e.pass;
      FACETS.forEach(f => {
        const sel = ST.f[f.key];
        p[f.key] = !sel.size || e.vals[f.key].some(v => sel.has(v));
      });
      p.years = !yr || (e.s.year >= yr[0] && e.s.year <= yr[1]);
      p.search = !TERMS.length || TERMS.every(t => e.hay.indexOf(t) >= 0);
      e.ok = FILTER_KEYS.every(k => p[k]);
    });
    RESULTS = sortEntries(ENTRIES.filter(e => e.ok));
  }
  /* true when the entry passes every filter except those in skip (crossfilter counts) */
  function passBut(e, skip) {
    for (let i = 0; i < FILTER_KEYS.length; i++) {
      const k = FILTER_KEYS[i];
      if (skip.indexOf(k) < 0 && !e.pass[k]) return false;
    }
    return true;
  }
  function activeCount() {
    let n = 0;
    FACETS.forEach(f => { n += ST.f[f.key].size; });
    return n + (ST.years ? 1 : 0) + (ST.q.trim() ? 1 : 0);
  }

  const HASH_RE = /^#?evidence\?(.*)$/;
  function stateToHash() {
    const parts = [];
    FACETS.forEach(f => {
      const v = ST.f[f.key];
      if (v.size) parts.push(f.key + '=' + f.values.filter(x => v.has(x)).map(encodeURIComponent).join(','));
    });
    if (ST.years) parts.push('years=' + (ST.years[0] === ST.years[1] ? ST.years[0] : ST.years[0] + '-' + ST.years[1]));
    if (ST.q.trim()) parts.push('q=' + encodeURIComponent(ST.q.trim()));
    if (ST.sort !== SORTS[0].id) parts.push('sort=' + ST.sort);
    return 'evidence' + (parts.length ? '?' + parts.join('&') : '');
  }
  /* "#evidence?axis=T,E&q=replay" -> an explorer:filter detail with reset: true; null for any other hash */
  function readHash() {
    const m = HASH_RE.exec(location.hash || '');
    if (!m) return null;
    const dec = x => { try { return decodeURIComponent(x); } catch (err) { return x; } };
    const out = { reset: true, sort: SORTS[0].id };
    m[1].split('&').forEach(pair => {
      const i = pair.indexOf('=');
      if (i <= 0) return;
      const k = dec(pair.slice(0, i)), raw = pair.slice(i + 1);
      if (FACET[k]) out[k] = raw.split(',').map(dec).filter(Boolean);
      else if (k === 'years') out.years = dec(raw);
      else if (k === 'q' || k === 'search') out.search = dec(raw);
      else if (k === 'sort') out.sort = dec(raw);
    });
    return out;
  }
  let hashTimer = 0, hashLast = 0;
  /* mode "now": write at once; "soon" (a click): at once unless the last write was under 400 ms ago, else when the
     burst ends; "typing": once typing pauses. Safari allows 100 replaceState calls in 30 s.
     push: a jump from another section ("Studies" in the mechanism grid, a grade card) adds one history entry, so that
     Back returns there; later changes inside the explorer replace it. */
  function writeHash(mode, push) {
    clearTimeout(hashTimer);
    const go = () => {
      hashLast = Date.now();
      const h = '#' + stateToHash();
      if (location.hash === h) return;
      try {
        if (push) history.pushState(null, '', h);
        else history.replaceState(history.state, '', h);
      } catch (err) { /* history not writable here: the view is not mirrored */ }
    };
    if (mode === 'now' || (mode === 'soon' && Date.now() - hashLast > 400)) go();
    else hashTimer = setTimeout(go, 400);
  }

  /* ================================================================== explorer: skeleton and events */
  function explorerHTML() {
    const yearOpts = YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
    const facets = FACETS.map(f => {
      const chips = f.values.map(v => {
        const tint = f.key === 'axis' ? ' ax-' + esc(v) : f.key === 'evidence' ? ' ev-' + esc(v) : '';
        const dot = tint ? '<span class="chip-dot" aria-hidden="true"></span>' : '';
        return `<button type="button" class="chip${tint}" data-facet="${esc(f.key)}" data-value="${esc(v)}" aria-pressed="false">` +
          `${dot}<span>${esc(chipLabel(f, v))}</span> <span class="chip-n">0</span></button>`;
      }).join('');
      return `<fieldset class="facet evx-facet"><legend class="facet-label">${esc(f.label)}</legend><div class="facet-options">${chips}</div></fieldset>`;
    }).join('') + (YEARS.length > 1 ?
      `<fieldset class="facet evx-facet"><legend class="facet-label">Year of publication</legend>` +
        `<div class="evx-years">` +
          `<label class="field"><span class="field-label">From</span><select class="select" id="evx-y0">${yearOpts}</select></label>` +
          `<label class="field"><span class="field-label">To</span><select class="select" id="evx-y1">${yearOpts}</select></label>` +
        `</div></fieldset>` : '');
    const gLegend = GRADES.map(g => `<li class="legend-item"><span class="swatch evx-sw ev-${g}"></span>${esc(g)} ${esc(gradeName(g))}</li>`).join('');
    const aLegend = AXES.map(a => `<li class="legend-item"><span class="swatch evx-sw ax-${a}"></span>${esc(axisName(a))}</li>`).join('') +
      (PARTIAL_YEAR ? `<li class="legend-item"><span class="swatch evx-sw-hatch"></span>${PARTIAL_YEAR} partial</li>` : '');
    const cutoff = (D.grading && D.grading.literature_cutoff) || '';
    return `<div class="evx" id="evx">` +
      `<div class="evx-bar">` +
        `<label class="field evx-search"><span class="field-label">Search</span>` +
          `<span class="search">${U.icon('search')}<input class="input" type="search" id="evx-q" placeholder="Name, title, benchmark or persistent state" autocomplete="off" spellcheck="false" aria-describedby="evx-q-hint"></span></label>` +
        `<label class="field evx-sort"><span class="field-label">Sort by</span><select class="select" id="evx-sort">` +
          SORTS.map(o => `<option value="${o.id}">${esc(o.label)}</option>`).join('') + `</select></label>` +
        `<div class="field evx-density-field"><span class="field-label" id="evx-density-l">Results</span>` +
          `<div class="seg evx-density" role="group" aria-labelledby="evx-density-l">` +
            `<button type="button" data-density="list" aria-pressed="${DENSITY === 'list'}">List</button>` +
            `<button type="button" data-density="cards" aria-pressed="${DENSITY === 'cards'}">Cards</button>` +
          `</div></div>` +
        `<div class="evx-bar-actions">` +
          `<button type="button" class="btn btn-sm evx-ftoggle" id="evx-ftoggle" aria-expanded="false" aria-controls="evx-facets">${U.icon('filter')}<span>Filters<span class="evx-nsel"></span></span></button>` +
          `<button type="button" class="btn btn-sm" id="evx-link" aria-label="Copy a link to this view of the explorer">${U.icon('link')}<span>Copy link</span></button>` +
          `<button type="button" class="btn btn-sm" id="evx-reset" aria-label="Reset the search, filters and sorting">Reset</button>` +
        `</div>` +
      `</div>` +
      `<p class="sr-only" id="evx-q-hint">Searches the short names, titles, author labels, benchmarks and the coded persistent state of the studies.</p>` +
      `<div class="evx-status">` +
        `<p class="readout evx-readout" id="evx-readout" aria-live="polite" tabindex="-1"></p>` +
        `<ul class="evx-active" id="evx-active" aria-label="Active filters" hidden></ul>` +
      `</div>` +
      `<div class="evx-body">` +
        `<div class="evx-facets" id="evx-facets" role="group" aria-label="Filters">${facets}</div>` +
        `<div class="evx-main">` +
          `<div class="evx-charts" id="evx-charts">` +
            `<figure class="evx-chart"><figcaption class="evx-chart-cap" id="evx-gc-cap">Evidence grade by primary axis</figcaption>` +
              `<div class="chart evx-chart-mount" id="evx-gc"></div><ul class="legend evx-legend" aria-hidden="true">${gLegend}</ul></figure>` +
            `<figure class="evx-chart"><figcaption class="evx-chart-cap" id="evx-yc-cap">Studies per year of publication, by primary axis</figcaption>` +
              `<div class="chart evx-chart-mount" id="evx-yc"></div><ul class="legend evx-legend" aria-hidden="true">${aLegend}</ul></figure>` +
            `<p class="evx-chart-note" id="evx-chart-note">Both charts count the studies that match the other filters. Select a bar segment or a year to filter by it, and select it again to clear; Shift-select a year to extend the range.` +
              (PARTIAL_YEAR && cutoff ? ` ${PARTIAL_YEAR} is partial (literature cut-off ${esc(cutoff)}); its bar is hatched.` : '') + `</p>` +
          `</div>` +
          `<ol class="evx-results" id="evx-results" aria-label="Coded studies"></ol>` +
          `<div class="empty evx-empty" id="evx-empty" hidden><p>No studies match these filters.</p><button type="button" class="btn btn-sm" data-evx-reset>Reset the filters</button></div>` +
          `<button type="button" class="show-more" id="evx-more" hidden></button>` +
          `<p class="evx-legend-note">† preprint. Caveat codes as in the evidence tables of the review; hover over a code to read it. Select a study for all coded fields, its caveats spelled out, and the sections that cite it.</p>` +
        `</div>` +
      `</div>` +
    `</div>`;
  }

  function initExplorer() {
    const host = document.getElementById('evidence-explorer');
    if (!host || !ENTRIES.length || !FACETS.length) return;
    const savedDensity = U.store.get('evxDensity', 'list');
    DENSITY = savedDensity === 'cards' ? 'cards' : 'list';
    ST = freshState();
    host.replaceChildren();
    host.innerHTML = explorerHTML();
    const q = sel => host.querySelector(sel);
    EX = {
      host: host, root: q('#evx'), q: q('#evx-q'), sort: q('#evx-sort'), reset: q('#evx-reset'), link: q('#evx-link'),
      toggle: q('#evx-ftoggle'), nsel: q('.evx-nsel'), readout: q('#evx-readout'), active: q('#evx-active'),
      facets: q('#evx-facets'), y0: q('#evx-y0'), y1: q('#evx-y1'), results: q('#evx-results'), empty: q('#evx-empty'),
      more: q('#evx-more'), charts: q('#evx-charts'), gc: q('#evx-gc'), yc: q('#evx-yc'), density: q('.evx-density'), chips: []
    };
    EX.facetButtons = Array.prototype.slice.call(EX.facets.querySelectorAll('button[data-facet]'));
    /* list or cards: the same results, one line each or with their coded facts */
    EX.density.addEventListener('click', e => {
      const b = e.target.closest('button[data-density]');
      if (!b || b.dataset.density === DENSITY) return;
      DENSITY = b.dataset.density;
      U.store.set('evxDensity', DENSITY);
      EX.density.querySelectorAll('button[data-density]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      ST.shown = Math.max(ST.shown, pageSize());
      renderResults(false);
    });

    /* facet chips */
    EX.facets.addEventListener('click', e => {
      const b = e.target.closest('button[data-facet]');
      if (!b || !EX.facets.contains(b)) return;
      const on = b.getAttribute('aria-pressed') === 'true';
      if (!on && b.getAttribute('aria-disabled') === 'true') return;
      const set = ST.f[b.dataset.facet];
      if (!set) return;
      if (on) set.delete(b.dataset.value); else set.add(b.dataset.value);
      changed();
    });
    /* year range */
    const onYears = which => {
      let a = Number(EX.y0.value), b = Number(EX.y1.value);
      if (a > b) { if (which === 0) b = a; else a = b; }
      ST.years = normYears([a, b]);
      changed();
    };
    if (EX.y0) EX.y0.addEventListener('change', () => onYears(0));
    if (EX.y1) EX.y1.addEventListener('change', () => onYears(1));
    /* search, sort, reset, link, filters toggle */
    EX.qTimer = 0;
    EX.q.addEventListener('input', () => {
      clearTimeout(EX.qTimer);
      EX.qTimer = setTimeout(() => { if (ST.q !== EX.q.value) { ST.q = EX.q.value; changed({ typing: true }); } }, 160);
    });
    EX.q.addEventListener('keydown', e => {
      if (e.key === 'Enter') { clearTimeout(EX.qTimer); if (ST.q !== EX.q.value) { ST.q = EX.q.value; changed({ typing: true }); } }
    });
    EX.sort.addEventListener('change', () => { ST.sort = EX.sort.value; ST.shown = pageSize(); refresh({ animate: false, hash: true }); });
    const resetAll = () => { clearTimeout(EX.qTimer); ST = freshState(); changed({ hashNow: true }); };
    EX.reset.addEventListener('click', resetAll);
    EX.host.querySelector('[data-evx-reset]').addEventListener('click', () => { resetAll(); EX.readout.focus({ preventScroll: true }); });
    EX.link.addEventListener('click', () => {
      writeHash('now');
      const url = location.href.split('#')[0] + '#' + stateToHash();
      U.copy(url, 'Link to this view copied');
    });
    EX.toggle.addEventListener('click', () => {
      const open = !EX.root.classList.contains('is-facets-open');
      EX.root.classList.toggle('is-facets-open', open);
      EX.toggle.setAttribute('aria-expanded', String(open));
    });
    /* removable active-filter chips */
    EX.active.addEventListener('click', e => {
      const b = e.target.closest('button[data-rm]');
      if (!b) return;
      const i = Number(b.dataset.rm), c = EX.chips[i];
      if (!c) return;
      if (c.kind === 'facet') ST.f[c.key].delete(c.value);
      else if (c.kind === 'years') ST.years = null;
      else if (c.kind === 'search') ST.q = '';
      changed();
      const next = EX.active.querySelectorAll('button[data-rm]');
      if (next.length) next[Math.min(i, next.length - 1)].focus();
      else EX.readout.focus({ preventScroll: true });
    });
    /* results: details and paging */
    EX.results.addEventListener('click', e => {
      const b = e.target.closest('[data-open]');
      if (!b) return;
      openDrawer(b.dataset.open, b, RESULTS.map(x => x.key));
    });
    EX.more.addEventListener('click', () => {
      ST.shown += pageSize();
      renderResults(true);
    });

    /* initial view: from the URL hash if it holds one */
    const fromHash = readHash();
    if (fromHash) applyDetail(fromHash);
    refresh({ animate: false, hash: false });

    /* charts: D3 is optional; without it the facets do the same filtering */
    if (window.d3) {
      bindRove(EX.gc, GC, activateGrade, gradeTip);
      bindRove(EX.yc, YC, activateYear, yearTip);
      U.onResize(EX.gc, () => drawGradeChart(false));
      U.onResize(EX.yc, () => drawYearChart(false));
    } else {
      EX.charts.hidden = true;
    }

    U.on('explorer:filter', e => applyFilter(e && e.detail, { scroll: true, focus: true }));
    window.addEventListener('hashchange', () => {
      const d = readHash();
      if (d) applyFilter(d, { scroll: true, focus: false, fromHash: true });
    });
    if (fromHash) U.nextFrame(() => scrollToExplorer(false));
  }

  function applyDetail(d) {
    if (EX && (d.reset || has(d, 'search'))) clearTimeout(EX.qTimer);   /* a pending keystroke must not undo this */
    if (d.reset) {
      const sort = ST.sort;
      ST = freshState();
      ST.sort = sort;
    }
    FACETS.forEach(f => { if (has(d, f.key)) setFacetValue(f.key, d[f.key]); });
    if (has(d, 'years')) ST.years = normYears(d.years);
    if (has(d, 'search')) ST.q = String(d.search == null ? '' : d.search);
    if (has(d, 'sort') && SORTS.some(o => o.id === d.sort)) ST.sort = d.sort;
    ST.shown = pageSize();
  }
  /* public: apply an explorer:filter detail */
  function applyFilter(detail, opts) {
    if (!EX) return;
    opts = opts || {};
    applyDetail(detail || {});
    /* a jump from elsewhere on the page (bus event with scrolling) gets its own history entry */
    refresh({ animate: true, hash: !opts.fromHash, hashNow: true, push: !!opts.scroll && !opts.fromHash });
    if (opts.scroll) scrollToExplorer(!!opts.focus);
  }
  function scrollToExplorer(focus) {
    if (!EX) return;
    U.scrollToEl(EX.root, { block: 'start', focus: false });
    if (focus) EX.readout.focus({ preventScroll: true });
  }
  function changed(opts) {
    ST.shown = pageSize();
    refresh(Object.assign({ animate: true, hash: true }, opts || {}));
  }
  function refresh(o) {
    o = o || {};
    evaluate();
    renderFacetState();
    renderStatus();
    drawGradeChart(!!o.animate);
    drawYearChart(!!o.animate);
    renderResults(false);
    syncControls();
    if (o.hash) writeHash(o.hashNow ? 'now' : o.typing ? 'typing' : 'soon', !!o.push);
  }
  function syncControls() {
    if (document.activeElement !== EX.q && EX.q.value !== ST.q) EX.q.value = ST.q;
    if (EX.sort.value !== ST.sort) EX.sort.value = ST.sort;
    if (EX.y0 && EX.y1 && YEARS.length) {
      EX.y0.value = String(ST.years ? ST.years[0] : YEARS[0]);
      EX.y1.value = String(ST.years ? ST.years[1] : YEARS[YEARS.length - 1]);
    }
  }

  /* ------------------------------------------------------------------ facets, readout, active filters */
  function renderFacetState() {
    const counts = {};
    FACETS.forEach(f => {
      const c = counts[f.key] = new Map();
      ENTRIES.forEach(e => {
        if (!passBut(e, [f.key])) return;
        e.vals[f.key].forEach(v => c.set(v, (c.get(v) || 0) + 1));
      });
    });
    EX.facetButtons.forEach(b => {
      const k = b.dataset.facet, v = b.dataset.value;
      const n = (counts[k] && counts[k].get(v)) || 0, on = ST.f[k].has(v);
      b.setAttribute('aria-pressed', String(on));
      const nEl = b.querySelector('.chip-n');
      if (nEl && nEl.textContent !== String(n)) nEl.textContent = String(n);
      if (!on && n === 0) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
    });
  }
  function renderStatus() {
    const n = RESULTS.length, N = ENTRIES.length;
    EX.readout.textContent = `Showing ${n} of ${N} ${studiesWord(N)}`;
    const chips = [];
    FACETS.forEach(f => f.values.forEach(v => {
      if (ST.f[f.key].has(v)) chips.push({ kind: 'facet', key: f.key, value: v, group: f.label, text: chipLabel(f, v) });
    }));
    if (ST.years) chips.push({ kind: 'years', group: 'Year', text: ST.years[0] === ST.years[1] ? String(ST.years[0]) : ST.years[0] + '–' + ST.years[1] });
    if (ST.q.trim()) chips.push({ kind: 'search', group: 'Search', text: '“' + ST.q.trim() + '”' });
    EX.chips = chips;
    EX.active.innerHTML = chips.map((c, i) =>
      `<li><button type="button" class="chip evx-active-chip" data-rm="${i}" aria-label="Remove the filter ${esc(c.group)}: ${esc(c.text)}">` +
      `<span class="evx-active-g">${esc(c.group)}:</span> <span class="evx-active-v">${esc(c.text)}</span>${U.icon('close')}</button></li>`).join('');
    EX.active.hidden = !chips.length;
    const k = activeCount();
    EX.nsel.textContent = k ? ` (${k})` : '';
  }

  /* ------------------------------------------------------------------ result cards */
  /* escape text and mark the search terms (accent- and case-insensitive) */
  function hl(text) {
    text = String(text == null ? '' : text);
    if (!TERMS.length || !text) return esc(text);
    let folded = '';
    const map = [];
    for (let i = 0; i < text.length; i++) {
      const f = fold(text[i]);
      for (let j = 0; j < f.length; j++) { folded += f[j]; map.push(i); }
    }
    const ranges = [];
    TERMS.forEach(t => {
      let from = 0, k;
      while (t && (k = folded.indexOf(t, from)) >= 0) {
        ranges.push([map[k], map[k + t.length - 1] + 1]);
        from = k + t.length;
      }
    });
    if (!ranges.length) return esc(text);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach(r => {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice());
    });
    let out = '', pos = 0;
    merged.forEach(r => {
      out += esc(text.slice(pos, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + '</mark>';
      pos = r[1];
    });
    return out + esc(text.slice(pos));
  }
  function platformBadges(s) {
    return (s.platform_tags || []).map(p => {
      const l = vocab('platform', p) || p;
      return `<span class="badge pl-${esc(p)}" data-tip="${esc(l)}">${esc(p)}<span class="sr-only"> (${esc(l)})</span></span>`;
    }).join(' ');
  }
  function caveatChips(s) {
    return (s.caveats || []).map(c => {
      const l = vocab('caveat', c);
      /* no tab stop: the meaning is in the visually hidden text and in the study drawer */
      return `<span class="badge cav-${esc(c)} evx-cav" data-tip="${esc(c + (l ? ': ' + l : ''))}">${esc(c)}` +
        (l ? `<span class="sr-only">: ${esc(l)}</span>` : '') + `</span>`;
    }).join(' ');
  }
  const normLabel = x => fold(x).replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
  /* short names that are only an author label ("Abe et al.", "Kalb & Beyerer") */
  const isAuthorLabel = s => !!s.short_name && normLabel(s.cite).indexOf(normLabel(s.short_name).replace(/\.$/, '')) === 0;
  /* "Short: Title", without repeating a short name that the title already starts with or that only names the authors */
  function titleHTML(s) {
    const short = s.short_name || '', title = s.title || '';
    const dag = s.preprint ? '<sup class="evx-dag" aria-hidden="true">†</sup><span class="sr-only"> (preprint)</span>' : '';
    if (!short || isAuthorLabel(s)) return `<span class="evx-ttl">${hl(title)}</span>${dag}`;
    const n = short.length;
    if (title.slice(0, n).toLowerCase() === short.toLowerCase() && (title.length === n || /[\s:,–—-]/.test(title.charAt(n)))) {
      return `<span class="evx-short">${hl(title.slice(0, n))}</span>${dag}<span class="evx-ttl">${hl(title.slice(n))}</span>`;
    }
    return `<span class="evx-short">${hl(short)}</span>${dag}: <span class="evx-ttl">${hl(title)}</span>`;
  }
  function fact(label, html, wide) {
    return `<div class="evx-fact${wide ? ' is-wide' : ''}"><dt>${esc(label)}</dt><dd>${html || '–'}</dd></div>`;
  }
  function cardHTML(e) {
    const s = e.s, key = esc(s.key), ev = gradeOf(s), ax = esc(s.primary_axis);
    const dom = vocab('domain', s.domain);
    const cav = caveatChips(s);
    const mech = mechLabels(s);
    const doi = s.doi
      ? `<a class="btn btn-sm btn-ghost evx-doi" href="${esc(doiURL(s.doi))}" target="_blank" rel="noopener">${U.icon('external')}DOI<span class="sr-only"> of ${esc(s.short_name)}</span>${NEWTAB}</a>`
      : '';
    return `<li class="evx-card ax-${ax}">` +
      `<div class="evx-card-top">` +
        `<span class="evx-grade"><span class="badge badge-lg ev-${ev}" aria-hidden="true">${ev}</span><span><span class="sr-only">Evidence grade: </span>${esc(gradeName(ev))}</span></span>` +
        `<span class="chip ax-${ax} evx-axchip"><span class="chip-dot" aria-hidden="true"></span><span class="sr-only">Primary axis: </span>${esc(axisName(s.primary_axis))}</span>` +
        (dom ? `<span class="evx-dom">${esc(dom)}</span>` : '') +
        `<span class="evx-year">${esc(s.year)}</span>` +
      `</div>` +
      `<h3 class="evx-card-title"><button type="button" class="evx-open" data-open="${key}" aria-haspopup="dialog">${titleHTML(s)}</button></h3>` +
      `<p class="evx-meta"><a class="cite" href="#ref-${key}" data-key="${key}">${hl(s.cite)}</a><span class="evx-sep" aria-hidden="true"> · </span>` +
        `<span class="sr-only">, </span><span>${esc(s.venue_short || s.venue || '')}</span></p>` +
      `<dl class="evx-facts">` +
        fact('Persistent state', hl(s.persistent_state), true) +
        fact('Benchmark or testbed', hl(s.benchmark_short)) +
        fact('Platform', platformBadges(s)) +
        fact('Mechanism', esc(cap1(mech.join(', ')))) +
      `</dl>` +
      `<div class="evx-card-foot">` +
        (cav ? `<p class="evx-cavs"><span class="evx-cavs-l">Caveats</span>${cav}</p>` : '<p class="evx-cavs evx-cavs-none">No caveat coded</p>') +
        `<span class="evx-acts">${doi}<button type="button" class="btn btn-sm" data-open="${key}" aria-haspopup="dialog" aria-label="Details of ${esc(s.short_name)}">${U.icon('info')}Details</button></span>` +
      `</div>` +
    `</li>`;
  }
  /* one line per study: grade, short name and title, primary axis, citation and venue, Details */
  function rowHTML(e) {
    const s = e.s, key = esc(s.key), ev = gradeOf(s), ax = esc(s.primary_axis);
    const venue = s.venue_short || '';
    return `<li class="evx-li ax-${ax}">` +
      `<span class="badge badge-lg ev-${ev} evx-li-grade" aria-hidden="true">${ev}</span>` +
      `<div class="evx-li-main">` +
        `<p class="evx-li-title"><span class="sr-only">Evidence grade ${esc(gradeName(ev))}: </span>` +
          `<button type="button" class="evx-open" data-open="${key}" aria-haspopup="dialog">${titleHTML(s)}</button></p>` +
        `<p class="evx-li-meta"><span class="evx-li-ax"><span class="chip-dot" aria-hidden="true"></span><span class="sr-only">Primary axis: </span>${esc(axisName(s.primary_axis))}</span>` +
          `<span class="evx-sep" aria-hidden="true"> · </span><a class="cite" href="#ref-${key}" data-key="${key}">${hl(s.cite)}</a>` +
          (venue ? `<span class="evx-sep" aria-hidden="true"> · </span><span>${esc(venue)}</span>` : '') + `</p>` +
      `</div>` +
      `<button type="button" class="btn btn-sm evx-li-btn" data-open="${key}" aria-haspopup="dialog" aria-label="Details of ${esc(s.short_name)}">Details</button>` +
    `</li>`;
  }
  function renderResults(append) {
    const total = RESULTS.length;
    const shown = Math.min(ST.shown, total);
    const R = EX.results, item = DENSITY === 'list' ? rowHTML : cardHTML;
    R.classList.toggle('is-list', DENSITY === 'list');
    if (append) {
      const from = R.children.length;
      R.insertAdjacentHTML('beforeend', RESULTS.slice(from, shown).map(item).join(''));
      const first = R.children[from], b = first && first.querySelector('.evx-open');
      if (b) b.focus();
    } else {
      R.innerHTML = RESULTS.slice(0, shown).map(item).join('');
    }
    R.hidden = total === 0;
    EX.empty.hidden = total > 0;
    const rest = total - shown;
    EX.more.hidden = rest <= 0;
    if (rest > 0) {
      const k = Math.min(pageSize(), rest);
      EX.more.innerHTML = `Show ${k} more` + (rest > k ? ` <span class="evx-more-n">(${rest} not yet shown)</span>` : '') + U.icon('chev-down');
    }
  }

  /* ================================================================== linked summary charts (D3) */
  const GC = { marks: [], focus: null, hover: null, kind: 'grade' };
  const YC = { marks: [], focus: null, hover: null, kind: 'year' };
  /* a short transition only in response to a reader's action, never under reduced motion; otherwise set at once
     (interrupting a transition still running, so that it cannot overwrite the new values) */
  const tx = (sel, animate) => (animate && animateOK() ? sel.transition().duration(180).ease(window.d3.easeCubicOut) : sel.interrupt());
  /* a persistent <g> layer of the chart, found by all of its classes */
  function layerOf(svg, name) {
    let g = svg.select('g.' + name.trim().split(/\s+/).join('.'));
    if (g.empty()) g = svg.append('g').attr('class', name);
    return g;
  }

  function ensureSvg(el, capId) {
    const d3 = window.d3;
    let svg = d3.select(el).select('svg.evx-svg');
    if (svg.empty()) {
      svg = d3.select(el).append('svg').attr('class', 'evx-svg').attr('role', 'group')
        .attr('aria-labelledby', capId).attr('aria-describedby', 'evx-chart-note');
    }
    return svg;
  }
  function drawGradeChart(animate) {
    const d3 = window.d3, el = EX && EX.gc;
    if (!d3 || !el || EX.charts.hidden) return;
    const W = el.clientWidth;
    if (!W) return;
    const base = ENTRIES.filter(e => passBut(e, ['axis', 'evidence']));
    const selA = ST.f.axis || new Set(), selG = ST.f.evidence || new Set();
    const rows = AXES.map(a => {
      let x0 = 0;
      const segs = GRADES.map(g => {
        let n = 0;
        base.forEach(e => { if (e.s.primary_axis === a && gradeOf(e.s) === g) n++; });
        const seg = { id: a + '-' + g, axis: a, grade: g, n: n, x0: x0 };
        x0 += n;
        return seg;
      });
      return { axis: a, total: x0, segs: segs };
    });
    const narrow = W < 380;
    const M = { l: narrow ? 92 : 104, r: 30, t: 2, b: 22 }, rowH = 26, gap = 10;
    const H = M.t + rows.length * rowH + (rows.length - 1) * gap + M.b;
    const max = Math.max(1, d3.max(rows, r => r.total));
    const x = d3.scaleLinear().domain([0, max]).nice(4).range([M.l, W - M.r]);
    const ticks = x.ticks(narrow ? 3 : 5).filter(t => Number.isInteger(t));
    const svg = ensureSvg(el, 'evx-gc-cap').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H);
    const layer = name => layerOf(svg, name);
    layer('grid').selectAll('line').data(ticks).join('line')
      .attr('x1', d => x(d)).attr('x2', d => x(d)).attr('y1', M.t).attr('y2', H - M.b + 3);
    layer('axis evx-xaxis').selectAll('text').data(ticks).join('text')
      .attr('x', d => x(d)).attr('y', H - 5).attr('text-anchor', 'middle').text(d => d);
    const row = layer('evx-rows').selectAll('g.evx-row').data(rows, d => d.axis).join(enter => {
      const g = enter.append('g').attr('class', d => 'evx-row ax-' + d.axis);
      g.append('rect').attr('class', 'evx-row-key').attr('width', 10).attr('height', 10).attr('rx', 2.5);
      g.append('text').attr('class', 'evx-row-label label-strong');
      g.append('g').attr('class', 'evx-segs');
      g.append('text').attr('class', 'evx-row-total');
      return g;
    });
    row.attr('transform', (d, i) => `translate(0,${M.t + i * (rowH + gap)})`);
    row.select('.evx-row-key').attr('x', 0).attr('y', rowH / 2 - 5);
    row.select('.evx-row-label').attr('x', 15).attr('y', rowH / 2).attr('dy', '0.35em').text(d => axisName(d.axis));
    tx(row.select('.evx-row-total'), animate).attr('x', d => x(d.total) + 6).attr('y', rowH / 2).attr('dy', '0.35em');
    row.select('.evx-row-total').text(d => d.total);
    const seg = row.select('g.evx-segs').selectAll('g.evx-seg').data(d => d.segs.filter(s => s.n > 0), s => s.id).join(enter => {
      const g = enter.append('g').attr('class', s => 'evx-seg ev-' + s.grade).attr('role', 'button').attr('tabindex', -1)
        .attr('data-id', s => s.id);
      g.append('rect').attr('class', 'evx-seg-ring').attr('rx', 5);
      g.append('rect').attr('class', 'evx-seg-r').attr('y', 0).attr('height', rowH).attr('rx', 3)
        .attr('x', s => x(s.x0)).attr('width', 0);
      g.append('text').attr('class', 'evx-seg-n').attr('y', rowH / 2).attr('dy', '0.35em');
      return g;
    }).order();
    seg.classed('is-off', s => (selA.size > 0 && !selA.has(s.axis)) || (selG.size > 0 && !selG.has(s.grade)))
      .attr('aria-pressed', s => String(selA.has(s.axis) && selG.has(s.grade)))
      .attr('aria-label', s => `${axisName(s.axis)}, ${gradeName(s.grade)}: ${s.n} ${studiesWord(s.n)}`);
    const segW = s => Math.max(1, x(s.x0 + s.n) - x(s.x0) - 1.5);
    tx(seg.select('rect.evx-seg-r'), animate).attr('x', s => x(s.x0)).attr('width', segW);
    /* focus ring outside the segment, so that it shows against any fill (the D fill is the focus color) */
    seg.select('rect.evx-seg-ring').attr('x', s => x(s.x0) - 3).attr('y', -3).attr('width', s => segW(s) + 6).attr('height', rowH + 6);
    tx(seg.select('text'), animate).attr('x', s => x(s.x0) + segW(s) / 2);
    seg.select('text').text(s => (segW(s) >= 18 ? s.n : ''));
    GC.marks = seg.nodes();
    syncTabStops(GC);
  }
  function drawYearChart(animate) {
    const d3 = window.d3, el = EX && EX.yc;
    if (!d3 || !el || EX.charts.hidden || !YEARS.length) return;
    const W = el.clientWidth;
    if (!W) return;
    const base = ENTRIES.filter(e => passBut(e, ['years']));
    const data = YEARS.map(y => {
      let y0 = 0;
      const segs = AXES.map(a => {
        let n = 0;
        base.forEach(e => { if (e.s.year === y && e.s.primary_axis === a) n++; });
        const s = { id: y + '-' + a, year: y, axis: a, n: n, y0: y0 };
        y0 += n;
        return s;
      });
      return { id: String(y), year: y, total: y0, segs: segs };
    });
    const M = { l: 26, r: 2, t: 16, b: 22 }, H = 178;
    const x = d3.scaleBand().domain(YEARS).range([M.l, W - M.r]).paddingInner(0.22).paddingOuter(0.08);
    const max = Math.max(1, d3.max(data, d => d.total));
    const y = d3.scaleLinear().domain([0, max]).nice(4).range([H - M.b, M.t]);
    const ticks = y.ticks(4).filter(t => Number.isInteger(t));
    const bw = x.bandwidth();
    const yr = ST.years;
    const svg = ensureSvg(el, 'evx-yc-cap').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H);
    /* the partial year (literature cut-off) is hatched, with the pattern of Figure 1a */
    if (PARTIAL_YEAR && svg.select('#evx-hatch').empty()) {
      svg.insert('defs', ':first-child').append('pattern').attr('id', 'evx-hatch').attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 5).attr('height', 5).attr('patternTransform', 'rotate(45)')
        .append('rect').attr('x', 0).attr('y', 0).attr('width', 2.2).attr('height', 5).attr('fill', '#fff');
    }
    const layer = name => layerOf(svg, name);
    const grid = layer('grid');
    grid.selectAll('line').data(ticks).join('line').attr('x1', M.l).attr('x2', W - M.r).attr('y1', d => y(d)).attr('y2', d => y(d));
    layer('axis evx-yaxis').selectAll('text').data(ticks).join('text')
      .attr('x', M.l - 6).attr('y', d => y(d)).attr('dy', '0.35em').attr('text-anchor', 'end').text(d => d);
    const label = yy => (bw >= 30 ? String(yy) : '’' + String(yy).slice(2));
    const every = bw >= 17 ? 1 : 2;
    layer('axis evx-xaxis').selectAll('text').data(YEARS).join('text')
      .attr('x', d => x(d) + bw / 2).attr('y', H - 5).attr('text-anchor', 'middle')
      .text((d, i) => ((YEARS.length - 1 - i) % every === 0 ? label(d) : ''));
    const col = layer('evx-cols').selectAll('g.evx-col').data(data, d => d.id).join(enter => {
      const g = enter.append('g').attr('class', 'evx-col').attr('role', 'button').attr('tabindex', -1).attr('data-id', d => d.id);
      g.append('rect').attr('class', 'evx-hit').attr('rx', 4);
      g.append('g').attr('class', 'evx-stack');
      g.append('rect').attr('class', 'evx-hatch').attr('fill', 'url(#evx-hatch)');
      g.append('text').attr('class', 'evx-col-n').attr('text-anchor', 'middle');
      return g;
    }).order();
    const inRange = d => !yr || (d.year >= yr[0] && d.year <= yr[1]);
    col.classed('is-off', d => !inRange(d))
      .attr('aria-pressed', d => String(!!yr && inRange(d)))
      .attr('aria-label', d => `${d.year}${d.year === PARTIAL_YEAR ? ' (partial year)' : ''}: ${d.total} ${studiesWord(d.total)}`);
    col.select('.evx-hit').attr('x', d => x(d.year) - 2).attr('width', bw + 4).attr('y', M.t - 14).attr('height', H - M.b - M.t + 16);
    const stack = col.select('g.evx-stack').selectAll('rect').data(d => d.segs, s => s.id).join(enter =>
      enter.append('rect').attr('class', s => 'evx-yseg ax-' + s.axis).attr('y', H - M.b).attr('height', 0));
    tx(stack, animate)
      .attr('x', s => x(s.year)).attr('width', bw)
      .attr('y', s => y(s.y0 + s.n)).attr('height', s => Math.max(0, y(s.y0) - y(s.y0 + s.n) - (s.n ? 1 : 0)));
    col.select('.evx-hatch').attr('display', d => (d.year === PARTIAL_YEAR && d.total ? null : 'none'));
    tx(col.select('.evx-hatch'), animate).attr('x', d => x(d.year)).attr('width', bw)
      .attr('y', d => y(d.total)).attr('height', d => Math.max(0, y(0) - y(d.total) - (d.total ? 1 : 0)));
    tx(col.select('.evx-col-n'), animate).attr('x', d => x(d.year) + bw / 2).attr('y', d => y(d.total) - 4);
    col.select('.evx-col-n').text(d => (d.total && bw >= 14 ? d.total : ''));
    YC.marks = col.nodes();
    syncTabStops(YC);
  }

  /* one tab stop per chart; the arrow keys move between marks, Enter or Space selects (Shift extends a year range) */
  function syncTabStops(C) {
    if (!C.marks.length) return;
    let cur = C.marks.find(m => m.getAttribute('data-id') === C.focus);
    if (!cur) cur = C.marks[0];
    C.marks.forEach(m => m.setAttribute('tabindex', m === cur ? '0' : '-1'));
  }
  function bindRove(el, C, activate, tip) {
    const markOf = t => (t && t.closest ? t.closest('[data-id]') : null);
    el.addEventListener('keydown', e => {
      const m = markOf(e.target);
      if (!m) return;
      const marks = C.marks, i = marks.indexOf(m);
      if (i < 0) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        activate(m.__data__, e);
        afterActivate(C, m, tip);
        return;
      }
      let j = -1;
      if (C.kind === 'grade' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        const d = m.__data__, step = e.key === 'ArrowDown' ? 1 : -1;
        for (let r = AXES.indexOf(d.axis) + step; r >= 0 && r < AXES.length; r += step) {
          const rowMarks = marks.filter(x => x.__data__.axis === AXES[r]);
          if (rowMarks.length) { j = marks.indexOf(rowMarks.find(x => x.__data__.grade === d.grade) || rowMarks[0]); break; }
        }
        if (j < 0) j = i;
      }
      else if (e.key === 'ArrowRight' || (C.kind === 'year' && e.key === 'ArrowUp')) j = Math.min(marks.length - 1, i + 1);
      else if (e.key === 'ArrowLeft' || (C.kind === 'year' && e.key === 'ArrowDown')) j = Math.max(0, i - 1);
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = marks.length - 1;
      if (j < 0) return;
      e.preventDefault();
      const t = marks[j];
      C.focus = t.getAttribute('data-id');
      syncTabStops(C);
      t.focus();
    });
    el.addEventListener('click', e => {
      const m = markOf(e.target);
      if (!m || !el.contains(m)) return;
      C.focus = m.getAttribute('data-id');
      activate(m.__data__, e);
      afterActivate(C, m, tip, e);
    });
    el.addEventListener('focusin', e => {
      const m = markOf(e.target);
      if (!m) return;
      C.focus = m.getAttribute('data-id');
      syncTabStops(C);
      let keyboard = true;
      try { keyboard = m.matches(':focus-visible'); } catch (err) { /* selector not supported: treat as keyboard focus */ }
      if (keyboard) U.tooltip.show(tip(m.__data__), m);
    });
    el.addEventListener('focusout', () => { if (!C.hover) U.tooltip.hide(); });
    el.addEventListener('mousemove', e => {
      const m = markOf(e.target);
      if (m) {
        if (C.hover !== m) { C.hover = m; U.tooltip.show(tip(m.__data__), e); } else U.tooltip.move(e);
      } else if (C.hover) { C.hover = null; U.tooltip.hide(); }
    });
    el.addEventListener('mouseleave', () => { C.hover = null; U.tooltip.hide(); });
  }
  function afterActivate(C, m, tip, evt) {
    /* the chart was redrawn; keep focus and refresh the readout of the mark that stays under the pointer or focus */
    const again = C.marks.find(x => x.getAttribute('data-id') === C.focus);
    if (!again) { U.tooltip.hide(); return; }
    if (evt && evt.type === 'click') { U.tooltip.show(tip(again.__data__), evt); return; }
    if (document.activeElement !== again) again.focus();
    U.tooltip.show(tip(again.__data__), again);
  }
  function activateGrade(s) {
    const A = ST.f.axis, G = ST.f.evidence;
    if (!A || !G) return;
    const exact = A.size === 1 && A.has(s.axis) && G.size === 1 && G.has(s.grade);
    A.clear(); G.clear();
    if (!exact) { A.add(s.axis); G.add(s.grade); }
    changed();
  }
  function activateYear(d, evt) {
    const r = ST.years, y = d.year;
    if (evt && evt.shiftKey && r) ST.years = normYears([Math.min(r[0], y), Math.max(r[1], y)]);
    else if (r && r[0] === y && r[1] === y) ST.years = null;
    else ST.years = normYears([y, y]);
    changed();
  }
  function gradeTip(s) {
    const exact = ST.f.axis.size === 1 && ST.f.axis.has(s.axis) && ST.f.evidence.size === 1 && ST.f.evidence.has(s.grade);
    return `<b>${esc(axisName(s.axis))} · ${esc(gradeName(s.grade))}</b><span class="tt-sub">${s.n} ${studiesWord(s.n)}</span>` +
      `<span class="tt-sub">${exact ? 'Select again to clear this filter.' : 'Select to show only these studies.'}</span>`;
  }
  function yearTip(d) {
    const parts = d.segs.filter(s => s.n).map(s => `${axisName(s.axis)} ${s.n}`).join(' · ');
    const r = ST.years, only = r && r[0] === d.year && r[1] === d.year;
    return `<b>${d.year}</b>${d.year === PARTIAL_YEAR ? ' (partial year)' : ''}<span class="tt-sub">${d.total} ${studiesWord(d.total)}${parts ? ': ' + esc(parts) : ''}</span>` +
      `<span class="tt-sub">${only ? 'Select again to clear the year filter.' : 'Select to filter by this year; Shift-select to extend the range.'}</span>`;
  }

  /* ================================================================== study drawer */
  const DR = { el: null, open: false, key: null, list: null, opener: null, timer: 0 };
  function buildDrawer() {
    DR.backdrop = U.h('div', { class: 'drawer-backdrop sdr-backdrop', hidden: true });
    DR.el = U.h('aside', { class: 'drawer sdr', id: 'study-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sdr-title', hidden: true });
    DR.el.innerHTML =
      `<div class="drawer-head">` +
        `<div><p class="drawer-kicker" id="sdr-kicker"></p><h2 class="drawer-title" id="sdr-title"></h2></div>` +
        `<button type="button" class="btn btn-icon btn-sm btn-ghost" id="sdr-close" aria-label="Close the study details">${U.icon('close')}</button>` +
      `</div>` +
      `<div class="drawer-body" id="sdr-body"></div>` +
      `<div class="drawer-foot">` +
        `<div class="sdr-links" id="sdr-links"></div>` +
        `<div class="sdr-nav" id="sdr-nav">` +
          `<button type="button" class="btn btn-icon btn-sm" id="sdr-prev" aria-label="Previous study">${U.icon('chev-left')}</button>` +
          `<span class="readout sdr-pos" id="sdr-pos"></span>` +
          `<button type="button" class="btn btn-icon btn-sm" id="sdr-next" aria-label="Next study">${U.icon('chev-right')}</button>` +
        `</div>` +
      `</div>` +
      /* Previous and Next keep focus on the button: announce the study now shown */
      `<p class="sr-only" id="sdr-live" aria-live="polite"></p>`;
    document.body.appendChild(DR.backdrop);
    document.body.appendChild(DR.el);
    const q = sel => DR.el.querySelector(sel);
    DR.kicker = q('#sdr-kicker'); DR.title = q('#sdr-title'); DR.body = q('#sdr-body'); DR.links = q('#sdr-links');
    DR.close = q('#sdr-close'); DR.prev = q('#sdr-prev'); DR.next = q('#sdr-next'); DR.pos = q('#sdr-pos'); DR.nav = q('#sdr-nav');
    DR.live = q('#sdr-live');
    DR.close.addEventListener('click', () => closeDrawer(true));
    DR.backdrop.addEventListener('click', () => closeDrawer(true));
    DR.prev.addEventListener('click', () => stepDrawer(-1));
    DR.next.addEventListener('click', () => stepDrawer(1));
    DR.el.addEventListener('click', e => {
      const go = e.target.closest('[data-sdr-goto]');
      if (go) {
        e.preventDefault();
        const id = go.getAttribute('data-sdr-goto');
        closeDrawer(false);
        U.goToSection(id);
        return;
      }
      const act = e.target.closest('[data-sdr-act]');
      if (!act) return;
      const r = LIB.get(DR.key);
      if (act.dataset.sdrAct === 'bib' && r && r.bibtex) U.copy(r.bibtex, 'BibTeX copied');
      else if (act.dataset.sdrAct === 'lib') { const key = DR.key; closeDrawer(false); U.revealRef(key); }
    });
  }
  function drawerKeys(e) {
    if (!DR.open) return;
    const pop = document.getElementById('cite-pop'), popOpen = !!(pop && !pop.hidden);
    const lb = document.getElementById('lightbox'), lbOpen = !!(lb && !lb.hidden);
    if (e.key === 'Escape') {
      if (e.defaultPrevented || popOpen || lbOpen) return;
      e.preventDefault();
      closeDrawer(true);
      return;
    }
    if (lbOpen || (popOpen && pop.contains(document.activeElement))) return;
    U.modal.trap(DR.el, e);
  }
  function openDrawer(key, opener, list) {
    const e = BYKEY.get(key);
    if (!e) return;
    if (!DR.el) buildDrawer();
    DR.list = list && list.indexOf(key) >= 0 ? list.slice() : null;
    if (DR.live && !DR.open) DR.live.textContent = '';
    renderDrawer(key);
    if (DR.open) return;
    clearTimeout(DR.timer);
    DR.open = true;
    DR.opener = opener && opener.nodeType === 1 ? opener : document.activeElement;
    U.tooltip.hide();
    DR.el.hidden = false;
    DR.backdrop.hidden = false;
    void DR.el.offsetWidth;                         /* commit the closed position so the short slide runs */
    DR.el.classList.add('is-open');
    DR.backdrop.classList.add('is-open');
    U.modal.lock();
    document.addEventListener('keydown', drawerKeys, true);
    DR.close.focus({ preventScroll: true });
  }
  function closeDrawer(restore) {
    if (!DR.open) return;
    DR.open = false;
    DR.el.classList.remove('is-open');
    DR.backdrop.classList.remove('is-open');
    document.removeEventListener('keydown', drawerKeys, true);
    U.modal.unlock();
    U.tooltip.hide();
    const hide = () => { if (!DR.open) { DR.el.hidden = true; DR.backdrop.hidden = true; } };
    if (animateOK()) DR.timer = setTimeout(hide, 220); else hide();
    if (restore) returnFocus();
    DR.opener = null;
  }
  function returnFocus() {
    const ok = c => c && c.isConnected && c !== document.body && typeof c.focus === 'function' &&
      !DR.el.contains(c) && c.getClientRects().length > 0 && !c.closest('[hidden]');
    const target = [DR.opener, lastMainFocus].find(ok);
    if (target) target.focus({ preventScroll: true });
  }
  function stepDrawer(d) {
    if (!DR.list) return;
    const i = DR.list.indexOf(DR.key) + d;
    if (i < 0 || i >= DR.list.length) return;
    renderDrawer(DR.list[i]);
    const e = BYKEY.get(DR.list[i]);
    if (DR.live && e) DR.live.textContent = `Study ${i + 1} of ${DR.list.length}: ${e.s.short_name || e.s.title}`;
    const b = d < 0 ? DR.prev : DR.next;
    if (b.disabled) (d < 0 ? DR.next : DR.prev).focus(); else b.focus();
  }
  function renderDrawer(key) {
    const e = BYKEY.get(key);
    if (!e) return;
    const s = e.s, r = LIB.get(key) || {};
    DR.key = key;
    DR.kicker.textContent = 'Coded study · ' + s.cite;
    DR.title.innerHTML = esc(isAuthorLabel(s) ? s.title : s.short_name) +
      (s.preprint ? '<sup class="sdr-dag" aria-hidden="true">†</sup><span class="sr-only"> (preprint)</span>' : '');
    DR.body.innerHTML = drawerBodyHTML(s, r);
    DR.body.scrollTop = 0;
    DR.links.innerHTML = drawerLinksHTML(s, r);
    const L = DR.list, i = L ? L.indexOf(key) : -1;
    DR.nav.hidden = !L || L.length < 2;
    if (L) {
      DR.pos.textContent = `${i + 1} of ${L.length}`;
      DR.prev.disabled = i <= 0;
      DR.next.disabled = i >= L.length - 1;
    }
    U.enhance(DR.el);
  }
  function taskIdText(v) {
    if (!v) return '–';
    if (v === 'n/a') return 'Not applicable (single task)';
    if (v === 'unknown') return 'Unreported';
    const p = v.split('/');
    if (p.length !== 2) return v;
    return cap1(`${TASK_ID_WORDS[p[0]] || p[0]} in training, ${TASK_ID_WORDS[p[1]] || p[1]} at test`);
  }
  function drawerBodyHTML(s, r) {
    const ev = gradeOf(s);
    const G = D.grading || {};
    const lvl = (G.levels || []).find(l => l.code === ev);
    const authors = r.authors || [];
    const names = authors.length > 12 ? authors.slice(0, 10).join(', ') + ', et al.' : authors.join(', ');
    let gradeText = '';
    if (lvl && lvl.definition) {
      gradeText = lvl.definition.builder_text ? capHTML(U.rich(lvl.definition)) : `${U.rich(G.lead)} ${U.rich(lvl.definition)}`;
    }
    const covary = (s.covarying_axes || []).map(a => `<span class="badge ax-${esc(a)}">${esc(a)}</span> ${esc(axisName(a))}`).join(', ');
    const dom = (D.vocab && D.vocab.domain && D.vocab.domain[s.domain]) || null;
    const domIcon = dom && dom.icon ? U.iconSrc(dom.icon) : null;
    const mech = mechLabels(s);
    const mechCoded = (s.mechanisms || []).join('+');
    const cav = (s.caveats || []).map(c => `<li><span class="badge cav-${esc(c)}">${esc(c)}</span> ${esc(vocab('caveat', c))}</li>`).join('');
    const platforms = (s.platform_tags || []).map(p => vocab('platform', p) || p);
    const rows = [
      ['Primary axis', `<span class="chip ax-${esc(s.primary_axis)} sdr-chip"><span class="chip-dot" aria-hidden="true"></span>${esc(axisName(s.primary_axis))}</span>` +
        (covary ? `<span class="sdr-small">Co-varying: ${covary}</span>` : '') +
        (s.covarying_text ? `<span class="sdr-small">${esc(s.covarying_text)}</span>` : '')],
      ['Domain', dom ? (domIcon ? `<img class="sdr-dom-icon" src="${esc(domIcon)}" alt="" width="22" height="22" decoding="async">` : '') + esc(dom.label) : esc(s.domain || '–')],
      ['Learning signal', esc(vocab('learning_signal', s.learning_signal) || s.learning_signal || '–')],
      ['Mechanism', esc(cap1(mech.join(', ')) || '–') + (s.mechanism && s.mechanism !== mechCoded ? `<span class="sdr-small">Coded as: ${esc(s.mechanism)}</span>` : '')],
      ['Backbone', esc(vocab('backbone', s.backbone) || s.backbone || '–') +
        (s.fm_learner ? '<span class="sdr-small">The learner builds on a pretrained foundation model.</span>' : '')],
      ['Persistent state', esc(s.persistent_state || '–')],
      ['Task identity', esc(taskIdText(s.task_id))],
      ['Platform', platformBadges(s) + (platforms.length ? `<span class="sdr-small">${esc(joinAnd(platforms.map((p, i) => (i ? p.toLowerCase() : p))))}</span>` : '')],
      ['Earlier conditions re-tested', esc(CHIP_LABELS.retest[s.retention_tested] || s.retention_tested || '–')],
      ['Benchmark or testbed', esc(s.benchmark_short || '–')],
      ['Code', esc(s.code === 'yes' ? 'Released' : 'Unknown')],
      ['Caveats', cav ? `<ul class="sdr-cavs">${cav}</ul>` : 'None coded']
    ];
    const tables = (s.tables || []).slice().sort((a, b) => a - b);
    const others = tables.filter(t => t !== s.table);
    const tablesText = s.table
      ? `Table ${s.table}` + (others.length ? `; also ${others.length > 1 ? 'Tables' : 'Table'} ${joinAnd(others.map(String))}` : '')
      : (tables.length ? `${tables.length > 1 ? 'Tables' : 'Table'} ${joinAnd(tables.map(String))}` : '–');
    const secLink = id => (U.pageTarget(id)
      ? `<button type="button" class="btn-link sdr-filed" data-sdr-goto="${esc(id)}">Section ${esc(id)}, ${esc(secTitle(id))}</button>`
      : `Section ${esc(id)}, ${esc(secTitle(id))}`);
    const filed = s.section ? secLink(s.section) : '–';
    /* collective-learning prototypes: Figure 2 and Table 11 place them under feedback, while Sec. 1.3 files them with
       the outlook, where they are discussed in depth */
    const filedRows = s.discussed_in
      ? `<dt>Placed in Figure 2 under</dt><dd>${filed}</dd><dt>Discussed in depth in</dt><dd>${secLink(s.discussed_in)}</dd>`
      : `<dt>Filed in</dt><dd>${filed}</dd>`;
    const cited = (r.subsections || []).slice().sort(cmpSection).map(id => {
      const t = secTitle(id);
      const inner = `<span class="sdr-sec-n" style="--sc:${secColor(id)}">${esc(id)}</span><span class="sdr-sec-t">${esc(t || 'Section ' + id)}</span>`;
      return U.pageTarget(id)
        ? `<li><button type="button" class="sdr-sec" data-sdr-goto="${esc(id)}" aria-label="Go to Section ${esc(id)}${t ? ', ' + esc(t) : ''}">${inner}</button></li>`
        : `<li><span class="sdr-sec">${inner}</span></li>`;
    }).join('');
    return (isAuthorLabel(s) ? '' : `<p class="sdr-title">${esc(s.title)}</p>`) +
      (names ? `<p class="sdr-authors">${esc(names)}</p>` : '') +
      `<p class="sdr-venue">${esc(s.venue && String(s.venue).indexOf(String(s.year)) >= 0 ? s.venue : [s.venue, s.year].filter(Boolean).join(', '))}${s.preprint ? ' · preprint' : ''}</p>` +
      `<section class="sdr-grade ev-${ev}" aria-labelledby="sdr-grade-h">` +
        `<div class="sdr-grade-head"><span class="badge badge-lg ev-${ev}" aria-hidden="true">${ev}</span><h3 class="sdr-h" id="sdr-grade-h">Evidence grade: ${esc(gradeName(ev))}</h3></div>` +
        (gradeText ? `<p>${gradeText}</p>` : '') +
        (G.note ? `<p class="sdr-grade-note">${U.rich(G.note)}</p>` : '') +
      `</section>` +
      `<h3 class="sdr-h sdr-part">Coded fields</h3>` +
      `<dl class="kv sdr-kv">${rows.map(x => `<dt>${esc(x[0])}</dt><dd>${x[1]}</dd>`).join('')}</dl>` +
      `<h3 class="sdr-h sdr-part">In the review</h3>` +
      `<dl class="kv sdr-kv">${filedRows}<dt>Tables</dt><dd>${esc(tablesText)}</dd></dl>` +
      (cited ? `<p class="sdr-sub">Cited in these parts of the review; select one to go there.</p><ul class="sdr-cited">${cited}</ul>` : '');
  }
  function drawerLinksHTML(s, r) {
    const out = [];
    const doi = s.doi || r.doi;
    if (doi) out.push(`<a class="btn btn-sm" href="${esc(doiURL(doi))}" target="_blank" rel="noopener">${U.icon('external')}DOI${NEWTAB}</a>`);
    if (r.arxiv) out.push(`<a class="btn btn-sm" href="https://arxiv.org/abs/${esc(encodeURIComponent(r.arxiv))}" target="_blank" rel="noopener">${U.icon('external')}arXiv${NEWTAB}</a>`);
    if (r.bibtex) out.push(`<button type="button" class="btn btn-sm" data-sdr-act="bib">${U.icon('copy')}Copy BibTeX</button>`);
    if (r.key) out.push(`<button type="button" class="btn btn-sm" data-sdr-act="lib">${U.icon('books')}In the library</button>`);
    return out.join('');
  }

  /* ================================================================== formulation explorer (Section 2) */
  const FX = { host: null, diagram: null, svg: null, detail: null, sel: 'T', W: 0, profiles: {}, order: [], examples: [] };
  const FX_STATE_TITLE = { L: 'Embodied learner', C: 'Reusable competence', W: 'Revisable world state' };

  function initFormulation() {
    const host = document.getElementById('formulation-explorer');
    if (!host || !(D.axes || []).length || !D.formulation) return;
    FX.host = host;
    FX.order = AXES.filter(a => !!U.axis(a)).concat(['L', 'C', 'W']);
    host.replaceChildren();
    host.innerHTML =
      `<div class="frm">` +
        `<div class="frm-diagram chart" id="frm-diagram"></div>` +
        `<p class="frm-hint" id="frm-hint">Select a source of change, feedback, or a part of the learner’s persistent state to read how the review defines it; the arrow keys move between the parts.</p>` +
        `<div class="frm-detail" id="frm-detail"></div>` +
      `</div>`;
    FX.diagram = host.querySelector('#frm-diagram');
    FX.detail = host.querySelector('#frm-detail');
    U.onResize(FX.diagram, w => drawFormulation(w));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (FX.W) drawFormulation(FX.W); });
    FX.detail.addEventListener('click', e => {
      const o = e.target.closest('[data-open]');
      if (o) { openDrawer(o.dataset.open, o, FX.examples); return; }
      const f = e.target.closest('[data-frm-filter]');
      if (f) { U.emit('explorer:filter', { axis: f.dataset.frmFilter, reset: true }); return; }
      const g = e.target.closest('[data-frm-goto]');
      if (g) U.goToSection(g.dataset.frmGoto);
    });
    renderFxDetail();
  }

  function measure(t) {
    try { const w = t.getComputedTextLength(); if (w > 0) return w; } catch (err) { /* not rendered yet */ }
    return (t.textContent || '').length * 7.2;
  }
  /* greedy line breaking of an SVG text; returns the number of lines */
  function wrapText(parent, x, y, str, cls, maxW, lh, maxLines) {
    const t = svgEl('text', { x: x, y: y, class: cls }, parent);
    const words = String(str).split(/\s+/).filter(Boolean);
    let line = [], span = svgEl('tspan', { x: x, dy: 0 }, t), n = 1;
    words.forEach(w => {
      line.push(w);
      span.textContent = line.join(' ');
      if (line.length > 1 && measure(span) > maxW && (!maxLines || n < maxLines)) {
        line.pop();
        span.textContent = line.join(' ');
        line = [w];
        span = svgEl('tspan', { x: x, dy: lh }, t);
        span.textContent = w;
        n++;
      }
    });
    return n;
  }
  function fxNode(svg, id, box, rx, cls, label) {
    const g = svgEl('g', { class: 'frm-node ' + cls, 'data-node': id, role: 'radio', tabindex: '-1', 'aria-checked': 'false', 'aria-label': label }, svg);
    svgEl('rect', { class: 'frm-ring', x: box.x - 3.5, y: box.y - 3.5, width: box.w + 7, height: box.h + 7, rx: rx + 3 }, g);
    svgEl('rect', { class: 'frm-shape', x: box.x, y: box.y, width: box.w, height: box.h, rx: rx }, g);
    return g;
  }
  function fxBadge(g, x, y, size, letter) {
    svgEl('rect', { class: 'frm-badge', x: x, y: y, width: size, height: size, rx: 6 }, g);
    const t = svgEl('text', { class: 'frm-badge-t', x: x + size / 2, y: y + size / 2, dy: '0.35em' }, g);
    t.textContent = letter;
  }
  function fxNameSym(g, x, y, name, sym, cls) {
    const t = svgEl('text', { class: cls || 'frm-name', x: x, y: y }, g);
    t.appendChild(document.createTextNode(name));
    if (sym) {
      const s = svgEl('tspan', { class: 'frm-sym', dx: 5 }, t);
      s.textContent = sym;
    }
    return t;
  }
  function fxArrow(svg, d, cls, marker) {
    return svgEl('path', { d: d, class: 'frm-link ' + (cls || ''), 'marker-end': marker ? `url(#${marker})` : null }, svg);
  }
  function axisLabel(a) {
    const ax = U.axis(a) || {};
    return `${ax.name || axisName(a)}${ax.symbol ? ' (' + ax.symbol + ')' : ''}, ${ax.role || ''}`;
  }

  function drawFormulation(W) {
    if (!W || !FX.diagram) return;
    FX.W = W;
    const ae = document.activeElement;
    const focused = FX.svg && ae && FX.svg.contains(ae) && ae.getAttribute ? ae.getAttribute('data-node') : null;
    FX.diagram.replaceChildren();
    const svg = svgEl('svg', {
      class: 'frm-svg', role: 'radiogroup', 'aria-label': 'The embodied learner, its persistent state, the three sources of change and feedback',
      'aria-describedby': 'frm-hint', 'aria-controls': 'frm-detail'
    }, FX.diagram);
    FX.svg = svg;
    const defs = svgEl('defs', {}, svg);
    [['frm-arrow', 'frm-arrowhead'], ['frm-arrow-f', 'frm-arrowhead frm-arrowhead-f']].forEach(m => {
      const mk = svgEl('marker', { id: m[0], viewBox: '0 0 10 10', refX: 8.6, refY: 5, markerWidth: 10, markerHeight: 10, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
      svgEl('path', { d: 'M1,1.2 L9,5 L1,8.8 Z', class: m[1] }, mk);
    });
    const H = W >= 720 ? fxWide(svg, W) : fxNarrow(svg, W);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', H);
    syncFxNodes();
    svg.addEventListener('keydown', fxKeys);
    svg.addEventListener('click', e => {
      const n = e.target.closest('[data-node]');
      if (n) selectFx(n.getAttribute('data-node'), true);
    });
    if (focused) { const n = svg.querySelector(`[data-node="${focused}"]`); if (n) n.focus({ preventScroll: true }); }
  }
  const AX_SUB = a => { const ax = U.axis(a) || {}; return ax.role || ''; };

  function fxWide(svg, W) {
    const pad = 4, colW = Math.round(Math.min(250, Math.max(212, W * 0.27))), cardH = 62, gap = 12;
    const colH = 3 * cardH + 2 * gap;
    const three = ['T', 'E', 'B'].filter(a => FX.order.indexOf(a) >= 0);
    const mids = [];
    /* connectors first so that the nodes draw over them */
    const links = svgEl('g', { class: 'frm-links', 'aria-hidden': 'true' }, svg);
    const bx = pad + colW + 16, lx = pad + colW + 116;
    three.forEach((a, i) => mids.push(pad + i * (cardH + gap) + cardH / 2));
    three.forEach((a, i) => fxArrow(links, `M${pad + colW},${mids[i]} H${bx}`));
    if (mids.length) fxArrow(links, `M${bx},${mids[0]} V${mids[mids.length - 1]}`);
    const midY = pad + colH / 2;
    fxArrow(links, `M${bx},${midY} H${lx - 3}`, '', 'frm-arrow');
    const cond = svgEl('text', { class: 'frm-cond', x: (bx + lx) / 2, y: midY - 10 }, links);
    fxCondition(cond);
    /* axis cards */
    three.forEach((a, i) => {
      const box = { x: pad, y: pad + i * (cardH + gap), w: colW, h: cardH };
      const g = fxNode(svg, a, box, 12, 'ax-' + a, axisLabel(a));
      fxBadge(g, box.x + 12, box.y + (cardH - 24) / 2, 24, a);
      const ax = U.axis(a) || {};
      fxNameSym(g, box.x + 46, box.y + 27, ax.name || axisName(a), ax.symbol || '');
      svgEl('text', { class: 'frm-sub', x: box.x + 46, y: box.y + 45 }, g).textContent = AX_SUB(a);
    });
    /* learner with persistent state */
    const L = { x: lx, y: pad, w: W - pad - lx, h: colH };
    L.h = fxLearner(svg, L, true);
    /* feedback band */
    const fy = pad + Math.max(colH, L.h) + 42;
    const F = { x: pad, y: fy, w: W - 2 * pad, h: 58 };
    fxFeedback(svg, F, true);
    const ax = L.x + L.w / 2;
    fxArrow(links, `M${ax},${F.y} V${L.y + L.h + 3}`, 'frm-link-f', 'frm-arrow-f');
    svgEl('text', { class: 'frm-sub frm-sup-l', x: ax + 8, y: L.y + L.h + 24 }, links).textContent = 'supervision';
    return F.y + F.h + pad;
  }
  function fxNarrow(svg, W) {
    const pad = 4, gap = 8, cw = (W - 2 * pad - 2 * gap) / 3, ch = 70;
    const three = ['T', 'E', 'B'].filter(a => FX.order.indexOf(a) >= 0);
    const links = svgEl('g', { class: 'frm-links', 'aria-hidden': 'true' }, svg);
    const by = pad + ch + 12, ly = pad + ch + 50;
    three.forEach((a, i) => { const cx = pad + i * (cw + gap) + cw / 2; fxArrow(links, `M${cx},${pad + ch} V${by}`); });
    if (three.length) fxArrow(links, `M${pad + cw / 2},${by} H${pad + (three.length - 1) * (cw + gap) + cw / 2}`);
    fxArrow(links, `M${W / 2},${by} V${ly - 3}`, '', 'frm-arrow');
    const cond = svgEl('text', { class: 'frm-cond frm-cond-n', x: W / 2 + 12, y: (by + ly) / 2 + 5 }, links);
    fxCondition(cond);
    three.forEach((a, i) => {
      const box = { x: pad + i * (cw + gap), y: pad, w: cw, h: ch };
      const g = fxNode(svg, a, box, 10, 'ax-' + a, axisLabel(a));
      fxBadge(g, box.x + 9, box.y + 9, 22, a);
      const ax = U.axis(a) || {};
      if (ax.symbol) svgEl('text', { class: 'frm-sym', x: box.x + 38, y: box.y + 25 }, g).textContent = ax.symbol;
      svgEl('text', { class: 'frm-name frm-name-n', x: box.x + 9, y: box.y + 54 }, g).textContent = ax.name || axisName(a);
    });
    const L = { x: pad, y: ly, w: W - 2 * pad, h: 0 };
    L.h = fxLearner(svg, L, false);
    const F = { x: pad, y: L.y + L.h + 36, w: W - 2 * pad, h: 58 };
    fxFeedback(svg, F, false);
    fxArrow(links, `M${W / 2},${F.y} V${L.y + L.h + 3}`, 'frm-link-f', 'frm-arrow-f');
    svgEl('text', { class: 'frm-sub frm-sup-l', x: W / 2 + 8, y: L.y + L.h + 23 }, links).textContent = 'supervision';
    return F.y + F.h + pad;
  }
  function fxCondition(t) {
    /* c = (g, e, b): formulation.condition.symbol, letters in italics */
    const sym = ((D.formulation || {}).condition || {}).symbol || 'c = (g, e, b)';
    sym.split(/([A-Za-z])/).forEach(part => {
      if (!part) return;
      if (/^[A-Za-z]$/.test(part)) { const s = svgEl('tspan', { class: 'frm-it' }, t); s.textContent = part; }
      else t.appendChild(document.createTextNode(part));
    });
  }
  /* learner box with the reusable competence and revisable world state; returns its height */
  function fxLearner(svg, L, wide) {
    const R = (D.formulation && D.formulation.retention) || {};
    const terms = R.terms || [];
    const inner = 14, boxGap = 10;
    const bw = (L.w - 2 * inner - boxGap) / 2;
    const boxY = L.y + (wide ? 66 : 58);
    let boxH = wide ? L.h - (boxY - L.y) - inner : 0;
    /* measure the two boxes first in the narrow layout (their height follows the wrapped text) */
    const gL = fxNode(svg, 'L', { x: L.x, y: L.y, w: L.w, h: Math.max(L.h, 1) }, 16, 'n-L', 'Embodied learner and its persistent state');
    svgEl('text', { class: 'frm-title', x: L.x + inner + 2, y: L.y + 27 }, gL).textContent = FX_STATE_TITLE.L;
    svgEl('text', { class: 'frm-sub', x: L.x + inner + 2, y: L.y + (wide ? 51 : 46) }, gL).textContent = 'Persistent state';
    const parts = [
      { id: 'C', kind: 'competence', cls: 'n-C', x: L.x + inner },
      { id: 'W', kind: 'world state', cls: 'n-W', x: L.x + inner + bw + boxGap }
    ];
    const made = parts.map(p => {
      const g = fxNode(svg, p.id, { x: p.x, y: boxY, w: bw, h: 10 }, 10, p.cls, FX_STATE_TITLE[p.id]);
      const lines = wrapText(g, p.x + 12, boxY + 24, FX_STATE_TITLE[p.id], 'frm-box-t', bw - 24, 17, 2);
      let ty = boxY + 24 + (lines - 1) * 17 + 21;
      const tl = terms.filter(t => t.kind === p.kind);
      (wide ? tl : tl.slice(0, 1)).forEach(t => {
        const n = wrapText(g, p.x + 12, ty, cap1(t.term), 'frm-term frm-term-n', bw - 24, 15, 2);
        ty += n * 15 + 2;
        if (wide && t.definition) {
          const k = wrapText(g, p.x + 12, ty, cap1(t.definition), 'frm-term', bw - 24, 15, 3);
          ty += k * 15 + 7;
        }
      });
      return { g: g, need: ty - boxY + 4 };
    });
    if (!wide) boxH = Math.max(made[0].need, made[1].need);
    else boxH = Math.max(boxH, made[0].need, made[1].need);
    made.forEach(m => {
      m.g.querySelectorAll('rect').forEach(rect => {
        const isRing = rect.classList.contains('frm-ring');
        rect.setAttribute('height', boxH + (isRing ? 7 : 0));
      });
    });
    const h = Math.max(L.h, boxY - L.y + boxH + inner);
    gL.querySelectorAll('rect').forEach(rect => rect.setAttribute('height', h + (rect.classList.contains('frm-ring') ? 7 : 0)));
    return h;
  }
  function fxFeedback(svg, F, wide) {
    const ax = U.axis('F');
    if (!ax) return;
    const g = fxNode(svg, 'F', F, 12, 'ax-F', axisLabel('F'));
    fxBadge(g, F.x + 12, F.y + (F.h - 24) / 2, 24, 'F');
    svgEl('text', { class: 'frm-name', x: F.x + 46, y: F.y + 25 }, g).textContent = ax.name || 'Feedback';
    svgEl('text', { class: 'frm-sub', x: F.x + 46, y: F.y + 43 }, g).textContent = (ax.role || 'supervision') + ' that may accompany any change';
  }
  function syncFxNodes() {
    if (!FX.svg) return;
    FX.svg.querySelectorAll('[data-node]').forEach(n => {
      const on = n.getAttribute('data-node') === FX.sel;
      n.setAttribute('aria-checked', String(on));
      n.setAttribute('tabindex', on ? '0' : '-1');
      n.classList.toggle('is-sel', on);
    });
  }
  function fxKeys(e) {
    const n = e.target.closest ? e.target.closest('[data-node]') : null;
    if (!n) return;
    const i = FX.order.indexOf(n.getAttribute('data-node'));
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % FX.order.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + FX.order.length) % FX.order.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = FX.order.length - 1;
    else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); selectFx(n.getAttribute('data-node'), true); return; }
    if (j < 0) return;
    e.preventDefault();
    selectFx(FX.order[j], true);
  }
  function selectFx(id, focus) {
    if (FX.order.indexOf(id) < 0) return;
    const same = FX.sel === id;
    FX.sel = id;
    syncFxNodes();
    if (focus && FX.svg) { const n = FX.svg.querySelector(`[data-node="${id}"]`); if (n) n.focus({ preventScroll: true }); }
    if (!same) renderFxDetail();
  }
  function examplesFor(axis, max) {
    const list = ENTRIES.filter(e => e.s.primary_axis === axis).map(e => e.s).sort((a, b) =>
      cmpSection(a.section, b.section) || GRADE_RANK[gradeOf(a)] - GRADE_RANK[gradeOf(b)] || b.year - a.year ||
      (fold(a.short_name) < fold(b.short_name) ? -1 : 1));
    const bySec = new Map();
    list.forEach(s => { if (!bySec.has(s.section)) bySec.set(s.section, []); bySec.get(s.section).push(s); });
    const own = String((U.axis(axis) || {}).section || '');
    const isOwn = id => String(id).split('.')[0] === own ? 0 : 1;
    const queues = Array.from(bySec.entries()).sort((a, b) => isOwn(a[0]) - isOwn(b[0]) || cmpSection(a[0], b[0])).map(x => x[1]);
    const out = [];
    while (out.length < max && queues.some(q => q.length)) {
      queues.forEach(q => { if (q.length && out.length < max) out.push(q.shift()); });
    }
    return out;
  }
  /* card head: the axis letter (T, E, B, F) as in the diagram and the paper's tables, or a swatch for the learner's
     parts; no table icons (they mean domains, mechanisms or programs in the paper) */
  function fxHead(kicker, title, letter, cls) {
    return `<div class="frm-card-head">` +
      (letter ? `<span class="frm-card-badge ax-${esc(letter)}" aria-hidden="true">${esc(letter)}</span>` : `<span class="frm-swatch ${cls || ''}" aria-hidden="true"></span>`) +
      `<div><p class="card-kicker">${esc(kicker)}</p><h3 class="frm-card-title">${esc(title)}</h3></div></div>`;
  }
  function renderFxDetail() {
    const id = FX.sel, el = FX.detail;
    if (!el) return;
    FX.examples = [];
    if (AXES.indexOf(id) >= 0) {
      const ax = U.axis(id) || {};
      const F = D.formulation || {};
      const ex = examplesFor(id, 6);
      FX.examples = ex.map(s => s.key);
      const chips = ex.map(s => {
        const ev = gradeOf(s);
        return `<button type="button" class="chip frm-ex" data-open="${esc(s.key)}" aria-haspopup="dialog" aria-label="${esc(`${s.short_name}, ${s.cite}, evidence grade ${gradeName(ev)}: details`)}">` +
          `<span class="badge ev-${ev}" aria-hidden="true">${ev}</span>${esc(s.short_name)}<span class="frm-ex-y" aria-hidden="true">${esc(s.year)}</span></button>`;
      }).join('');
      el.innerHTML =
        `<div class="frm-card ax-${esc(id)}">` +
          fxHead(`${cap1(ax.role || '')} · Section ${ax.section || ''}`, ax.name || axisName(id), id) +
          `<p class="frm-def">${U.rich(ax.definition)}</p>` +
          ((id === 'E' || id === 'B') && F.boundary ? `<div class="frm-boundary"><p class="frm-label">Environment or embodiment (Section 2.2)</p><p>${U.rich(F.boundary)}</p></div>` : '') +
          `<div class="frm-cols">` +
            `<div class="frm-col"><p class="frm-label">Evidence grades of the coded studies with this primary axis</p><div class="frm-profile-host"></div></div>` +
            `<div class="frm-col"><p class="frm-label">Example studies, one per subsection where they are filed</p>` +
              `<div class="chip-row">${chips}</div>` +
              `<div class="frm-acts">` +
                (EX ? `<button type="button" class="btn btn-sm btn-primary" data-frm-filter="${esc(id)}" aria-label="Show the studies with primary axis ${esc(ax.name || id)} in the evidence explorer">${U.icon('filter')}Show these studies</button>` : '') +
                (ax.section && U.pageTarget(ax.section) ? `<button type="button" class="btn btn-sm" data-frm-goto="${esc(ax.section)}">${U.icon('arrow-right')}Section ${esc(ax.section)} on this page</button>` : '') +
              `</div>` +
            `</div>` +
          `</div>` +
        `</div>`;
      const host = el.querySelector('.frm-profile-host');
      if (host) fxProfile(id, host);
    } else {
      el.innerHTML = fxStateHTML(id);
    }
    U.enhance(el);
  }
  function fxStateHTML(id) {
    const F = D.formulation || {}, R = F.retention || {};
    if (id === 'L') {
      const c = F.condition || {};
      return `<div class="frm-card n-L">` + fxHead('Section 2.3', 'Persistent state', null, 'n-L') +
        `<p class="frm-def">${U.rich(F.persistent_state)}</p>` +
        (c.symbol ? `<p class="frm-cond-line">Condition <span class="frm-math">${esc(c.symbol)}</span>: goal <i>${esc(c.goal || 'g')}</i>, environment <i>${esc(c.environment || 'e')}</i>, embodiment <i>${esc(c.embodiment || 'b')}</i>.</p>` : '') +
        `</div>`;
    }
    const kind = id === 'C' ? 'competence' : 'world state';
    const terms = (R.terms || []).filter(t => t.kind === kind);
    const sec = U.section(R.section || '2.5');
    return `<div class="frm-card n-${id}">` + fxHead(`Section ${R.section || '2.5'}${sec ? ' · ' + sec.title : ''}`, FX_STATE_TITLE[id], null, 'n-' + id) +
      (terms.length ? `<dl class="frm-terms">${terms.map(t => `<dt>${esc(cap1(t.term))}</dt><dd>${esc(cap1(t.definition))}.</dd>`).join('')}</dl>` : '') +
      (R.paragraph ? `<p class="frm-para">${U.rich(R.paragraph)}</p>` : '') +
      `</div>`;
  }
  /* evidence profile of an axis: the charts module's evidenceProfile when present, else a compact bar */
  function fxProfile(axis, host) {
    let box = FX.profiles[axis];
    if (box) { host.appendChild(box); return; }
    box = document.createElement('div');
    box.className = 'frm-profile';
    FX.profiles[axis] = box;
    host.appendChild(box);
    const charts = NS.modules.charts;
    if (charts && typeof charts.evidenceProfile === 'function') {
      box.classList.add('mount', 'chart');
      box.setAttribute('data-axis', axis);
      U.nextFrame(() => {
        try { charts.evidenceProfile(box, axis); }
        catch (err) {
          console.error('[CLEAI] explorer: charts.evidenceProfile(' + axis + ') failed:', err);
          box.className = 'frm-profile';
          box.innerHTML = profileBarHTML(axis);
        }
      });
      return;
    }
    box.innerHTML = profileBarHTML(axis);
  }
  function profileBarHTML(axis) {
    const list = ENTRIES.filter(e => e.s.primary_axis === axis);
    const c = {};
    GRADES.forEach(g => { c[g] = list.filter(e => gradeOf(e.s) === g).length; });
    const n = list.length || 1, present = GRADES.filter(g => c[g]);
    const desc = present.map(g => `${gradeName(g)} ${c[g]}`).join(', ');
    return `<div class="frm-bar" role="img" aria-label="${esc(`Evidence grades of the ${list.length} ${studiesWord(list.length)} with primary axis ${axisName(axis)}: ${desc}`)}">` +
      present.map(g => `<span class="frm-seg ev-${g}" style="flex-grow:${c[g]}" data-tip="${esc(gradeName(g) + ': ' + c[g])}">${c[g] / n >= 0.07 ? c[g] : ''}</span>`).join('') +
      `</div>` +
      `<ul class="legend frm-legend" aria-hidden="true">${present.map(g => `<li class="legend-item"><span class="badge ev-${g}">${g}</span>${esc(gradeName(g))} ${c[g]}</li>`).join('')}</ul>` +
      `<p class="readout frm-n">${list.length} ${studiesWord(list.length)}</p>`;
  }

  /* ================================================================== mechanism families (Table 4) */
  function initMechanisms() {
    const host = document.getElementById('mechanism-grid');
    const M = D.mechanisms;
    if (!host || !M || !(M.families || []).length) return;
    const fams = M.families;
    host.replaceChildren();
    host.innerHTML = `<ul class="mech-grid" aria-label="Mechanism families">${fams.map((f, i) => `<li>${mechCardHTML(f, i)}</li>`).join('')}</ul>` +
      (M.legend ? `<p class="note mech-legend">Table ${esc(M.table || 4)}. ${U.rich(M.legend)}</p>` : '');
    host.addEventListener('click', e => {
      const b = e.target.closest('[data-mech]');
      if (b) {
        const f = fams[Number(b.dataset.mech)];
        if (f && (f.codes || []).length) U.emit('explorer:filter', { mechanism: f.codes.slice(), reset: true });
        return;
      }
      const o = e.target.closest('[data-open]');
      if (o) {
        const card = o.closest('[data-fam]'), f = card ? fams[Number(card.dataset.fam)] : null;
        const keys = f ? (f.embodied_exemplars || []).concat(f.general_exemplars || []).map(x => x.key).filter(k => BYKEY.has(k)) : null;
        openDrawer(o.dataset.open, o, keys);
      }
    });
  }
  function exemplarMarks(x) {
    const marks = (x.physical ? '‡' : '') + (x.preprint ? '†' : '');
    const sr = [x.physical ? 'physical robot' : '', x.preprint ? 'preprint' : ''].filter(Boolean).join(', ');
    return (marks ? `<sup class="mech-mark" aria-hidden="true">${marks}</sup>` : '') + (sr ? `<span class="sr-only"> (${sr})</span>` : '');
  }
  function exemplarLink(x) {
    return BYKEY.has(x.key)
      ? `<button type="button" class="mech-ex-name" data-open="${esc(x.key)}" aria-haspopup="dialog">${esc(x.name)}${exemplarMarks(x)}</button>`
      : `<a class="cite mech-ex-name" href="#ref-${esc(x.key)}" data-key="${esc(x.key)}">${esc(x.name)}</a>${exemplarMarks(x)}`;
  }
  function mechCardHTML(f, i) {
    const ic = U.iconSrc(f.icon);
    const tid = TASK_ID_AT_TEST[f.task_id] || ['', f.task_id || '–'];
    const codes = f.codes || [];
    const n = codes.length ? ENTRIES.filter(e => (e.s.mechanisms || []).some(c => codes.indexOf(c) >= 0)).length : 0;
    const codeNames = codes.map(c => vocab('mechanism', c) || c);
    const emb = (f.embodied_exemplars || []).map(x => {
      const st = BYKEY.get(x.key);
      const ps = st && st.s.persistent_state ? `<span class="mech-ps">${esc(st.s.persistent_state)}</span>` : '';
      return `<li>${exemplarLink(x)}${ps}</li>`;
    }).join('');
    const gen = (f.general_exemplars || []).map(exemplarLink).join(', ');
    let foot;
    if (codes.length && EX) {
      foot = `<button type="button" class="btn btn-sm mech-studies" data-mech="${i}" aria-label="${esc(`Show the ${n} coded ${studiesWord(n)} with the mechanism code${codes.length > 1 ? 's' : ''} ${codeNames.join(' or ')} in the evidence explorer`)}">` +
        `${U.icon('filter')}Studies <span class="chip-n">${n}</span></button>` +
        /* the explorer's mechanism labels, as words (the button's accessible name already lists them) */
        `<span class="mech-codes" aria-hidden="true">${esc(cap1(codeNames.join(', ')))}</span>`;
    } else if (!codes.length) {
      foot = `<p class="mech-nocode">The coded studies have no separate mechanism code for this family.</p>`;
    } else foot = '';
    return `<article class="mech-card" data-fam="${i}" aria-labelledby="mech-${i}-t">` +
      `<header class="mech-head">` +
        (ic ? `<img class="card-icon" src="${esc(ic)}" alt="" width="36" height="36" decoding="async">` : '') +
        `<div><p class="card-kicker">Section ${esc(f.subsection)}</p><h3 class="card-title" id="mech-${i}-t">${esc(f.family)}</h3></div>` +
      `</header>` +
      `<div class="mech-cost"><p class="mech-label">Relocated cost</p><p class="mech-cost-v">${esc(f.relocated_cost)}</p></div>` +
      `<dl class="mech-facts">` +
        `<dt>Addresses</dt><dd>${esc(f.addresses)}</dd>` +
        `<dt>Task identity at test</dt><dd><span class="mech-sym" aria-hidden="true">${tid[0]}</span> ${esc(tid[1])}</dd>` +
        `<dt>Memory / compute</dt><dd>${esc(String(f.mem_comp || '–').replace('/', ' / '))}</dd>` +
      `</dl>` +
      (emb ? `<div class="mech-ex"><p class="mech-label">Embodied exemplars and the state they keep</p><ul class="mech-ex-list">${emb}</ul></div>` : '') +
      (gen ? `<p class="mech-gen"><span class="mech-label">General exemplars</span> ${gen}</p>` : '') +
      (foot ? `<footer class="mech-foot">${foot}</footer>` : '') +
    `</article>`;
  }

  /* ================================================================== studies with foundation-model learners (Table 5 and the axis tables) */
  const FML = { order: [] };
  function initFmList() {
    const host = document.getElementById('fm-list');
    if (!host) return;
    const list = ENTRIES.filter(e => e.s.fm_learner).map(e => e.s);
    if (!list.length) return;
    const sortFn = (a, b) => cmpSection(a.section, b.section) || (fold(a.short_name) < fold(b.short_name) ? -1 : 1);
    const groups = AXES.map(a => ({ axis: a, items: list.filter(s => s.primary_axis === a).sort(sortFn) })).filter(g => g.items.length);
    FML.order = [].concat.apply([], groups.map(g => g.items.map(s => s.key)));
    host.replaceChildren();
    host.innerHTML =
      `<div class="fml">${groups.map(g =>
        `<section class="fml-group ax-${esc(g.axis)}" aria-labelledby="fml-${esc(g.axis)}-h">` +
          `<h4 class="fml-h" id="fml-${esc(g.axis)}-h"><span class="badge ax-${esc(g.axis)}" aria-hidden="true">${esc(g.axis)}</span>${esc(axisName(g.axis))}<span class="fml-h-sub">primary axis</span></h4>` +
          `<ul class="fml-items">${g.items.map(fmlItemHTML).join('')}</ul>` +
        `</section>`).join('')}</div>` +
      `<div class="fml-foot">` +
        `<p class="fml-legend">Grades <span class="badge ev-D">D</span> direct, <span class="badge ev-P">P</span> partial, <span class="badge ev-A">A</span> adjacent (Section 1.3); † preprint. Within each primary axis the studies follow the order of the subsections that discuss them; each names the table that lists it. Select a study for its details.</p>` +
        (EX ? `<button type="button" class="btn btn-sm" data-fml-filter>${U.icon('filter')}Show these studies in the explorer</button>` : '') +
      `</div>`;
    host.addEventListener('click', e => {
      const o = e.target.closest('[data-open]');
      if (o) { openDrawer(o.dataset.open, o, FML.order); return; }
      if (e.target.closest('[data-fml-filter]')) U.emit('explorer:filter', { fm: 'yes', reset: true });
    });
  }
  /* the table that lists the study: its evidence table, else the agents table (Table 6) or the tables citing it */
  function fmlTable(s) {
    if (s.table) return `Table ${s.table}`;
    const agents = D.foundation && D.foundation.agents_table;
    const t = (s.tables || []).slice().sort((a, b) => a - b);
    if (agents && t.indexOf(agents) >= 0) return `Table ${agents}`;
    return t.length ? `${t.length > 1 ? 'Tables' : 'Table'} ${joinAnd(t.map(String))}` : '';
  }
  function fmlItemHTML(s) {
    const ev = gradeOf(s);
    const bb = BACKBONE_SHORT[s.backbone] || s.backbone || '';
    const tab = fmlTable(s);
    const label = `${s.short_name}${s.preprint ? ' (preprint)' : ''}, ${s.cite}; backbone ${vocab('backbone', s.backbone) || s.backbone}; evidence grade ${gradeName(ev)}; Section ${s.section}${tab ? '; ' + tab : ''}. Details`;
    return `<li><button type="button" class="fml-item" data-open="${esc(s.key)}" aria-haspopup="dialog" aria-label="${esc(label)}">` +
      `<span class="badge ev-${ev}" aria-hidden="true">${ev}</span>` +
      `<span class="fml-main" aria-hidden="true"><span class="fml-name">${esc(s.short_name)}${s.preprint ? '<sup>†</sup>' : ''}</span>` +
        `<span class="fml-cite">${esc(s.cite)} · Section ${esc(s.section)}${tab ? ' · ' + esc(tab) : ''}</span></span>` +
      (bb ? `<span class="fml-bb" aria-hidden="true">${esc(bb)}</span>` : '') +
    `</button></li>`;
  }

  /* ================================================================== init */
  function init() {
    D = NS.data;
    U = NS.util;
    if (!D || !U || !Array.isArray(D.studies)) return;
    prepData();
    if (!ENTRIES.length) return;
    document.addEventListener('focusin', e => {
      const main = document.getElementById('main');
      if (main && e.target instanceof Element && main.contains(e.target)) lastMainFocus = e.target;
    });
    U.on('study:open', e => {
      const d = (e && e.detail) || {};
      if (!d.key || !BYKEY.has(d.key)) return;
      const list = RESULTS.some(x => x.key === d.key) ? RESULTS.map(x => x.key) : null;
      openDrawer(d.key, d.opener || null, list);
    });
    safe('evidence explorer', initExplorer);
    safe('formulation explorer', initFormulation);
    safe('mechanism grid', initMechanisms);
    safe('foundation-model list', initFmList);
  }

  NS.modules.explorer = {
    init: init,
    /* open the study drawer for a coded study */
    open: function (key, opener) { if (U && BYKEY.has(key)) openDrawer(key, opener || null, null); },
    /* apply an explorer:filter detail without scrolling */
    filter: function (detail) { if (EX) applyFilter(detail, { scroll: false }); },
    /* the current view as a URL hash, e.g. "evidence?axis=T" */
    hash: function () { return EX ? stateToHash() : null; }
  };
})();
