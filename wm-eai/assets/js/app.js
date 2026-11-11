/* World Models Across the Embodied Loop: interactive parts of the page (no build step).
   Data: window.WM_DATA from data/site-data.js, generated from the manuscript sources by
   Draft/process/website/build_site_data.py, which also writes the header, abstract, BibTeX and counts into index.html. */
(() => {
  'use strict';
  const D = window.WM_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n).toLocaleString('en-US');
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const word = n => (n >= 0 && n < WORDS.length ? WORDS[n] : fmt(n));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const NEWTAB = '<span class="sr-only"> (opens in a new tab)</span>';

  /* ---------------------------------------------------------------- scroll boxes: focusable only while they scroll */
  const scrollRegion = el => {
    if (el.scrollWidth > el.clientWidth + 1) {
      el.tabIndex = 0; el.setAttribute('role', 'region'); el.setAttribute('aria-label', el.dataset.scrollLabel);
    } else { el.removeAttribute('tabindex'); el.removeAttribute('role'); el.removeAttribute('aria-label'); }
  };
  const updateScrollRegions = () => $$('[data-scroll-label]').forEach(scrollRegion);
  let srT;
  addEventListener('resize', () => { clearTimeout(srT); srT = setTimeout(updateScrollRegions, 150); });
  window.WM = { $, $$, esc, fmt, word, updateScrollRegions };

  /* ---------------------------------------------------------------- toast and copy */
  const toastEl = $('#toast');
  let toastTimer;
  const toast = msg => { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2000); };
  const copy = (text, msg) => {
    const fallback = () => {
      const prev = document.activeElement, ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.append(ta); ta.select(); ta.setSelectionRange(0, text.length);
      let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove(); if (prev && prev.focus) prev.focus({ preventScroll: true });
      toast(ok ? msg : 'Copy failed: select the text and copy it manually');
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(msg), fallback);
    else fallback();
  };

  /* ---------------------------------------------------------------- counts, BibTeX, formulas */
  // The header, abstract, BibTeX and counts are static HTML written by the build script; the numeric counts are
  // refreshed here from site-data.js so that the page and its data cannot disagree.
  const F = D.findings, E = D.evidence.entries;
  $$('[data-n]').forEach(e => { const v = F[e.dataset.n]; if (typeof v === 'number') e.textContent = fmt(v); });
  $('#copyBib').addEventListener('click', () => copy($('#bibtex').textContent, 'BibTeX copied'));

  // KaTeX: its stylesheet loads without blocking the first render; typeset once it has arrived (plain text if it fails).
  let texPlain = !window.katex;
  const tex = (el, src) => {
    if (!texPlain) { try { katex.render(src, el, { throwOnError: false, displayMode: false }); return; } catch (e) { /* fall back to text */ } }
    el.textContent = src.replace(/\\(widehat|bar|mathbb|left|right|quad|mid)/g, ' ').replace(/\\([a-zA-Z]+)/g, '$1').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  };
  let typeset = () => { typeset = () => {}; $$('.tex[data-tex]').forEach(el => tex(el, el.dataset.tex)); };
  const kcss = $('#katex-css');
  if (kcss && kcss.dataset.failed) texPlain = true;
  if (texPlain || !kcss || kcss.media === 'all' || kcss.sheet) typeset();
  else {
    kcss.addEventListener('load', () => typeset(), { once: true });
    kcss.addEventListener('error', () => { texPlain = true; typeset(); }, { once: true });
    setTimeout(() => typeset(), 6000);                                // slow stylesheet: typeset anyway, it styles on arrival
  }

  /* ---------------------------------------------------------------- assignment rule */
  const leaves = D.taxonomy.leaves;
  const PNAME = { I: 'Agent-centric world models', II: 'Learned worlds', III: 'Environment-enhanced world models' };
  const PNAME_HTML = { I: PNAME.I, II: PNAME.II, III: '<span class="nowrap">Environment-enhanced</span> world models' };
  const QNAME = { Q1: 'Q1 choose experience', Q2: 'Q2 predict the robot', Q3: 'Q3 preview changes', Q4: 'Q4 share predictions' };
  // a Paradigm III leaf carries its coded question (l.q); a 'both sides learn' leaf takes the question of its entry
  const pathFor = l => (l.trunk === 'I' ? ['yes'] : l.trunk === 'II' ? ['no', 'L0'] : l.q === 'Q1' ? ['no', 'L1'] : ['no', 'no', 'yes']);
  const MODEL = { WM: 'a learned world model', OS: 'an outcome surrogate or critic', BM: 'a behavior model', SIM: 'an engine, twin or analytic model', Other: 'another type of model' };
  const OUT = {
    I: ['I', 'p1', 'Paradigm I: agent-centric world model', 'The model is an inner component of the robot’s own learning or control algorithm: the robot plans through it, verifies with it or acts on its latent state, or its learner trains in imagination while updating the model every iteration or penalizing its uncertainty.'],
    II: ['II', 'p2', 'Paradigm II: learned world', 'Its output stands in for P, as the robot’s experience or the outcome by which it is judged: a substitute world, used only through its outputs and refit, if at all, in discrete rounds, without conditioning on this robot (L0).'],
    IIIq1: ['III', 'p3', 'Paradigm III, Q1 choose experience', 'Its output stands in for P, and a rule conditions that output or the refits on evidence about this robot (L1–L3).'],
    III: ['III', 'p3', 'Paradigm III: environment-enhanced world model', 'The environment side queries it to choose an intervention for this robot: Q2, Q3 or Q4 if it predicts the robot, the consequence of the intervention or content that the robot reads. Q2–Q4 are Paradigm III at every ladder level.'],
    none: ['', '', 'A contrast, or outside the survey', 'A use that fails all three questions is a contrast or lies outside the survey’s scope.'],
  };
  const form = $('#ruleForm'), rqs = $$('.rq', form), ruleOut = $('#ruleOut'), exSel = $('#ruleExample');
  const answers = () => [0, 1, 2].map(i => { const c = $(`input[name="rq${i}"]:checked`, form); return c ? c.value : null; });
  const verdict = a => {
    if (a[0] === 'yes') return 'I';
    if (a[0] !== 'no') return null;
    if (a[1] === 'L0') return 'II';
    if (a[1] === 'L1') return 'IIIq1';
    if (a[1] !== 'no') return null;
    return a[2] === 'yes' ? 'III' : a[2] === 'no' ? 'none' : null;
  };
  function renderRule(sel) {
    let a = answers();
    const on = [true, a[0] === 'no', a[0] === 'no' && a[1] === 'no'];
    rqs.forEach((f, i) => { f.disabled = !on[i]; if (!on[i]) $$('input', f).forEach(x => { x.checked = false; }); });
    a = answers();
    const v = verdict(a);
    if (!v) {
      ruleOut.innerHTML = `<p class="pending">${a[0] ? 'Answer the next question.' : 'Answer the questions, or load a system from the taxonomy.'}</p>`;
      return;
    }
    const o = OUT[v];
    let head = o[2], extra = '';
    if (sel) {
      extra = `<p>Loaded: <b>${esc(sel.name)}</b> (${esc(sel.year)}), listed under ${esc(sel.branch_label)} in Paradigm ${esc(sel.trunk)} of the taxonomy.</p>`;
      if (sel.trunk === 'III') {
        // the survey's coding of this use: question, ladder level, fidelity tracking, model type, strict core
        head = `Paradigm III, ${QNAME[sel.q]}` + (sel.ladder ? `, ${sel.ladder}` : '') + (sel.FT ? ', fidelity tracking' : '');
        extra += sel.model === 'WM'
          ? `<p>Model: a learned world model; ${sel.strict_core ? 'the entry is in the strict core.' : `the entry is outside the strict core${sel.ladder === 'L0' ? ', since the choice does not condition on this robot (L0)' : ''}.`}</p>`
          : `<p>Model: ${MODEL[sel.model] || 'another type of model'}, not a learned world model, so the use is Paradigm III but outside the strict core.</p>`;
      }
      if (sel.non_embodied) extra += `<p>The survey flags this entry as ${esc(sel.non_embodied.replace(/^non-embodied: (.*)$/, 'non-embodied ($1)'))}.</p>`;
    }
    ruleOut.innerHTML = `<p class="verdict">${o[0] ? `<span class="pbadge ${o[1]}">${o[0]}</span>` : ''}<span>${esc(head)}</span></p><p>${esc(o[3])}</p>${extra}`;
  }
  // examples: every taxonomy leaf, grouped by paradigm
  exSel.innerHTML = '<option value="">Choose a system</option>' + ['I', 'II', 'III'].map(k => `<optgroup label="Paradigm ${k}: ${PNAME[k]}">` +
    leaves.filter(l => l.trunk === k).slice().sort((p, q) => p.name.localeCompare(q.name) || p.branch_label.localeCompare(q.branch_label))
      .map(l => `<option value="${esc(l.id)}">${esc(l.name)} (${esc(l.branch_label)})</option>`).join('') + '</optgroup>').join('');
  form.addEventListener('change', e => {
    if (e.target === exSel) {
      const l = leaves.find(x => x.id === exSel.value);
      $$('input[type=radio]', form).forEach(x => { x.checked = false; });
      if (!l) { renderRule(); return; }
      pathFor(l).forEach((v, i) => { const r = $(`input[name="rq${i}"][value="${v}"]`, form); if (r) r.checked = true; });
      renderRule(l);
      return;
    }
    if (e.target.name && e.target.name.startsWith('rq')) { exSel.value = ''; renderRule(); }
  });
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('reset', () => setTimeout(() => renderRule(), 0));
  renderRule();

  /* ---------------------------------------------------------------- taxonomy */
  const T = D.taxonomy;
  const TR = [['I', 'p1'], ['II', 'p2'], ['III', 'p3']];
  const linkOf = id => T.links.filter(l => l.a === id || l.b === id);
  const partners = id => linkOf(id).map(l => (l.a === id ? l.b : l.a));
  const lib = D.library, libByKey = Object.fromEntries(lib.map(r => [r.key, r]));
  const taxBox = $('#tax'), detail = $('#taxDetail'), narrow = matchMedia('(max-width: 900px)');
  let taxSort = 'year', openLeaf = null;
  const qHead = (q, rest) => `<span class="qbadge">${q}</span> ${esc(cap(rest))}`;
  const branchHead = lab => { const q = lab.match(/^(Q[1-4]) (.*)$/); return q ? qHead(q[1], q[2]) : esc(cap(lab)); };
  function leafHtml(l) {
    const linked = linkOf(l.id).length;
    return `<li><button type="button" class="leaf" data-id="${esc(l.id)}" aria-expanded="false" aria-controls="taxDetail">${esc(l.name)}` +
      (l.preprint ? '<span class="sym" aria-hidden="true">†</span><span class="sr-only">, preprint</span>' : '') +
      (l.strict_core ? '<span class="sym" aria-hidden="true">★</span><span class="sr-only">, strict core</span>' : '') +
      (l.trunk === 'III' && l.ladder ? `<span class="sr-only">, ladder level </span><span class="lv">${esc(l.ladder)}</span>` : '') +
      (l.FT ? '<span class="ft" aria-hidden="true">FT</span><span class="sr-only">, fidelity tracking</span>' : '') +
      (linked ? '<span class="sym" aria-hidden="true">↔</span><span class="sr-only">, also listed elsewhere</span>' : '') +
      `<span class="sr-only">, </span><span class="yr">${esc(l.year)}</span></button></li>`;
  }
  // The detail panel sits after the open leaf's trunk on narrow screens and after the whole tree otherwise.
  function placeDetail() {
    const btn = openLeaf && $(`.leaf[data-id="${CSS.escape(openLeaf)}"]`, taxBox);
    if (btn && narrow.matches) btn.closest('.trunk').after(detail); else taxBox.after(detail);
  }
  function drawTax() {
    if (detail.parentNode === taxBox) taxBox.after(detail);             // keep the panel out of the redrawn tree
    taxBox.innerHTML = TR.map(([k, cls]) => {
      const ls = leaves.filter(l => l.trunk === k);
      const branches = [...new Map(ls.map(l => [l.branch, l.branch_label])).entries()];
      return `<section class="trunk ${cls}" aria-labelledby="trunk-${k}"><h3 id="trunk-${k}"><span class="sr-only">Paradigm </span><span class="pbadge">${k}</span><span class="sr-only">:</span> ${PNAME_HTML[k]}</h3><p class="n">${ls.length} leaves</p>` +
        branches.map(([b, lab]) => {
          const bl = ls.filter(l => l.branch === b).sort((p, q) => (taxSort === 'year' ? p.year - q.year || p.name.localeCompare(q.name) : p.name.localeCompare(q.name)));
          return `<h4>${branchHead(lab)}</h4><ul class="leaves">${bl.map(leafHtml).join('')}</ul>`;
        }).join('') + '</section>';
    }).join('');
    $$('.leaf', taxBox).forEach(b => {
      const mark = on => partners(b.dataset.id).forEach(pid => { const p = $(`.leaf[data-id="${CSS.escape(pid)}"]`, taxBox); if (p) p.classList.toggle('partner', on); });
      b.addEventListener('mouseenter', () => mark(true)); b.addEventListener('mouseleave', () => mark(false));
      b.addEventListener('focus', () => mark(true)); b.addEventListener('blur', () => mark(false));
      b.addEventListener('click', () => (openLeaf === b.dataset.id ? closeLeaf(true) : showLeaf(b.dataset.id)));
    });
    if (openLeaf) {
      const b = $(`.leaf[data-id="${CSS.escape(openLeaf)}"]`, taxBox);
      if (b) b.setAttribute('aria-expanded', 'true');
      placeDetail();
    }
    filterTax();
  }
  narrow.addEventListener('change', placeDetail);
  const MT = { WM: 'learned world model', OS: 'outcome surrogate or critic', SIM: 'engine, twin or analytic model', BM: 'behavior model', Other: 'other model type' };
  function linkHtml(r, descId) {
    const d = descId ? ` aria-describedby="${esc(descId)}"` : '';
    const out = [];
    if (r.doi) out.push(`<a class="btn-small" href="https://doi.org/${encodeURI(r.doi)}" target="_blank" rel="noopener"${d}>DOI${NEWTAB}</a>`);
    if (r.arxiv) out.push(`<a class="btn-small" href="https://arxiv.org/abs/${encodeURIComponent(r.arxiv)}" target="_blank" rel="noopener"${d}>arXiv${NEWTAB}</a>`);
    if (!out.length) out.push(`<a class="btn-small" href="https://scholar.google.com/scholar?q=${encodeURIComponent(r.title)}" target="_blank" rel="noopener"${d}>Google Scholar${NEWTAB}</a>`);
    return out.join('');
  }
  const authorList = (a, n = 6) => (a.length > n ? a.slice(0, n - 1).join(', ') + ', et al.' : a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a.join(''));
  function showLeaf(id) {
    const l = leaves.find(x => x.id === id), r = libByKey[l.key];
    openLeaf = id;
    $$('.leaf', taxBox).forEach(b => b.setAttribute('aria-expanded', String(b.dataset.id === id)));
    placeDetail();
    const facts = [`Paradigm ${l.trunk}`, cap(l.branch_label)];
    if (l.trunk === 'III' && l.branch === 'both') facts.push(`coded as ${QNAME[l.q]}`);
    if (l.ladder) facts.push(`ladder level ${l.ladder}`);
    if (l.FT) facts.push('fidelity tracking');
    if (l.strict_core) facts.push('strict core');
    if (l.model) facts.push(`model: ${MT[l.model]}`);
    if (l.non_embodied) facts.push(l.non_embodied);
    if (l.preprint) facts.push('preprint');
    const links = linkOf(id).map(k => `${esc(cap(k.type))}: ${esc(k.label)}`);
    detail.className = 'detail ' + TR.find(t => t[0] === l.trunk)[1];
    detail.innerHTML = `<h4 id="taxDetailTitle">${esc(l.name)} <span class="yr">(${esc(l.year)})</span></h4><p class="facts">${facts.map(esc).join(' · ')}</p>` +
      (r ? `<p class="ref">${esc(r.title)}. ${esc(authorList(r.authors, 4).replace(/\.$/, ''))}. ${r.venue ? esc(r.venue) + ', ' : ''}${esc(r.year)}.</p>` : '') +
      (links.length ? `<p class="facts">Also in the taxonomy. ${links.join('; ')}.</p>` : '') +
      `<div class="actions">${r ? linkHtml(r, 'taxDetailTitle') + '<button type="button" class="btn-small" data-act="lib" aria-describedby="taxDetailTitle">Show in the library</button><button type="button" class="btn-small" data-act="bib" aria-describedby="taxDetailTitle">Copy BibTeX</button>' : ''}<button type="button" class="btn-small" data-act="close">Close</button></div>`;
    detail.hidden = false;
    if (r) {
      $('[data-act="lib"]', detail).addEventListener('click', () => libFocus(r.key));
      $('[data-act="bib"]', detail).addEventListener('click', () => copy(r.bibtex, 'BibTeX copied'));
    }
    $('[data-act="close"]', detail).addEventListener('click', () => closeLeaf(true));
    detail.focus({ preventScroll: true });
    detail.scrollIntoView({ block: 'nearest' });
  }
  function closeLeaf(returnFocus) {
    const prev = openLeaf; openLeaf = null; detail.hidden = true;
    $$('.leaf', taxBox).forEach(b => b.setAttribute('aria-expanded', 'false'));
    placeDetail();
    if (returnFocus && prev) { const b = $(`.leaf[data-id="${CSS.escape(prev)}"]`, taxBox); if (b) b.focus(); }
  }
  detail.addEventListener('keydown', e => { if (e.key === 'Escape') closeLeaf(true); });
  function filterTax() {
    const raw = $('#taxSearch').value.trim(), q = raw.toLowerCase();
    let n = 0;
    $$('.leaf', taxBox).forEach(b => {
      const l = leaves.find(x => x.id === b.dataset.id), hit = !q || (l.name + ' ' + l.branch_label).toLowerCase().includes(q);
      b.classList.toggle('miss', !hit); b.classList.toggle('hit', !!q && hit); n += hit;
    });
    $('#taxStatus').textContent = !q ? '' : n ? `${n} of ${leaves.length} leaves match “${raw}”; the others are shown faded.` : `No leaf matches “${raw}”.`;
  }
  $('#taxSearch').addEventListener('input', filterTax);
  $('#taxSort').addEventListener('change', e => { taxSort = e.target.value; drawTax(); });
  drawTax();

  /* ---------------------------------------------------------------- evidence map */
  const COLS = [['WM', 'World model', 'WM'], ['OS', 'Surrogate or critic', 'Critic'], ['BM', 'Behavior model', 'Beh.'], ['SIM', 'Engine or twin', 'Eng.'], ['Other', 'Other', 'Other']];
  const ROWS = [['Q1 L0', 'Q1', 'Choose experience', 'L0'], ['Q1 L1+', 'Q1', 'Choose experience', 'L1–L3'], ['Q2', 'Q2', 'Predict the robot', ''], ['Q3', 'Q3', 'Preview changes', ''], ['Q4', 'Q4', 'Share predictions', '']];
  const TYPE = { WM: 'learned world model', OS: 'outcome surrogate or critic', BM: 'behavior model', SIM: 'engine, twin or analytic model', Other: 'other model type' };
  const evMap = $('#evMap'), evList = $('#evList'), evStatus = $('#evStatus');
  const cbCore = $('#evCore'), cbReal = $('#evReal'), cbL0 = $('#evL0');
  const evFilter = e => (!cbCore.checked || e.core) && (!cbReal.checked || e.real_robot) && (cbL0.checked || e.row !== 'Q1 L0');
  const cellMax = Math.max(...ROWS.flatMap(([rk]) => COLS.map(([ck]) => E.filter(e => e.row === rk && e.type === ck).length)));
  // sequential teal, from the paper's light teal to the accent ink
  const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const lum = c => { const f = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * f[0] + .7152 * f[1] + .0722 * f[2]; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  const shade = n => {
    const c = lerp([214, 240, 240], [11, 107, 107], Math.min(1, (n - 1) / Math.max(1, cellMax - 1)));
    const ink = contrast(c, [255, 255, 255]) >= contrast(c, [27, 27, 27]) ? '#fff' : '#1b1b1b';
    return [`rgb(${c.join(',')})`, ink];
  };
  let evSel = 'Q2|OS';
  const rowLabel = r => `${r[2]}${r[3] ? ', ' + r[3] : ''}`;
  function drawEv(announce) {
    const ents = E.filter(evFilter);
    const rows = ROWS.filter(r => r[0] !== 'Q1 L0' || cbL0.checked);
    let h = evMap.querySelector('caption').outerHTML + '<colgroup><col class="c-row">' + COLS.map(() => '<col>').join('') + '<col class="c-tot"></colgroup>';
    h += '<thead><tr><td></td>' + COLS.map(([k, full, short]) => `<th scope="col"${k === 'WM' ? ' class="wm"' : ''}><span class="full">${full}</span><span class="short" aria-hidden="true">${short}</span><span class="short sr-only">${full}</span></th>`).join('') + '<th scope="col">Total</th></tr></thead><tbody>';
    rows.forEach(r => {
      const [rk, q] = r, rowE = ents.filter(e => e.row === rk);
      h += `<tr${rk === 'Q1 L1+' && cbL0.checked ? ' class="sep"' : ''}><th scope="row"><span class="rowlab"><span class="qbadge">${q}</span> <span>${esc(rowLabel(r))}</span></span></th>`;
      COLS.forEach(([ck]) => {
        const c = rowE.filter(e => e.type === ck), n = c.length, core = c.filter(e => e.core).length;
        if (!n) { h += `<td${ck === 'WM' ? ' class="wm"' : ''}><span class="cell empty"><span class="sr-only">0</span></span></td>`; return; }
        const [bg, ink] = shade(n), key = rk + '|' + ck;
        h += `<td${ck === 'WM' ? ' class="wm"' : ''}><button type="button" class="cell" data-k="${esc(key)}" aria-pressed="${evSel === key}" style="background:${bg};color:${ink}" aria-label="${q} ${esc(rowLabel(r))}, ${TYPE[ck]}: ${n} ${n === 1 ? 'entry' : 'entries'}${core ? `, ${core} strict core` : ''}">${n}${core ? `<small aria-hidden="true">★${core}</small>` : ''}</button></td>`;
      });
      h += `<td class="tot">${rowE.length}</td></tr>`;
    });
    h += '</tbody><tfoot><tr><th scope="row">Total</th>' + COLS.map(([ck]) => `<td class="tot">${ents.filter(e => e.type === ck).length}</td>`).join('') + `<td class="tot">${ents.length}</td></tr></tfoot>`;
    evMap.innerHTML = h;
    $$('button.cell', evMap).forEach(b => b.addEventListener('click', () => { evSel = b.dataset.k; drawEv(true); const nb = $(`button.cell[data-k="${CSS.escape(evSel)}"]`, evMap); if (nb) nb.focus({ preventScroll: true }); }));
    listEv(ents, announce);
    drawLadBars(ents);
  }
  function listEv(ents, announce) {
    const say = t => { if (announce) evStatus.textContent = t; };
    if (!evSel) { evList.innerHTML = '<p class="small">Select a cell to list its entries.</p>'; say('No cell selected.'); return; }
    const [r, c] = evSel.split('|'), row = ROWS.find(x => x[0] === r);
    const es = ents.filter(e => e.row === r && e.type === c).sort((a, b) => (b.core - a.core) || (b.year - a.year) || a.title.localeCompare(b.title));
    const what = `${row[1]} ${rowLabel(row)}, ${TYPE[c]}`;
    if (!es.length) { evList.innerHTML = '<p class="small">No coded entry in the selected cell matches these filters. Select another cell.</p>'; say(`${what}: no entry matches these filters.`); return; }
    evList.innerHTML = `<h4>${qHead(row[1], rowLabel(row))}, ${TYPE[c]} <span class="count">${es.length} ${es.length === 1 ? 'entry' : 'entries'}</span></h4><ol>` +
      es.map(e => `<li><span class="t" id="ev-${esc(e.id)}">${/^https?:\/\//.test(e.url) ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}${NEWTAB}</a>` : esc(e.title)}</span>` +
        `<span class="m">${esc(authorList(e.authors, 3))} · ${esc(e.venue)} · ${esc(e.year)}</span><span class="tags"><span class="tag">${esc(e.ladder)}</span>` +
        (e.core ? '<span class="tag">★ strict core</span>' : '') + (e.fidelity_tracking ? '<span class="tag">FT</span>' : '') +
        (e.real_robot ? '<span class="tag">real robot or vehicle tests</span>' : '') + (e.peer_reviewed ? '' : '<span class="tag">preprint</span>') +
        (e.non_embodied ? `<span class="tag">${esc(e.non_embodied)}</span>` : '') +
        (e.key ? `<button type="button" class="linkbtn" data-key="${esc(e.key)}" aria-describedby="ev-${esc(e.id)}">Show in the library</button>` : '') + '</span></li>').join('') + '</ol>';
    $$('.linkbtn', evList).forEach(b => b.addEventListener('click', () => libFocus(b.dataset.key)));
    say(`${what}: ${es.length} ${es.length === 1 ? 'entry' : 'entries'} listed below the map.`);
  }
  [cbCore, cbReal, cbL0].forEach(cb => cb.addEventListener('change', () => { if (cb === cbL0 && !cbL0.checked && evSel && evSel.startsWith('Q1 L0')) evSel = null; drawEv(true); }));

  /* ---------------------------------------------------------------- adaptation ladder */
  const RUNGS = [
    ['L0', 'Ignores this robot', 'The environment side does not condition on this robot. On Q1, a substitute world at L0 is Paradigm II.', 'Ctrl-World (Q1)'],
    ['L1', 'Selects for this robot', 'It conditions on the robot with fixed parameters.', 'SAFE-SIM (Q1)'],
    ['L2', 'Updates belief online', 'It updates its belief about the robot online.', 'Sirius-Fleet (Q2)'],
    ['L3', 'Learns with this robot', 'It trains its own parameters under an objective coupled to the robot’s performance or learning, such as regret, learnability or failure proximity. Joint training alone does not reach L3.', 'asymmetric self-play (Q1)'],
    ['FT', 'Fidelity tracking (a flag, not a rung)', 'A refit for accuracy on the robot’s data: the model moves with the learner, but its objective is accuracy, not the learner’s progress.', 'WMPO and VLAW (both L2)'],
  ];
  $('#rungs').innerHTML = RUNGS.map(([k, t, d, ex]) => `<div><dt><span class="lvl">${k}</span> ${esc(t)}</dt><dd>${esc(d)}<span class="ex">Example: ${esc(ex)}</span></dd></div>`).join('');
  const LC = { L0: '#a9b1b8', L1: '#b3e3e3', L2: '#57bdbd', L3: '#0b6b6b' };
  const LT = { L0: 'ignores this robot', L1: 'selects for this robot', L2: 'updates belief online', L3: 'learns with this robot' };
  function drawLadBars(ents) {
    const qs = ['Q1', 'Q2', 'Q3', 'Q4'], tot = qs.map(q => ents.filter(e => e.q === q).length), mx = Math.max(1, ...tot);
    // the bar is a picture of the counts printed beside it, so it is hidden from screen readers
    $('#ladBars').innerHTML = qs.map((q, i) => {
      const es = ents.filter(e => e.q === q), parts = ['L0', 'L1', 'L2', 'L3'].map(L => [L, es.filter(e => e.ladder === L).length]);
      return `<div class="ladrow"><span class="qbadge">${q}</span><div class="ladbar" aria-hidden="true">` +
        `<span class="ladfill" style="flex:0 0 ${(tot[i] / mx * 100).toFixed(2)}%">` +
        parts.filter(([, c]) => c).map(([L, c]) => `<span class="seg" style="flex:${c} 1 0;background:${LC[L]}"></span>`).join('') +
        `</span></div><p class="ladnum"><b>${tot[i]}</b><span class="sr-only"> ${tot[i] === 1 ? 'entry' : 'entries'}:</span> <span class="parts">(${parts.map(([L, c]) => `${L} ${c}`).join(' · ')})</span></p></div>`;
    }).join('') + `<div class="ladkey" aria-hidden="true">${Object.entries(LC).map(([k, c]) => `<span><i style="background:${c}"></i>${k} ${LT[k]}</span>`).join('')}</div>`;
  }
  drawEv(false);

  /* ---------------------------------------------------------------- library */
  const SECS = ['Introduction', 'Foundations', 'Paradigm I', 'Paradigm II', 'Paradigm III', 'Evaluation', 'Agenda', 'Acknowledgment'];
  const LF = { q: '', sec: '', type: '', year: '', shown: 30 };
  const secCount = s => lib.filter(r => r.sections.includes(s)).length;
  $('#libSection').innerHTML += SECS.filter(secCount).map(s => `<option value="${esc(s)}">${esc(s)} (${secCount(s)})</option>`).join('');
  const years = [...new Set(lib.map(r => r.year))].sort((a, b) => b - a);
  $('#libYear').innerHTML += years.map(y => `<option value="${y}">${y} (${lib.filter(r => r.year === y).length})</option>`).join('');
  const filt = () => lib.filter(r => (!LF.type || r.type === LF.type) && (!LF.sec || r.sections.includes(LF.sec)) && (!LF.year || r.year === +LF.year)
    && (!LF.q || (r.title + ' ' + r.authors.join(' ') + ' ' + r.venue + ' ' + r.year + ' ' + r.key).toLowerCase().includes(LF.q)));
  const hl = s => {
    s = String(s); if (!LF.q) return esc(s);
    const i = s.toLowerCase().indexOf(LF.q);
    return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + LF.q.length)) + '</mark>' + esc(s.slice(i + LF.q.length));
  };
  function renderLib() {
    const list = filt();
    $('#libCount').textContent = `${fmt(list.length)} of ${fmt(lib.length)} works`;
    $('#libList').innerHTML = list.slice(0, LF.shown).map(r => `<li><span class="t" id="lib-${esc(r.key)}">${hl(r.title)}</span><span class="a">${hl(authorList(r.authors))}</span>` +
      `<span class="v">${r.venue ? hl(r.venue) + ', ' : ''}${esc(r.year)} · discussed in ${r.sections.map(esc).join(', ')}</span>` +
      `<span class="acts">${linkHtml(r, 'lib-' + r.key)}<button type="button" class="btn-small" data-key="${esc(r.key)}" aria-describedby="lib-${esc(r.key)}">Copy BibTeX</button></span></li>`).join('') ||
      '<li><span class="empty">No work matches these filters.</span></li>';
    $$('#libList button[data-key]').forEach(b => b.addEventListener('click', () => copy(libByKey[b.dataset.key].bibtex, 'BibTeX copied')));
    const more = $('#libMore'), rest = list.length - LF.shown;
    more.hidden = rest <= 0;
    more.textContent = `Show ${Math.min(40, Math.max(rest, 0))} more`;
  }
  let libT;
  $('#libSearch').addEventListener('input', e => { clearTimeout(libT); libT = setTimeout(() => { LF.q = e.target.value.trim().toLowerCase(); LF.shown = 30; renderLib(); }, 150); });
  $('#libSection').addEventListener('change', e => { LF.sec = e.target.value; LF.shown = 30; renderLib(); });
  $('#libType').addEventListener('change', e => { LF.type = e.target.value; LF.shown = 30; renderLib(); });
  $('#libYear').addEventListener('change', e => { LF.year = e.target.value; LF.shown = 30; renderLib(); });
  $('#libMore').addEventListener('click', () => {
    const first = LF.shown; LF.shown += 40; renderLib();
    const li = $$('#libList li')[first]; if (li) { const b = $('a, button', li); if (b) b.focus(); }
  });
  function libFocus(key) {
    const r = libByKey[key]; if (!r) return;
    const q = r.title.slice(0, 48);
    $('#libSearch').value = q; LF.q = q.toLowerCase(); LF.sec = LF.type = LF.year = ''; LF.shown = 30;
    $('#libSection').value = ''; $('#libType').value = ''; $('#libYear').value = '';
    renderLib();
    $('#library').scrollIntoView();
    $('#libSearch').focus({ preventScroll: true });
  }
  renderLib();
  updateScrollRegions();
})();
