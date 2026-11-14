/* Continual Learning for Embodied AI: charts module (assets/js/charts.js, loaded with defer before app.js).

   Registers CLEAI.modules.charts = { init, evidenceProfile }. Contract, tokens and container ids: ../../DESIGN.md;
   data: ../../data/SCHEMA.md. init() fills these containers when they exist and does nothing otherwise:
     #growth-chart      Figure 1a: continual learning works in DBLP per year, stacked by type (D3 7.9.0)
     #forgetting-chart  Figure 1b: earlier-task performance before and after plain sequential fine-tuning, figure order
     #eval-pyramid      Section 9.4: the L1 to L5 evaluation difficulty hierarchy and the selected level's text
     #taxonomy-tree     interactive Figure 2: collapsible branches, search, study details through "study:open"
   evidenceProfile(el, axis) is the shell hook for the settings tabs: the D/P/A/NG profile of the studies filed under
   one axis; selecting a grade sends "explorer:filter" {axis, evidence}.
   Rules kept here: paper text comes from the data (html fields are inserted as built); counts appear only as live
   readouts computed from the data; the forgetting rows keep the order of Figure 1b; motion only as short transitions
   after a user action and none under prefers-reduced-motion. Only the growth chart needs D3; the other views use
   plain SVG and HTML, and the growth chart falls back to a table when D3 is missing. */
(function () {
  'use strict';

  var NS = (window.CLEAI = window.CLEAI || { modules: {} });
  if (!NS.modules) NS.modules = {};

  var U = null;   /* CLEAI.util, available from init() on */
  var D = null;   /* CLEAI.data */

  /* ================================================================== helpers */
  var SVGNS = 'http://www.w3.org/2000/svg';
  var seq = 0;
  function uid(prefix) { seq += 1; return 'ch-' + prefix + '-' + seq; }
  function esc(s) { return U.esc(s); }
  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'text') el.textContent = String(v);
        else el.setAttribute(k, String(v));
      });
    }
    if (parent) parent.appendChild(el);
    return el;
  }
  var NUM = (window.Intl && Intl.NumberFormat) ? new Intl.NumberFormat('en-US') : null;
  function fmtInt(n) { n = Number(n) || 0; return NUM ? NUM.format(n) : String(n); }
  function fmtVal(v) { var n = Number(v); return isFinite(n) ? String(Math.round(n * 10) / 10) : ''; }
  function pct(n, d) { return d > 0 ? Math.round((100 * n) / d) : 0; }
  function pct1(n, d) { return d > 0 ? ((100 * n) / d).toFixed(1) : '0.0'; }
  function capFirst(s) { s = String(s == null ? '' : s); return s.charAt(0).toUpperCase() + s.slice(1); }
  function hasD3() {
    var d3 = window.d3;
    return !!(d3 && typeof d3.select === 'function' && typeof d3.scaleBand === 'function' && typeof d3.scaleLinear === 'function');
  }
  function report(what, err) { if (window.console && console.error) console.error('[CLEAI] charts: ' + what + ' failed:', err); }
  function focusVisible(el) { try { return el.matches(':focus-visible'); } catch (e) { return true; } }
  function closest(target, sel) { return target && target.closest ? target.closest(sel) : null; }

  /* width of an SVG text element, cached on the element (0 while hidden, so fall back to an estimate) */
  function textWidth(el, chars) {
    if (el.__chW) return el.__chW;
    var w = 0;
    try { w = el.getComputedTextLength(); } catch (e) { w = 0; }
    if (w > 0) { el.__chW = w; return w; }
    return (chars || 6) * 6.6;
  }

  /* writes the small HTML subset of the data's labels (<i>, <em>, <sub>, <sup>) into an SVG text element as tspans */
  var ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': '\u00a0' };
  function decode(s) { return String(s).replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, function (m) { return ENT[m]; }); }
  function richToSvg(textEl, html, shiftPx) {
    var SHIFT = shiftPx || 3.5;
    var italic = 0, shift = 0, pending = 0;
    String(html || '').split(/(<\/?(?:i|em|sub|sup)>)/).forEach(function (part) {
      if (!part) return;
      var m = /^<(\/?)(i|em|sub|sup)>$/.exec(part);
      if (m) {
        if (m[2] === 'i' || m[2] === 'em') italic += m[1] ? -1 : 1;
        else if (!m[1]) { shift = m[2] === 'sub' ? 1 : -1; pending += shift * SHIFT; }
        else { pending -= shift * SHIFT; shift = 0; }
        return;
      }
      var ts = svgEl('tspan', null, textEl);
      ts.textContent = decode(part.replace(/<[^>]*>/g, ''));
      if (italic > 0) ts.setAttribute('font-style', 'italic');
      if (shift) ts.setAttribute('font-size', '76%');
      if (pending) { ts.setAttribute('dy', String(pending)); pending = 0; }
    });
  }

  /* the shared tooltip (#cleai-tooltip), with an owner so that one view never hides another view's readout.
     A readout anchored to an element (keyboard focus) follows it while the page scrolls; one placed at the pointer
     is hidden on scroll. The token tells whether the tooltip still shows this module's content. */
  var tipOwner = null, tipAt = null, tipBody = '', tipToken = 0, tipQueued = false;
  function tipShow(owner, html, at) {
    tipOwner = owner;
    tipToken += 1;
    tipBody = '<div data-ch-tip="' + tipToken + '">' + html + '</div>';
    tipAt = at && at.nodeType === 1 ? at : null;
    U.tooltip.show(tipBody, at);
  }
  function tipMove(owner, evt) { if (tipOwner === owner && !tipAt) U.tooltip.move(evt); }
  function tipHide(owner) {
    if (!tipOwner || (owner && tipOwner !== owner)) return;
    tipOwner = null;
    tipAt = null;
    U.tooltip.hide();
  }
  function tipOnScroll() {
    if (!tipOwner || tipQueued) return;
    tipQueued = true;
    U.nextFrame(function () {
      tipQueued = false;
      if (!tipOwner) return;
      var el = U.tooltip.element;
      if (!el || el.hidden || !el.querySelector('[data-ch-tip="' + tipToken + '"]')) { tipOwner = null; tipAt = null; return; }
      if (!tipAt || !document.contains(tipAt)) { tipHide(); return; }
      var r = tipAt.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) { tipHide(); return; }
      U.tooltip.show(tipBody, tipAt);
    });
  }

  /* segmented control (style.css .seg): one pressed button; onChange(value) after a change */
  function segmented(label, options, value, onChange) {
    var g = U.h('div', { class: 'seg', role: 'group', 'aria-label': label });
    options.forEach(function (o) {
      g.appendChild(U.h('button', { type: 'button', 'data-value': o[0], 'aria-pressed': String(o[0] === value), text: o[1] }));
    });
    g.addEventListener('click', function (e) {
      var b = closest(e.target, 'button[data-value]');
      if (!b || b.getAttribute('aria-pressed') === 'true') return;
      U.$$('button[data-value]', g).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      onChange(b.getAttribute('data-value'));
    });
    return g;
  }

  /* ================================================================== 1. growth chart (#growth-chart, Figure 1a) */
  var GTYPES = [
    { key: 'conference', name: 'Conference', legend: 'conference' },
    { key: 'journal', name: 'Journal', legend: 'journal' },
    { key: 'arxiv', name: 'arXiv only', legend: 'arXiv only' }
  ];
  var PALE_BELOW = 50;   /* Figure 1a draws shares of years with fewer than 50 works pale */

  function growthValues(s, set) {
    var emb = set === 'emb';
    return {
      tot: Number(emb ? s.embodied : s.total) || 0,
      v: GTYPES.map(function (t) { return Number(emb ? s['embodied_' + t.key] : s[t.key]) || 0; })
    };
  }
  /* "yes (to DBLP snapshot 2026-10-15)" -> "to 15 October 2026" (the date form of the panel footer) */
  function partialNote(s) {
    var m = /\(([^)]+)\)/.exec(s.partial_note || '');
    if (!m) return '';
    var d = /(\d{4}-\d{2}-\d{2})/.exec(m[1]);
    return d ? 'to ' + U.fmtDate(d[1]) : m[1];
  }
  function growthTableHTML(series) {
    var head = '<tr><th scope="col">Year</th>' +
      GTYPES.map(function (t) { return '<th scope="col" class="num">' + esc(t.name) + '</th>'; }).join('') +
      '<th scope="col" class="num">All</th><th scope="col" class="num">Embodied subset</th></tr>';
    var body = series.map(function (s) {
      return '<tr><th scope="row">' + esc(s.year) + (s.partial ? ' (partial)' : '') + '</th>' +
        GTYPES.map(function (t) { return '<td class="num">' + fmtInt(s[t.key]) + '</td>'; }).join('') +
        '<td class="num">' + fmtInt(s.total) + '</td><td class="num">' + fmtInt(s.embodied) + '</td></tr>';
    }).join('');
    return '<table class="table"><caption>Continual learning works in DBLP per year, by type, with the embodied subset</caption>' +
      '<thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }
  function milestoneLinks(m) {
    var html = m.label_html || esc(m.label || '');
    var keys = m.keys || [];
    var parts = html.split(/,\s*/);
    var link = function (key, inner) { return '<a class="cite" href="#ref-' + esc(key) + '" data-key="' + esc(key) + '">' + inner + '</a>'; };
    if (keys.length && parts.length === keys.length) return parts.map(function (p, k) { return link(keys[k], p); }).join(', ');
    if (!keys.length) return html;
    return html + ' (' + keys.map(function (k, j) { return link(k, esc((m.cite_labels || [])[j] || k)); }).join('; ') + ')';
  }

  function initGrowth() {
    var el = document.getElementById('growth-chart');
    if (!el) return;
    var G = D.growth;
    if (!G || !Array.isArray(G.series) || !G.series.length) return;
    var fy = Array.isArray(G.figure_years) && G.figure_years.length === 2 ? G.figure_years : null;
    var series = G.series.filter(function (s) { return !fy || (s.year >= fy[0] && s.year <= fy[1]); });
    if (!series.length) return;
    var years = series.map(function (s) { return s.year; });
    var msByYear = new Map();
    (G.milestones || []).forEach(function (m) { if (years.indexOf(m.year) >= 0) msByYear.set(m.year, m); });

    /* the source and the snapshot date are in the panel footer (growth.method); not repeated here */
    function sourceNote() {
      var bits = [];
      if (G.arxiv_definition) bits.push('arXiv only: ' + esc(G.arxiv_definition) + ', with no matched conference or journal version.');
      series.filter(function (s) { return s.partial; }).forEach(function (s) {
        var pn = partialNote(s);
        bits.push(esc(s.year) + ' is partial' + (pn ? ' (' + esc(pn) + ')' : '') + '.');
      });
      return U.h('p', { class: 'cg-notes cg-source', html: bits.join(' ') });
    }

    el.replaceChildren();
    var root = U.h('div', { class: 'cg' });
    el.appendChild(root);

    if (!hasD3()) {   /* D3 did not load: the same numbers as a table */
      root.appendChild(U.h('div', {
        class: 'table-wrap', tabindex: '0', role: 'region',
        'aria-label': 'Continual learning works per year, scrolls sideways', html: growthTableHTML(series)
      }));
      root.appendChild(sourceNote());
      return;
    }
    var d3 = window.d3;
    var state = { set: 'all', scale: 'count', active: series.length - 1, hl: -1, focus: -1 };

    /* controls and legend */
    root.appendChild(U.h('div', { class: 'cg-controls' }, [
      segmented('Works shown', [['all', 'All continual learning'], ['emb', 'Embodied subset']], state.set,
        function (v) { state.set = v; update(true); }),
      segmented('Values shown', [['count', 'Counts'], ['share', 'Shares']], state.scale,
        function (v) { state.scale = v; update(true); })
    ]));
    var partialYears = series.filter(function (s) { return s.partial; }).map(function (s) { return s.year; });
    var legend = U.h('ul', { class: 'legend cg-legend', 'aria-label': 'Legend' });
    legend.innerHTML =
      GTYPES.map(function (t) {
        return '<li class="legend-item"><span class="swatch cg-sw t-' + t.key + '" aria-hidden="true"></span>' + esc(t.legend) + '</li>';
      }).join('') +
      (partialYears.length ? '<li class="legend-item"><span class="swatch cg-sw-hatch" aria-hidden="true"></span>' + esc(partialYears.join(', ')) + ' partial</li>' : '') +
      (msByYear.size ? '<li class="legend-item"><span class="cg-key-ms" aria-hidden="true"></span>milestone (cited work)</li>' : '') +
      '<li class="legend-item cg-pale-key" hidden><span class="swatch cg-sw t-conference is-pale" aria-hidden="true"></span>pale: fewer than ' + PALE_BELOW + ' works</li>';
    root.appendChild(legend);
    var paleKey = legend.querySelector('.cg-pale-key');

    /* SVG skeleton; geometry in layout(), data in update() */
    var plot = U.h('div', { class: 'cg-plot' });
    root.appendChild(plot);
    var svg = d3.select(plot).append('svg').attr('class', 'cg-svg').attr('role', 'group');
    var hatchId = uid('hatch');
    svg.append('defs').append('pattern').attr('id', hatchId).attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 5).attr('height', 5).attr('patternTransform', 'rotate(45)')
      .append('rect').attr('x', 0).attr('y', 0).attr('width', 2.2).attr('height', 5).attr('fill', '#fff');
    var gHL = svg.append('g').attr('class', 'cg-hls').attr('aria-hidden', 'true');
    var gGrid = svg.append('g').attr('class', 'grid').attr('aria-hidden', 'true');
    var gBars = svg.append('g').attr('class', 'cg-bars').attr('aria-hidden', 'true');
    var baseLine = svg.append('line').attr('class', 'cg-base').attr('aria-hidden', 'true');
    var gMs = svg.append('g').attr('class', 'cg-mss').attr('aria-hidden', 'true');
    var gX = svg.append('g').attr('class', 'axis cg-x').attr('aria-hidden', 'true');
    var gY = svg.append('g').attr('class', 'axis cg-y').attr('aria-hidden', 'true');
    var yTitle = svg.append('text').attr('class', 'cg-ytitle').attr('aria-hidden', 'true').attr('x', 0).attr('y', 12);
    var partialLabel = svg.append('text').attr('class', 'cg-partial').attr('aria-hidden', 'true').text('partial');
    var gCols = svg.append('g').attr('class', 'cg-cols');

    var colData = series.map(function (s, i) { return { s: s, i: i }; });
    var hl = gHL.selectAll('rect').data(colData).join('rect').attr('class', 'cg-hl');
    var cols = gCols.selectAll('g').data(colData).join('g').attr('class', 'cg-col').attr('role', 'img')
      .attr('tabindex', function (d) { return d.i === state.active ? 0 : -1; });
    cols.append('rect').attr('class', 'cg-hit');
    cols.append('rect').attr('class', 'cg-ring').attr('rx', 4);
    var msData = colData.filter(function (d) { return msByYear.has(d.s.year); })
      .map(function (d) { return { d: d, m: msByYear.get(d.s.year) }; });
    var msG = gMs.selectAll('g').data(msData).join('g').attr('class', 'cg-ms-mark');
    msG.append('path').attr('d', 'M0,-4.8L4.8,0L0,4.8L-4.8,0Z');
    msG.append('text').attr('class', 'cg-ms-text').attr('x', -8).attr('dy', '0.34em').attr('text-anchor', 'end')
      .each(function (o) { richToSvg(this, o.m.label_html || esc(o.m.label || '')); });

    var x = d3.scaleBand().domain(years).paddingInner(0.24).paddingOuter(0.12);
    var y = d3.scaleLinear();
    var W = 0, H = 0;
    var M = { top: 30, right: 8, bottom: 22, left: 40 };

    function tr(sel, dur) {
      if (!dur) { sel.interrupt(); return sel; }
      return sel.transition().duration(dur).ease(d3.easeCubicOut);
    }

    function layout(w) {
      W = Math.max(260, Math.round(w));
      H = Math.round(Math.max(210, Math.min(300, W * 0.58)));
      x.range([M.left, W - M.right]);
      y.range([H - M.bottom, M.top]);
      svg.attr('viewBox', '0 0 ' + W + ' ' + H).attr('width', W).attr('height', H);
      var step = x.step(), pad = (step - x.bandwidth()) / 2;
      var top = M.top - 18, bottom = H - M.bottom + 2;
      hl.attr('x', function (d) { return x(d.s.year) - pad; }).attr('width', step).attr('y', top).attr('height', bottom - top);
      cols.select('.cg-hit').attr('x', function (d) { return x(d.s.year) - pad; }).attr('width', step)
        .attr('y', top).attr('height', H - top);
      baseLine.attr('x1', M.left).attr('x2', W - M.right).attr('y1', H - M.bottom + 0.5).attr('y2', H - M.bottom + 0.5);
      var every = step >= 36 ? 1 : step >= 15 ? 2 : 3;
      var short = step * every < 30;
      var last = years[years.length - 1];   /* labels counted back from the latest year, which is always labeled */
      gX.selectAll('text').data(years.filter(function (v) { return (last - v) % every === 0; })).join('text')
        .attr('x', function (v) { return x(v) + x.bandwidth() / 2; }).attr('y', H - 6).attr('text-anchor', 'middle')
        .text(function (v) { return short ? '\u2019' + String(v).slice(2) : String(v); });
    }

    function colLabel(d) {
      var s = d.s, val = growthValues(s, state.set), share = state.scale === 'share';
      var parts = GTYPES.map(function (t, k) {
        return t.name + ' ' + fmtInt(val.v[k]) + (share && val.tot ? ' (' + pct(val.v[k], val.tot) + '%)' : '');
      });
      var m = msByYear.get(s.year);
      return s.year + (s.partial ? ', partial year' : '') + '. ' +
        (state.set === 'emb' ? 'Embodied subset' : 'All continual learning') + ': ' + fmtInt(val.tot) +
        (val.tot === 1 ? ' work; ' : ' works; ') + parts.join(', ') + '.' + (m ? ' Milestone: ' + (m.label || '') + '.' : '');
    }
    function svgLabel() {
      return 'Bar chart of ' + (state.set === 'emb' ? 'the embodied subset of ' : '') +
        'continual learning works in DBLP per year, ' + years[0] + ' to ' + years[years.length - 1] +
        ', stacked by type (conference, journal, arXiv only), ' + (state.scale === 'share' ? 'as shares of each year' : 'as counts') +
        '. The arrow keys move between years.';
    }
    function tipHTML(d) {
      var s = d.s, emb = state.set === 'emb', share = state.scale === 'share';
      var val = growthValues(s, state.set);
      var grid = GTYPES.map(function (t, k) {
        return '<span class="cg-tt-sw t-' + t.key + '" aria-hidden="true"></span><span>' + esc(t.name) + '</span>' +
          '<span class="cg-tt-n">' + fmtInt(val.v[k]) + '</span><span class="cg-tt-p">' + (val.tot ? pct(val.v[k], val.tot) + '%' : '\u2013') + '</span>';
      }).join('');
      var notes = [];
      if (emb && s.total) notes.push(pct1(s.embodied, s.total) + '% of all continual learning works in ' + esc(s.year) + '.');
      if (s.partial) notes.push('Partial year' + (partialNote(s) ? ', ' + esc(partialNote(s)) : '') + '.');
      if (share && val.tot < PALE_BELOW) notes.push('Drawn pale in the shares view: fewer than ' + PALE_BELOW + ' works.');
      var m = msByYear.get(s.year);
      if (m) notes.push('Milestone: ' + (m.label_html || esc(m.label || '')) + '.');
      return '<div class="cg-tt"><p class="cg-tt-h"><b>' + esc(s.year) + '</b> \u00b7 ' + (emb ? 'embodied subset' : 'all continual learning') + '</p>' +
        '<div class="cg-tt-grid">' + grid +
        '<span aria-hidden="true"></span><span>Total</span><span class="cg-tt-n"><b>' + fmtInt(val.tot) + '</b></span><span></span></div>' +
        notes.map(function (n) { return '<span class="tt-sub">' + n + '</span>'; }).join('') + '</div>';
    }

    function update(animate) {
      if (!W) return;
      var dur = animate && !U.reducedMotion() ? 180 : 0;
      var share = state.scale === 'share';
      var rows = colData.map(function (d) {
        var val = growthValues(d.s, state.set), acc = 0;
        var segs = GTYPES.map(function (t, k) {
          var raw = val.v[k], hgt = share ? (val.tot ? raw / val.tot : 0) : raw;
          var sg = { id: d.s.year + ':' + t.key, year: d.s.year, type: t.key, y0: acc, y1: acc + hgt, tot: val.tot, partial: !!d.s.partial };
          acc += hgt;
          return sg;
        });
        return { d: d, tot: val.tot, top: acc, segs: segs };
      });
      y.domain([0, share ? 1 : Math.max(1, d3.max(rows, function (r) { return r.top; }))]);
      if (!share) y.nice(4);
      var ticks = share ? [0, 0.25, 0.5, 0.75, 1] : y.ticks(4);
      var tf = share ? d3.format('.0%') : d3.format(',d');

      gGrid.selectAll('line').data(ticks).join('line').attr('x1', M.left).attr('x2', W - M.right)
        .attr('y1', function (v) { return Math.round(y(v)) + 0.5; }).attr('y2', function (v) { return Math.round(y(v)) + 0.5; });
      gY.selectAll('text').data(ticks).join('text').attr('x', M.left - 6).attr('y', function (v) { return y(v); })
        .attr('dy', '0.32em').attr('text-anchor', 'end').text(function (v) { return tf(v); });
      yTitle.text(share ? 'share of works' : 'works per year');

      var flat = [];
      rows.forEach(function (r) { r.segs.forEach(function (sg) { flat.push(sg); }); });
      var bw = x.bandwidth();
      var bars = gBars.selectAll('rect.cg-seg').data(flat, function (sg) { return sg.id; })
        .join(function (enter) {
          return enter.append('rect').attr('class', function (sg) { return 'cg-seg t-' + sg.type; })
            .attr('y', y.range()[0]).attr('height', 0);
        });
      bars.attr('x', function (sg) { return x(sg.year); }).attr('width', bw)
        .classed('is-pale', function (sg) { return share && sg.tot < PALE_BELOW; });
      tr(bars, dur).attr('y', function (sg) { return y(sg.y1); })
        .attr('height', function (sg) { return Math.max(0, y(sg.y0) - y(sg.y1)); });
      var hatches = gBars.selectAll('rect.cg-hatch').data(flat.filter(function (sg) { return sg.partial; }), function (sg) { return sg.id; })
        .join(function (enter) {
          return enter.append('rect').attr('class', 'cg-hatch').attr('fill', 'url(#' + hatchId + ')')
            .attr('y', y.range()[0]).attr('height', 0);
        });
      hatches.attr('x', function (sg) { return x(sg.year); }).attr('width', bw);
      tr(hatches, dur).attr('y', function (sg) { return y(sg.y1); })
        .attr('height', function (sg) { return Math.max(0, y(sg.y0) - y(sg.y1)); });

      /* milestone marks; their labels only in the counts view and only where they overlap nothing */
      var cxOf = function (year) { return x(year) + bw / 2; };
      var markY = function (o) { return (share ? y(1) : y(rows[o.d.i].top)) - 9; };
      tr(msG, dur).attr('transform', function (o) { return 'translate(' + cxOf(o.d.s.year) + ',' + markY(o) + ')'; });
      var boxes = rows.map(function (r) { return { x0: x(r.d.s.year) - 1, x1: x(r.d.s.year) + bw + 1, y0: y(r.top), y1: y(0) }; });
      msData.forEach(function (o) {
        var cx = cxOf(o.d.s.year), cy = markY(o);
        boxes.push({ x0: cx - 6, x1: cx + 6, y0: cy - 6, y1: cy + 6 });
      });
      msG.select('text').attr('display', function (o) {
        if (share) return 'none';
        var tw = textWidth(this, (o.m.label || '').length);
        var cx = cxOf(o.d.s.year), cy = markY(o);
        var b = { x0: cx - 8 - tw, x1: cx - 8, y0: cy - 8, y1: cy + 8 };
        if (b.x0 < M.left + 2 || b.y0 < 0) return 'none';
        for (var k = 0; k < boxes.length; k++) {
          var q = boxes[k];
          if (b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0) return 'none';
        }
        boxes.push(b);
        return null;
      });

      /* "partial" written up the partial bar when there is room above it */
      var pr = rows.filter(function (r) { return r.d.s.partial; }).pop();
      if (pr && !share && pr.tot > 0) {
        var topY = y(pr.top), lw = textWidth(partialLabel.node(), 7);
        partialLabel.attr('display', topY - 6 - lw >= 2 ? null : 'none')
          .attr('transform', 'translate(' + (cxOf(pr.d.s.year) + 4) + ',' + (topY - 6) + ') rotate(-90)');
      } else partialLabel.attr('display', 'none');

      /* focus rings hug the bars, so the readout of a focused year sits above its bar */
      cols.select('.cg-ring').attr('x', function (d) { return x(d.s.year) - 3; }).attr('width', bw + 6)
        .attr('y', function (d) { return y(rows[d.i].top) - 3; })
        .attr('height', function (d) { return Math.max(0, y(0) - y(rows[d.i].top)) + 6; });
      cols.attr('aria-label', colLabel);
      hl.classed('is-on', function (d) { return d.i === state.hl; });
      paleKey.hidden = !share;
      svg.attr('aria-label', svgLabel());
    }

    /* interaction: hover (mouse), focus (keyboard, tap), arrow keys between years */
    var colNodes = cols.nodes();
    function ringNode(i) { return colNodes[i] ? colNodes[i].querySelector('.cg-ring') : null; }
    function setHL(i) { state.hl = i; hl.classed('is-on', function (d) { return d.i === i; }); }
    function setActive(i) {
      state.active = i;
      cols.attr('tabindex', function (d) { return d.i === i ? 0 : -1; });
    }
    cols
      .on('pointerenter', function (ev, d) {
        if (ev.pointerType && ev.pointerType !== 'mouse') return;
        setHL(d.i);
        tipShow('cg', tipHTML(d), ev);
      })
      .on('pointermove', function (ev) { if (!ev.pointerType || ev.pointerType === 'mouse') tipMove('cg', ev); })
      .on('pointerleave', function (ev, d) {
        if (ev.pointerType && ev.pointerType !== 'mouse') return;
        if (state.focus === d.i) { tipShow('cg', tipHTML(d), ringNode(d.i)); return; }
        setHL(state.focus);
        tipHide('cg');
      })
      .on('focus', function (ev, d) {
        state.focus = d.i;
        setActive(d.i);
        setHL(d.i);
        tipShow('cg', tipHTML(d), ringNode(d.i));
      })
      .on('blur', function (ev, d) {
        if (state.focus === d.i) state.focus = -1;
        setHL(-1);
        tipHide('cg');
      })
      .on('click', function () { if (document.activeElement !== this && this.focus) this.focus(); })
      .on('keydown', function (ev, d) {
        var n = colNodes.length, j = -1;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') j = Math.min(n - 1, d.i + 1);
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') j = Math.max(0, d.i - 1);
        else if (ev.key === 'Home') j = 0;
        else if (ev.key === 'End') j = n - 1;
        else if (ev.key === 'Escape') { tipHide('cg'); return; }
        if (j < 0) return;
        ev.preventDefault();
        if (j !== d.i && colNodes[j]) colNodes[j].focus();
      });

    /* milestones with their citations, then the source note and a table for screen readers */
    if (msData.length) {
      var ms = U.h('p', { class: 'cg-notes cg-milestones' });
      ms.innerHTML = '<span class="cg-notes-label">Milestones (cited works):</span> ' + msData.map(function (o) {
        return '<span class="cg-ms" data-year="' + esc(o.m.year) + '"><span class="cg-ms-y">' + esc(o.m.year) + '</span> ' + milestoneLinks(o.m) + '</span>';
      }).join('<span class="cg-sep" aria-hidden="true"> \u00b7 </span>');
      var msHL = function (e) {
        var it = closest(e.target, '.cg-ms[data-year]');
        if (it) setHL(years.indexOf(Number(it.getAttribute('data-year'))));
      };
      var msOut = function (e) {
        var it = closest(e.target, '.cg-ms[data-year]');
        if (it && !(e.relatedTarget && it.contains(e.relatedTarget))) setHL(state.focus);
      };
      ms.addEventListener('mouseover', msHL);
      ms.addEventListener('focusin', msHL);
      ms.addEventListener('mouseout', msOut);
      ms.addEventListener('focusout', msOut);
      root.appendChild(ms);
    }
    root.appendChild(sourceNote());
    root.appendChild(U.h('div', { class: 'sr-only', html: growthTableHTML(series) }));

    U.onResize(el, function (w) { layout(w); update(false); });
    /* the first draw may use fallback-font metrics (display=swap): measure the labels again once the fonts are in */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        msG.select('text').each(function () { this.__chW = 0; });
        partialLabel.node().__chW = 0;
        if (W) update(false);
      });
    }
  }

  /* ================================================================== 2. forgetting chart (#forgetting-chart, Figure 1b) */
  var FG_TOKENS = ['slate', 'sky', 'violet', 'teal', 'amber', 'coral'];   /* group colors in figure order */

  /* the row label as Figure 1b draws it (forget.tex): the learner, then the setting in gray */
  function learnerHTML(r) { return r.learner_html || esc(r.learner || ''); }
  function rowLabelHTML(r) {
    return '<span class="fg-name">' + learnerHTML(r) + '</span>' +
      (r.setting_short ? ' <span class="fg-set">' + esc(r.setting_short) + '</span>' : '');
  }
  function rowLabelText(r) { return (r.learner || '') + (r.setting_short ? ', ' + r.setting_short : ''); }
  /* ISO dates of version records in the date form used elsewhere on the page */
  function longDates(s) {
    return String(s || '').replace(/\b(\d{4}-\d{2}-\d{2})\b/g, function (m) { return U.fmtDate(m); });
  }

  function initForgetting() {
    var el = document.getElementById('forgetting-chart');
    if (!el) return;
    var F = D.forgetting;
    if (!F || !Array.isArray(F.rows) || !F.rows.length) return;
    /* the order of Figure 1b; rows are never sorted by the size of the drop */
    var rows = F.rows.slice().sort(function (a, b) { return (Number(a.row) || 0) - (Number(b.row) || 0); });
    var groups = Array.isArray(F.groups) ? F.groups.slice() : [];
    rows.forEach(function (r) {
      if (!groups.some(function (g) { return g.group === r.group; })) groups.push({ group: r.group, label: r.group_label || '' });
    });
    groups = groups.filter(function (g) { return rows.some(function (r) { return r.group === g.group; }); });
    var tokenOf = new Map(groups.map(function (g, i) { return [g.group, FG_TOKENS[i % FG_TOKENS.length]]; }));
    var groupLabel = new Map(groups.map(function (g) { return [g.group, g.label]; }));
    var beforeLabel = F.before_label || 'before', afterLabel = F.after_label || 'after';
    var figTag = 'Figure ' + (F.figure || 1) + (F.panel || '');
    var label = F.label || '';

    el.replaceChildren();
    var root = U.h('div', { class: 'fg' });
    el.appendChild(root);
    root.insertAdjacentHTML('beforeend',
      '<ul class="legend fg-legend" aria-label="Legend">' +
        '<li class="legend-item"><span class="fg-key fg-key-before" aria-hidden="true"></span>' + esc(beforeLabel) + '</li>' +
        '<li class="legend-item"><span class="fg-key fg-key-after" aria-hidden="true"></span>' + esc(afterLabel) + '</li>' +
      '</ul>');

    var detailId = uid('fg-detail');
    var body = U.h('div', { class: 'fg-body' });
    root.appendChild(body);
    var btns = [], tracks = [];
    var pinned = -1;

    function valuesText(r) {
      return fmtVal(r.before) + ' ' + beforeLabel + ', ' + fmtVal(r.after) + ' ' + afterLabel;
    }
    function rowAria(r) {
      return rowLabelText(r) + '. ' + valuesText(r) + (r.drop_label ? ' (' + r.drop_label + ')' : '') +
        '; ' + (r.unit || '') + '. Source: ' + (r.cite || '') + '.';
    }
    /* hover readout: the row, its values and drop, unit and source only; the metric and locator are in the details */
    function tipHTML(r) {
      return '<div class="fg-tip">' +
        '<p class="fg-tip-h"><b>' + learnerHTML(r) + '</b>' + (r.setting_short ? ' \u00b7 ' + esc(r.setting_short) : '') + '</p>' +
        '<p class="fg-tip-v">' + esc(valuesText(r)) + (r.drop_label ? ' <span class="fg-tip-drop">' + esc(r.drop_label) + '</span>' : '') + '</p>' +
        '<span class="tt-sub">' + esc([r.unit, r.cite].filter(Boolean).join(' \u00b7 ')) + '</span>' +
        '<span class="tt-sub">' + esc(label) + ' Select the row for the metric and the source.</span>' +
      '</div>';
    }
    function detailHTML(r) {
      var src = r.source_key
        ? '<a class="cite" href="#ref-' + esc(r.source_key) + '" data-key="' + esc(r.source_key) + '">' + esc(r.cite || r.source_key) + '</a>'
        : esc(r.cite || '');
      var items = [
        ['Setting', esc(r.setting || '')],
        ['Metric', r.metric_html || esc(r.metric || '')],
        ['Unit', esc(r.unit || '')],
        ['Values', esc(valuesText(r)) + (r.drop_label ? ' (' + esc(r.drop_label) + ')' : '') + (r.value_origin ? '. ' + esc(r.value_origin) : '')],
        ['Source', src + (r.source_version ? ', ' + esc(longDates(r.source_version)) : '')],
        ['Locator', r.locator_html || esc(r.locator || '')]
      ].filter(function (p) { return p[1]; });
      return '<div class="fg-d-head"><div class="fg-d-titles">' +
          '<p class="fg-d-kicker">' + esc(figTag) + ', row ' + esc(r.row) + ' \u00b7 ' + esc(groupLabel.get(r.group) || r.group_label || '') + '</p>' +
          '<p class="fg-d-title">' + rowLabelHTML(r) + '</p></div>' +
          '<button type="button" class="btn btn-sm fg-close">Hide details</button></div>' +
        '<dl class="kv fg-kv">' + items.map(function (p) { return '<dt>' + p[0] + '</dt><dd>' + p[1] + '</dd>'; }).join('') + '</dl>' +
        (label ? '<p class="fg-d-note">' + esc(label) + '</p>' : '');
    }

    var detail = U.h('div', { class: 'fg-detail', id: detailId, 'aria-live': 'polite' });
    function renderDetail() {
      var r = rows[pinned];
      detail.classList.toggle('is-open', !!r);
      if (!r) {
        detail.removeAttribute('style');
        detail.innerHTML = '<p class="fg-hint">Select a row to show its setting, metric, unit, source and locator here.</p>';
        return;
      }
      detail.setAttribute('style', '--gc: var(--' + tokenOf.get(r.group) + ')');
      detail.innerHTML = detailHTML(r);
      var close = detail.querySelector('.fg-close');
      if (close) {
        close.addEventListener('click', function () {
          var b = btns[pinned];
          pin(-1);
          if (b) b.focus();
        });
      }
    }
    function pin(i) {
      pinned = i;
      btns.forEach(function (b, k) {
        b.setAttribute('aria-expanded', String(k === i));
        b.classList.toggle('is-pinned', k === i);
      });
      renderDetail();
    }
    function bindRow(b, r, i) {
      b.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') tipShow('fg', tipHTML(r), b); });
      b.addEventListener('pointerleave', function (e) {
        if (e.pointerType !== 'mouse') return;
        if (document.activeElement === b && focusVisible(b)) return;
        tipHide('fg');
      });
      b.addEventListener('focus', function () { if (focusVisible(b)) tipShow('fg', tipHTML(r), b); });
      b.addEventListener('blur', function () { tipHide('fg'); });
      b.addEventListener('click', function () { tipHide('fg'); pin(pinned === i ? -1 : i); });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { tipHide('fg'); return; }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        var j = i + (e.key === 'ArrowDown' ? 1 : -1);
        if (j < 0 || j >= btns.length) return;
        e.preventDefault();
        btns[j].focus();
      });
    }

    /* column head of the drop values, at the top of their column */
    body.appendChild(U.h('div', { class: 'fg-colhead', 'aria-hidden': 'true', html: '<span></span><span class="fg-colhead-drop">drop</span>' }));
    groups.forEach(function (g) {
      var tok = tokenOf.get(g.group);
      var gid = uid('fg-g');
      var box = U.h('div', { class: 'fg-group', style: '--gc: var(--' + tok + '); --gi: ' + (tok === 'slate' ? 'var(--slate)' : 'var(--' + tok + '-ink)') });
      box.appendChild(U.h('p', { class: 'fg-gh', id: gid, text: g.label || '' }));
      var ul = U.h('ul', { class: 'fg-list', 'aria-labelledby': gid });
      rows.forEach(function (r, i) {
        if (r.group !== g.group) return;
        var b = U.h('button', { type: 'button', class: 'fg-row', 'aria-expanded': 'false', 'aria-controls': detailId, 'aria-label': rowAria(r) });
        b.innerHTML = '<span class="fg-label">' + rowLabelHTML(r) + (r.unit ? ' <span class="fg-unit">· ' + esc(r.unit).replace(' ', ' ') + '</span>' : '') + '</span>' +
          '<span class="fg-plot"><span class="fg-track" aria-hidden="true"></span><span class="fg-drop" aria-hidden="true">' + esc(r.drop_label || '') + '</span></span>';
        btns[i] = b;
        tracks[i] = b.querySelector('.fg-track');
        bindRow(b, r, i);
        ul.appendChild(U.h('li', null, b));
      });
      box.appendChild(ul);
      body.appendChild(box);
    });
    btns = btns.filter(Boolean);
    var axis = U.h('div', { class: 'fg-axis', 'aria-hidden': 'true', html: '<span class="fg-axis-track"></span><span></span>' });
    body.appendChild(axis);
    body.appendChild(U.h('p', { class: 'fg-axis-title', text: capFirst(F.value_label || 'earlier-task performance') + ', 0 to 100 (the unit differs by row)' }));
    root.appendChild(detail);
    renderDetail();

    var axisTrack = axis.querySelector('.fg-axis-track');
    function drawRow(host, r, tw, X) {
      host.replaceChildren();
      var s = svgEl('svg', { viewBox: '0 0 ' + tw + ' 24', width: tw, height: 24, focusable: 'false' }, host);
      var cy = 12, R = 5.5, xb = X(r.before), xa = X(r.after);
      var dir = xa <= xb ? 1 : -1;                         /* +1: the arrow points left, toward the lower "after" value */
      var tip = xa + dir * (R + 1.5);
      svgEl('line', { class: 'fg-base', x1: X(0), x2: X(100), y1: cy, y2: cy }, s);
      svgEl('line', { class: 'fg-link', x1: xb - dir * (R + 1), x2: tip + dir * 7, y1: cy, y2: cy }, s);
      svgEl('path', { class: 'fg-head', d: 'M' + tip.toFixed(1) + ',' + cy + 'l' + (dir * 8) + ',-4.5v9z' }, s);
      svgEl('circle', { class: 'fg-before', cx: xb.toFixed(1), cy: cy, r: R }, s);
      svgEl('circle', { class: 'fg-after', cx: xa.toFixed(1), cy: cy, r: R }, s);
      svgEl('text', { class: 'fg-val', x: (xa - dir * (R + 4)).toFixed(1), y: cy, dy: '0.34em', 'text-anchor': dir > 0 ? 'end' : 'start', text: fmtVal(r.after) }, s);
      svgEl('text', { class: 'fg-val', x: (xb + dir * (R + 4)).toFixed(1), y: cy, dy: '0.34em', 'text-anchor': dir > 0 ? 'start' : 'end', text: fmtVal(r.before) }, s);
    }
    function drawAxis(host, tw, X) {
      host.replaceChildren();
      var s = svgEl('svg', { viewBox: '0 0 ' + tw + ' 20', width: tw, height: 20, focusable: 'false' }, host);
      svgEl('line', { class: 'fg-axis-line', x1: X(0), x2: X(100), y1: 0.5, y2: 0.5 }, s);
      [0, 25, 50, 75, 100].forEach(function (v) {
        svgEl('line', { class: 'fg-tick', x1: X(v), x2: X(v), y1: 0, y2: 4 }, s);
        svgEl('text', { class: 'fg-tick-label', x: X(v), y: 16, 'text-anchor': 'middle', text: v }, s);
      });
    }
    function draw() {
      var tw = Math.round(tracks[0] ? tracks[0].getBoundingClientRect().width : 0);
      if (!tw) return;
      var x0 = 30, x1 = Math.max(x0 + 60, tw - 36);
      var X = function (v) { return x0 + ((x1 - x0) * Math.max(0, Math.min(100, Number(v) || 0))) / 100; };
      rows.forEach(function (r, i) { if (tracks[i]) drawRow(tracks[i], r, tw, X); });
      drawAxis(axisTrack, tw, X);
    }
    U.onResize(root, draw);
  }

  /* ================================================================== 3. evaluation pyramid (#eval-pyramid, Section 9.4) */
  var EP_TOKENS = ['slate', 'teal', 'amber', 'coral', 'violet'];   /* L1 to L5, as in Figure 10b */

  /* wraps a label into tspans of at most maxW px, vertically centered on the text element's y */
  function wrapSvgText(t, str, maxW) {
    var words = String(str).split(/\s+/).filter(Boolean);
    var xAttr = t.getAttribute('x');
    var probe = svgEl('tspan', null, t);
    var width = function (s) {
      probe.textContent = s;
      var w = 0;
      try { w = probe.getComputedTextLength(); } catch (e) { w = 0; }
      return w || s.length * 6.6;
    };
    var lines = [], cur = '';
    words.forEach(function (w) {
      var test = cur ? cur + ' ' + w : w;
      if (!cur || width(test) <= maxW) cur = test;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    t.removeChild(probe);
    lines.forEach(function (ln, i) {
      svgEl('tspan', { x: xAttr, dy: i === 0 ? (((1 - lines.length) * 0.6) + 0.35).toFixed(2) + 'em' : '1.2em', text: ln }, t);
    });
    return lines.length;
  }

  function initPyramid() {
    var el = document.getElementById('eval-pyramid');
    if (!el) return;
    var E = D.evaluation;
    if (!E || !Array.isArray(E.levels) || !E.levels.length) return;
    var levels = E.levels;
    var n = levels.length;
    var benchByKey = new Map((D.benchmarks || []).map(function (b) { return [b.key, b]; }));
    var fig = E.figure != null ? (U.figure('fig' + E.figure) || U.figure(E.figure)) : null;
    var state = { sel: 0, hover: -1 };
    var tabIds = levels.map(function () { return uid('ep-tab'); });
    var panelId = uid('ep-panel');

    el.replaceChildren();
    var root = U.h('div', { class: 'ep' });
    var grid = U.h('div', { class: 'ep-grid' });
    var figBox = U.h('div', { class: 'ep-figure' });
    var panel = U.h('div', { class: 'ep-detail', id: panelId, role: 'tabpanel', tabindex: '0' });
    grid.appendChild(figBox);
    grid.appendChild(panel);
    root.appendChild(grid);
    el.appendChild(root);
    var groups = [];

    function levelTip(L) {
      return '<b>' + esc(L.level) + '</b> \u00b7 ' + esc(L.name) +
        (L.certifies ? '<span class="tt-sub">Certifies ' + esc(L.certifies) + '.</span>' : '');
    }
    function renderPanel() {
      var k = state.sel, L = levels[k];
      var keys = L.benchmarks || [];
      var chips = keys.map(function (key) {
        var b = benchByKey.get(key), r = U.ref(key);
        var name = b ? b.name : (r ? r.cite : key);
        var meta = [(b && b.venue_short) || (r && r.venue_short), b ? b.year : (r && r.year)].filter(Boolean).join(' ');
        return '<li><a class="cite ep-bench" href="#ref-' + esc(key) + '" data-key="' + esc(key) + '">' + esc(name) + '</a>' +
          (meta ? '<span class="ep-bench-meta">' + esc(meta) + '</span>' : '') + '</li>';
      }).join('');
      var where = E.section ? ' (Section ' + esc(E.section) + ')' : '';
      var bench = keys.length
        ? '<p class="ep-sub">' + (L.benchmarks_partial ? 'Native benchmarks that add a single L3 property' : 'Native benchmarks placed at this level') + where + '</p>' +
          '<ul class="ep-bench-list">' + chips + '</ul>'
        : '<p class="ep-sub ep-none">' + (E.section ? 'Section ' + esc(E.section) : 'The text') + ' places no native benchmark at this level.</p>';
      panel.setAttribute('aria-labelledby', tabIds[k]);
      panel.innerHTML =
        '<p class="ep-kicker">Level ' + (k + 1) + ' of ' + n + (E.section ? ' \u00b7 Section ' + esc(E.section) : '') + '</p>' +
        '<h3 class="ep-title"><span class="ep-badge" style="--lc: var(--' + EP_TOKENS[k % EP_TOKENS.length] + ')">' + esc(L.level) + '</span>' +
          '<span>' + esc(capFirst(L.name)) + '</span></h3>' +
        '<p class="ep-sentence">' + U.rich(L.sentence) + '</p>' + bench +
        (fig ? '<p class="ep-foot"><button type="button" class="btn-link" data-zoom="' + esc(fig.id) + '">' + U.icon('zoom-in') +
          'Figure ' + esc(fig.n) + ' in the figure viewer</button></p>' : '');
    }
    function applySel() {
      groups.forEach(function (g, k) {
        if (!g) return;
        var on = k === state.sel;
        g.setAttribute('aria-selected', String(on));
        g.setAttribute('tabindex', on ? '0' : '-1');
        g.setAttribute('class', 'ep-level' + (on ? ' is-selected' : ''));
      });
    }
    function select(k, focus) {
      k = Math.max(0, Math.min(n - 1, k));
      if (k !== state.sel) { state.sel = k; applySel(); renderPanel(); }
      if (focus && groups[k]) groups[k].focus();
    }
    function drawArrows(s, H) {
      var g = svgEl('g', { class: 'ep-arrows', 'aria-hidden': 'true' }, s);
      var y0 = 14, y1 = H - 14, mid = H / 2;
      svgEl('line', { class: 'ep-arrow', x1: 9, x2: 9, y1: y1, y2: y0 + 8 }, g);
      svgEl('path', { class: 'ep-arrow-head', d: 'M9,' + y0 + 'l-5,9h10z' }, g);
      svgEl('text', { x: 0, y: 0, transform: 'translate(24,' + mid + ') rotate(-90)', 'text-anchor': 'middle', text: 'difficulty and realism' }, g);
      svgEl('line', { class: 'ep-arrow is-light', x1: 34, x2: 34, y1: y0, y2: y1 - 8 }, g);
      svgEl('path', { class: 'ep-arrow-head is-light', d: 'M34,' + y1 + 'l-5,-9h10z' }, g);
      svgEl('text', { x: 0, y: 0, transform: 'translate(49,' + mid + ') rotate(-90)', 'text-anchor': 'middle', text: 'available evidence' }, g);
    }
    var lastW = 0;
    function draw(w) {
      lastW = w;
      var SW = Math.round(w);
      var arrows = SW >= 420;
      var padL = arrows ? 60 : 4, padT = 6, padB = 6, gap = 4;
      var NW = SW >= 300 ? Math.round(Math.min(230, Math.max(128, SW * 0.4))) : 0;
      var px0 = padL, px1 = SW - NW - (NW ? 12 : 4);
      var BW = Math.max(80, px1 - px0), AW = BW * 0.3, cx = px0 + BW / 2;
      var H = Math.round(Math.max(250, Math.min(380, SW * 0.74)));
      var lh = (H - padT - padB - gap * (n - 1)) / n;
      var yb = H - padB, ya = padT;
      var widthAt = function (yy) { return AW + ((BW - AW) * (yy - ya)) / (yb - ya); };
      var hadFocus = figBox.contains(document.activeElement);   /* a redraw on resize keeps keyboard focus */
      figBox.replaceChildren();
      var s = svgEl('svg', {
        class: 'ep-svg', viewBox: '0 0 ' + SW + ' ' + H, width: SW, height: H, role: 'tablist',
        'aria-label': 'Evaluation difficulty levels, L1 at the base', 'aria-orientation': 'vertical'
      }, figBox);
      if (arrows) drawArrows(s, H);
      groups = [];
      for (var k = n - 1; k >= 0; k--) {   /* document order follows the picture, top to bottom: L5 first */
        var L = levels[k];
        var y1 = yb - k * (lh + gap), y0 = y1 - lh, my = (y0 + y1) / 2;
        var wt = widthAt(y0), wb = widthAt(y1);
        var g = svgEl('g', {
          class: 'ep-level', role: 'tab', id: tabIds[k], tabindex: '-1', 'aria-selected': 'false',
          'aria-controls': panelId, 'aria-label': L.level + ': ' + L.name, 'data-i': k,
          style: '--lc: var(--' + EP_TOKENS[k % EP_TOKENS.length] + ')'
        }, s);
        svgEl('rect', { class: 'ep-hit', x: px0, y: y0, width: SW - px0, height: lh }, g);
        svgEl('polygon', {
          class: 'ep-shape',
          points: [[cx - wb / 2, y1], [cx + wb / 2, y1], [cx + wt / 2, y0], [cx - wt / 2, y0]]
            .map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ')
        }, g);
        svgEl('rect', { class: 'ep-pill', x: (cx - 17).toFixed(1), y: (my - 11).toFixed(1), width: 34, height: 22, rx: 6 }, g);
        svgEl('text', { class: 'ep-code', x: cx.toFixed(1), y: my.toFixed(1), dy: '0.35em', 'text-anchor': 'middle', text: L.level }, g);
        if (NW) {
          var edge = cx + widthAt(my) / 2, tx = edge + 14;
          svgEl('line', { class: 'ep-leader', x1: (edge + 3).toFixed(1), x2: (tx - 4).toFixed(1), y1: my.toFixed(1), y2: my.toFixed(1) }, g);
          var t = svgEl('text', { class: 'ep-name', x: tx.toFixed(1), y: my.toFixed(1) }, g);
          wrapSvgText(t, capFirst(L.name), Math.max(60, SW - tx - 4));
        }
        groups[k] = g;
      }
      applySel();
      if (hadFocus && groups[state.sel]) groups[state.sel].focus();
    }

    figBox.addEventListener('click', function (e) {
      var g = closest(e.target, '.ep-level');
      if (g) select(Number(g.getAttribute('data-i')), true);
    });
    figBox.addEventListener('keydown', function (e) {
      var g = closest(e.target, '.ep-level');
      if (!g) return;
      var k = Number(g.getAttribute('data-i')), j;
      switch (e.key) {
        case 'ArrowUp': case 'ArrowRight': j = k + 1; break;     /* up the pyramid: the previous tab in document order */
        case 'ArrowDown': case 'ArrowLeft': j = k - 1; break;
        case 'Home': j = n - 1; break;                             /* first tab: L5 at the top */
        case 'End': j = 0; break;
        case 'Enter': case ' ': j = k; break;
        default: return;
      }
      e.preventDefault();
      select(j, true);
    });
    figBox.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var g = closest(e.target, '.ep-level');
      if (!g) { state.hover = -1; tipHide('ep'); return; }
      var k = Number(g.getAttribute('data-i'));
      if (k !== state.hover || tipOwner !== 'ep') { state.hover = k; tipShow('ep', levelTip(levels[k]), e); }
      else tipMove('ep', e);
    });
    figBox.addEventListener('pointerleave', function () { state.hover = -1; tipHide('ep'); });
    figBox.addEventListener('focusout', function () { tipHide('ep'); });

    renderPanel();
    U.onResize(figBox, draw);
    /* labels are wrapped with measured widths: wrap them again once the web fonts are in (display=swap) */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (lastW) draw(lastW); });
  }

  /* ================================================================== 4. taxonomy tree (#taxonomy-tree, interactive Figure 2) */
  function normText(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.replace(/[\u2019\u2018]/g, "'").replace(/\u0142/g, 'l').replace(/\u00f8/g, 'o');
  }

  function initTaxonomy() {
    var el = document.getElementById('taxonomy-tree');
    if (!el) return;
    var T = D.taxonomy;
    if (!T || !Array.isArray(T.branches) || !T.branches.length) return;
    var leaves = Array.isArray(T.leaves) ? T.leaves : [];
    var studies = new Map((D.studies || []).map(function (s) { return [s.key, s]; }));
    var bench = new Map((D.benchmarks || []).map(function (b) { return [b.key, b]; }));
    var evName = (D.vocab && D.vocab.evidence) || { D: 'Direct', P: 'Partial', A: 'Adjacent', NG: 'Not graded' };
    var hasExplorer = !!NS.modules.explorer;
    var subLabel = new Map(), subTitle = new Map();
    T.branches.forEach(function (b) { (b.subs || []).forEach(function (s) { subLabel.set(s.id, s.label); subTitle.set(s.id, s.title); }); });
    var bySub = new Map(), leafById = new Map();
    leaves.forEach(function (l) {
      if (!bySub.has(l.sub)) bySub.set(l.sub, []);
      bySub.get(l.sub).push(l);
      leafById.set(l.id, l);
    });
    var xrefsFrom = new Map(), exemplarOf = new Map();
    (T.xrefs || []).forEach(function (x) {
      if (!xrefsFrom.has(x.from)) xrefsFrom.set(x.from, []);
      xrefsFrom.get(x.from).push(x);
      (x.keys || []).forEach(function (k) {
        var id = x.to + ':' + k;
        if (!exemplarOf.has(id)) exemplarOf.set(id, []);
        exemplarOf.get(id).push(x.from);
      });
    });
    var subName = function (id) { return id + ' ' + (subLabel.get(id) || ''); };
    var leafName = function (sub, key) { var l = leafById.get(sub + ':' + key); return l ? l.name : key; };

    function evOf(l) {
      if (l.kind === 'study') return l.evidence || 'NG';
      var s = studies.get(l.key);
      return l.kind !== 'benchmark' && s ? (s.evidence || 'NG') : null;
    }
    function leafTip(l) {
      var s = studies.get(l.key), r = U.ref(l.key);
      var who = (s && s.cite) || (r && r.cite) || '';
      var title = (s && s.title) || (r && r.title) || '';
      var head = who && title ? who + ': ' + title : who || title;
      var parts = [head + (/[.?!]$/.test(head) ? '' : '.')];
      if (l.kind === 'benchmark') parts.push(s ? 'Benchmark, also a coded study (evidence: ' + (evName[s.evidence || 'NG'] || s.evidence) + ').' : 'Benchmark.');
      else if (s) parts.push('Evidence: ' + (evName[evOf(l)] || evOf(l)) + '.');
      else if (l.kind === 'general') parts.push('General continual learning exemplar.');
      if (l.general_tag && s) parts.push('Gray tag: not an embodied study.');
      var ex = exemplarOf.get(l.id);
      if (ex && ex.length) parts.push('Embodied exemplar of ' + ex.map(subName).join(', ') + '.');
      parts.push(s ? (hasExplorer ? 'Select for the study details.' : 'Select for the reference.') : 'Select for the reference.');
      return parts.join(' ');
    }
    function leafHTML(l) {
      var s = studies.get(l.key);
      var ev = evOf(l);
      var cls = 'tx-leaf' + (l.general_tag ? ' is-gen' : '') + (l.kind === 'benchmark' ? ' is-bench' : '');
      var inner = (ev && l.kind !== 'benchmark' ? '<span class="tx-dot ev-' + esc(ev) + '" aria-hidden="true"></span>' : '') +
        '<span class="tx-name">' + esc(l.name) + '</span>' +
        (l.year_tag ? '<span class="tx-yr" aria-hidden="true">' + esc(l.year_tag) + '</span><span class="sr-only"> ' + esc(l.year) + '</span>' : '') +
        (l.preprint ? '<span class="tx-pre" aria-hidden="true">\u2020</span><span class="sr-only">, preprint</span>' : '') +
        (ev && l.kind !== 'benchmark' ? '<span class="sr-only">, ' + esc(ev === 'NG' ? 'not graded' : (evName[ev] || ev).toLowerCase() + ' evidence') + '</span>' : '');
      var common = ' data-leaf="' + esc(l.id) + '" data-key="' + esc(l.key) + '" data-tip="' + esc(leafTip(l)) + '"';
      if (s) return '<li><button type="button" class="' + cls + '"' + common + '>' + inner + '</button></li>';
      return '<li><a class="' + cls + ' cite" href="#ref-' + esc(l.key) + '"' + common + '>' + inner + '</a></li>';
    }
    function pvHTML(l) {
      var ev = evOf(l);
      if (l.kind === 'benchmark') return '<span class="tx-pv-dot is-bench"></span>';
      if (l.kind === 'general') return '<span class="tx-pv-dot is-gen"></span>';
      return '<span class="tx-pv-dot ev-' + esc(ev || 'NG') + '"></span>';
    }
    function subHTML(sub) {
      var ls = bySub.get(sub.id) || [];
      var xs = xrefsFrom.get(sub.id) || [];
      var inner = '<span class="tx-snum">' + esc(sub.id) + '</span><span class="tx-sname">' + esc(sub.label) + '</span>';
      var label = U.pageTarget(sub.id)
        ? '<button type="button" class="tx-slabel" data-goto-section="' + esc(sub.id) + '" data-tip="' +
            esc('Section ' + sub.id + ': ' + (sub.title || sub.label) + '. Select to go to this part of the page.') + '">' + inner + '</button>'
        : '<span class="tx-slabel" data-tip="' + esc('Section ' + sub.id + ': ' + (sub.title || sub.label)) + '">' + inner + '</span>';
      var xref = xs.length
        ? '<div class="tx-xrefs"><span class="sr-only">Embodied exemplars filed under: </span>' + xs.map(function (x) {
            var names = (x.keys || []).map(function (k) { return leafName(x.to, k); }).join(', ');
            var lab = 'Embodied exemplar in ' + subName(x.to) + ': ' + names;
            return '<button type="button" class="tx-xref" data-to="' + esc(x.to) + '" data-keys="' + esc((x.keys || []).join(' ')) + '" data-tip="' +
              esc(lab + '. Select to go to it.') + '" aria-label="' + esc(lab + '. Go to it in the tree.') + '"><span aria-hidden="true">\u2192</span>' + esc(x.to) + '</button>';
          }).join('') + '</div>'
        : '';
      return '<li class="tx-sub" data-sub="' + esc(sub.id) + '">' + label +
        '<ul class="tx-leaves" aria-label="' + esc(subName(sub.id)) + '">' + ls.map(leafHTML).join('') + '</ul>' + xref + '</li>';
    }
    var TOKENS = { slate: 1, sky: 1, teal: 1, amber: 1, coral: 1, violet: 1 };
    function branchHTML(b) {
      var tok = TOKENS[b.color] ? b.color : 'slate';      /* only known palette tokens reach the style attribute */
      var light = tok === 'slate' ? 'var(--gray)' : 'var(--' + tok + '-light)';
      var ink = tok === 'slate' ? 'var(--slate)' : 'var(--' + tok + '-ink)';
      var bodyId = uid('tx-body');
      var bl = [];
      (b.subs || []).forEach(function (s) { (bySub.get(s.id) || []).forEach(function (l) { bl.push(l); }); });
      /* no table icon on the branches: those icons mean mechanism families, domains or programs in the paper */
      return '<li class="tx-branch" data-branch="' + esc(b.id) + '" style="--bc: var(--' + tok + '); --bl: ' + light + '; --bi: ' + ink + '">' +
        '<h3 class="tx-bh"><button type="button" class="tx-btoggle" aria-expanded="false" aria-controls="' + bodyId + '">' +
          '<span class="tx-bnum" aria-hidden="true">' + esc(b.id) + '</span>' +
          '<span class="tx-btext"><span class="tx-bname"><span class="sr-only">Section ' + esc(b.id) + ': </span>' + esc(b.name) + '</span>' +
            '<span class="tx-btitle">' + esc(b.section_title || '') + '</span></span>' +
          '<span class="tx-pv" aria-hidden="true">' + bl.map(pvHTML).join('') + '</span>' +
          U.icon('chev-down', 'tx-chev') +
        '</button></h3>' +
        '<div class="tx-body" id="' + bodyId + '" hidden><ul class="tx-subs">' + (b.subs || []).map(subHTML).join('') + '</ul></div>' +
      '</li>';
    }

    var searchId = uid('tx-search'), readId = uid('tx-read');
    var HINT = 'Select a branch to open it. ' + (hasExplorer ? 'Select a study for its coded details; other leaves open their reference.' : 'Select a leaf for its reference.');
    el.replaceChildren();
    var root = U.h('div', { class: 'tx' });
    root.innerHTML =
      '<div class="tx-bar">' +
        '<label class="field grow tx-field" for="' + searchId + '"><span class="field-label">Search the taxonomy</span>' +
          '<span class="search">' + U.icon('search') + '<input class="input" id="' + searchId + '" type="search" autocomplete="off" spellcheck="false" ' +
          'placeholder="Method, benchmark, author or year" aria-describedby="' + readId + '"></span></label>' +
        '<div class="tx-actions"><button type="button" class="btn btn-sm" data-tx-all="open">Expand all</button>' +
          '<button type="button" class="btn btn-sm" data-tx-all="close">Collapse all</button></div>' +
      '</div>' +
      '<p class="readout tx-readout" id="' + readId + '" aria-live="polite"></p>' +
      '<ul class="legend tx-legend" aria-label="Legend of the tree">' +
        ['D', 'P', 'A', 'NG'].map(function (c) {
          return '<li class="legend-item"><span class="tx-dot ev-' + c + '" aria-hidden="true"></span>' + esc((evName[c] || c).toLowerCase()) + '</li>';
        }).join('') +
        '<li class="legend-item"><span class="tx-key-gen" aria-hidden="true"></span>general continual learning exemplar</li>' +
        '<li class="legend-item">no dot: benchmark</li>' +
        '<li class="legend-item"><span aria-hidden="true">\u2020</span>&nbsp;preprint</li>' +
        '<li class="legend-item"><span aria-hidden="true">\u2192</span>&nbsp;sub-branches with embodied exemplars</li>' +
      '</ul>' +
      '<div class="tx-tree"><p class="tx-trunk"><span>' + esc(T.trunk || '') + '</span></p>' +
        '<ul class="tx-branches">' + T.branches.map(branchHTML).join('') + '</ul></div>';
    el.appendChild(root);

    var tree = root.querySelector('.tx-branches');
    var input = root.querySelector('input[type="search"]');
    var readout = root.querySelector('.tx-readout');
    var branchLis = U.$$('.tx-branch', tree);
    var leafEls = U.$$('.tx-leaf', tree);
    var subEls = U.$$('.tx-slabel', tree);
    var index = leafEls.map(function (a) {
      var l = leafById.get(a.getAttribute('data-leaf')) || {};
      var s = studies.get(l.key), r = U.ref(l.key), b = bench.get(l.key);
      return normText([l.name, l.key, l.year, l.year_tag, s && s.cite, s && s.title, s && s.short_name, s && s.venue_short,
        s && s.benchmark_short, r && r.title, r && r.cite, r && (r.authors || []).join(' '), r && r.venue_short, b && b.name]
        .filter(Boolean).join(' | '));
    });
    var subIndex = subEls.map(function (x) {
      var id = x.closest('.tx-sub').getAttribute('data-sub');
      return normText(id + ' ' + (subLabel.get(id) || '') + ' ' + (subTitle.get(id) || ''));
    });

    function setOpen(li, open) {
      var btn = li.querySelector('.tx-btoggle'), bd = li.querySelector('.tx-body');
      btn.setAttribute('aria-expanded', String(open));
      bd.hidden = !open;
      li.classList.toggle('is-open', open);
    }
    var saved = null;   /* open branches before a search, restored when the search is cleared */
    var announce = U.debounce(function (msg) { readout.textContent = msg; }, 250);
    function runSearch() {
      var raw = input.value.trim();
      var q = normText(raw);
      var terms = q.split(/\s+/).filter(Boolean);
      if (!terms.length || (q.length < 2 && !/\d/.test(q))) { clearSearch(); return; }
      if (!saved) saved = branchLis.map(function (li) { return li.classList.contains('is-open'); });
      var hits = 0, hitBranches = new Set();
      leafEls.forEach(function (a, i) {
        var ok = terms.every(function (t) { return index[i].indexOf(t) >= 0; });
        a.classList.toggle('is-match', ok);
        a.classList.toggle('is-dim', !ok);
        if (ok) { hits += 1; hitBranches.add(a.closest('.tx-branch')); }
      });
      subEls.forEach(function (x, i) {
        var ok = terms.every(function (t) { return subIndex[i].indexOf(t) >= 0; });
        x.classList.toggle('is-match', ok);
        if (ok) hitBranches.add(x.closest('.tx-branch'));
      });
      branchLis.forEach(function (li) {
        var hit = hitBranches.has(li);
        setOpen(li, hit);
        li.classList.toggle('no-hit', !hit);
      });
      tree.classList.add('is-searching');
      announce(hits
        ? hits + ' of ' + leafEls.length + ' leaves match \u201c' + raw + '\u201d. Press Enter to go to the first.'
        : 'No leaf matches \u201c' + raw + '\u201d.');
    }
    function clearSearch() {
      if (!tree.classList.contains('is-searching')) { announce(HINT); return; }
      leafEls.forEach(function (a) { a.classList.remove('is-match', 'is-dim'); });
      subEls.forEach(function (x) { x.classList.remove('is-match'); });
      branchLis.forEach(function (li) { li.classList.remove('no-hit'); });
      tree.classList.remove('is-searching');
      if (saved) branchLis.forEach(function (li, i) { setOpen(li, saved[i]); });
      saved = null;
      announce(HINT);
    }
    function goXref(btn) {
      var to = btn.getAttribute('data-to') || '';
      var keys = (btn.getAttribute('data-keys') || '').split(/\s+/).filter(Boolean);
      var li = branchLis.filter(function (x) { return x.getAttribute('data-branch') === to.split('.')[0]; })[0];
      if (li) setOpen(li, true);
      var targets = keys.map(function (k) { return tree.querySelector('[data-leaf="' + to + ':' + k + '"]'); }).filter(Boolean);
      if (!targets.length) return;
      U.tooltip.hide();
      U.scrollToEl(targets[0], { block: 'center' });
      targets.forEach(function (t) { U.flash(t); });
    }

    root.addEventListener('click', function (e) {
      var all = closest(e.target, '[data-tx-all]');
      if (all) {
        var open = all.getAttribute('data-tx-all') === 'open';
        branchLis.forEach(function (li) { setOpen(li, open); });
        if (saved) saved = branchLis.map(function () { return open; });
        return;
      }
      var t = closest(e.target, 'button, a');
      if (!t || !tree.contains(t)) return;
      if (t.classList.contains('tx-btoggle')) { setOpen(t.closest('.tx-branch'), t.getAttribute('aria-expanded') !== 'true'); return; }
      if (t.classList.contains('tx-xref')) { e.preventDefault(); goXref(t); return; }
      if (t.matches('button.tx-leaf[data-key]')) {
        U.tooltip.hide();
        if (NS.modules.explorer) U.emit('study:open', { key: t.getAttribute('data-key'), opener: t });
        else U.openReference(t);
      }
      /* a.cite leaves and section labels ([data-goto-section]) are handled by the shell */
    });
    input.addEventListener('input', runSearch);
    input.addEventListener('search', runSearch);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; clearSearch(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var first = tree.querySelector('.tx-leaf.is-match');
        if (first) U.scrollToEl(first, { block: 'center' });
      }
    });

    readout.textContent = HINT;
    if (branchLis[0]) setOpen(branchLis[0], true);
  }

  /* ================================================================== 5. evidence profile (settings tabs, shell hook) */
  var EV_CODES = ['D', 'P', 'A', 'NG'];
  function evidenceProfile(el, axis) {
    if (!el) return;
    U = U || NS.util;
    D = D || NS.data;
    if (!U || !D) return;
    var studies = (D.studies || []).filter(function (s) { return s.primary_axis === axis; });
    var evName = (D.vocab && D.vocab.evidence) || { D: 'Direct', P: 'Partial', A: 'Adjacent', NG: 'Not graded' };
    var total = studies.length;
    var counts = EV_CODES.map(function (c) {
      return { code: c, label: evName[c] || c, n: studies.filter(function (s) { return (s.evidence || 'NG') === c; }).length };
    });
    var ax = U.axis(axis);
    var axName = ((ax && ax.name) || axis).toLowerCase();
    /* Sec. 2.3: feedback is supervision, not a fourth axis of change */
    var filedUnder = axis === 'F' ? 'filed under feedback' : 'filed under the ' + axName + ' axis';
    var canFilter = !!NS.modules.explorer;

    el.replaceChildren();
    if (!total) { el.appendChild(U.h('p', { class: 'empty', text: 'No coded study is ' + filedUnder + '.' })); return; }
    var root = U.h('div', { class: 'evp' });
    var bar = U.h('div', { class: 'evp-bar' });
    var list = U.h('ul', { class: 'evp-legend', 'aria-label': 'Evidence grades of the studies ' + filedUnder });
    counts.forEach(function (c) {
      var inner = '<span class="badge badge-lg ev-' + c.code + '" aria-hidden="true">' + c.code + '</span>' +
        '<span class="evp-name">' + esc(c.label) + '</span><span class="evp-n">' + c.n + '</span>' +
        '<span class="evp-pct">' + pct(c.n, total) + '%</span>';
      var item = canFilter && c.n
        ? U.h('button', { type: 'button', class: 'evp-item', 'data-ev': c.code, html: inner,
            'aria-label': c.label + ': ' + c.n + ' of ' + total + ' studies. Show them in the evidence explorer.' })
        : U.h('span', { class: 'evp-item' + (c.n ? '' : ' is-zero'), html: inner });
      list.appendChild(U.h('li', null, item));
    });
    root.appendChild(bar);
    root.appendChild(list);
    /* the shares describe the coded sample, not the field: the Sec. 1.3 caveat on purposive selection */
    var sel = D.grading && D.grading.selection_note;
    if (sel && (sel.html || sel.text)) {
      root.appendChild(U.h('p', { class: 'evp-note', html: U.rich(sel).replace(/\.\s*$/, '') + ' (Section 1.3).' }));
    }
    if (canFilter) root.appendChild(U.h('p', { class: 'evp-hint', text: 'Select a grade to list these studies in the evidence explorer.' }));
    el.appendChild(root);

    var filter = function (code) { tipHide('evp'); U.emit('explorer:filter', { axis: axis, evidence: code, reset: true }); };
    var segTip = function (c) {
      return '<b>' + esc(c.label) + '</b>: ' + c.n + ' of ' + total + ' studies ' + esc(filedUnder) + ' (' + pct(c.n, total) + '%)' +
        (canFilter ? '<span class="tt-sub">Select to list them in the evidence explorer.</span>' : '');
    };
    list.addEventListener('click', function (e) {
      var b = closest(e.target, 'button[data-ev]');
      if (b) filter(b.getAttribute('data-ev'));
    });
    var hoverCode = null;
    bar.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var g = closest(e.target, '.evp-seg');
      var c = g && counts.filter(function (x) { return x.code === g.getAttribute('data-ev'); })[0];
      if (!c) { hoverCode = null; tipHide('evp'); return; }
      if (c.code !== hoverCode || tipOwner !== 'evp') { hoverCode = c.code; tipShow('evp', segTip(c), e); }
      else tipMove('evp', e);
    });
    bar.addEventListener('pointerleave', function () { hoverCode = null; tipHide('evp'); });
    bar.addEventListener('click', function (e) {
      var g = closest(e.target, '.evp-seg');
      if (g && canFilter) filter(g.getAttribute('data-ev'));
    });

    function drawBar(w) {
      var W = Math.max(120, Math.round(w)), H = 30;
      bar.replaceChildren();
      var s = svgEl('svg', {
        viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img',
        'aria-label': 'Evidence grades of the ' + total + ' studies ' + filedUnder + ': ' +
          counts.map(function (c) { return c.label + ' ' + c.n; }).join(', ') + '.'
      }, bar);
      var clipId = uid('evp-clip');
      var cp = svgEl('clipPath', { id: clipId }, svgEl('defs', null, s));
      svgEl('rect', { x: 0.5, y: 0.5, width: W - 1, height: H - 1, rx: 7 }, cp);
      var g = svgEl('g', { 'clip-path': 'url(#' + clipId + ')' }, s);
      var x0 = 0;
      counts.forEach(function (c) {
        if (!c.n) return;
        var w2 = (W * c.n) / total;
        var seg = svgEl('g', { class: 'evp-seg ev-' + c.code + (canFilter ? ' is-link' : ''), 'data-ev': c.code }, g);
        svgEl('rect', { x: x0.toFixed(2), y: 0, width: w2.toFixed(2), height: H }, seg);
        if (w2 >= 22) svgEl('text', { x: (x0 + w2 / 2).toFixed(1), y: H / 2, dy: '0.35em', 'text-anchor': 'middle', text: c.code }, seg);
        x0 += w2;
      });
      svgEl('rect', { class: 'evp-frame', x: 0.5, y: 0.5, width: W - 1, height: H - 1, rx: 7 }, s);
    }
    U.onResize(bar, drawBar);
  }

  /* ================================================================== registration */
  NS.modules.charts = {
    init: function () {
      U = NS.util;
      D = NS.data;
      if (!U || !D) return;
      window.addEventListener('scroll', tipOnScroll, { passive: true });
      /* Escape dismissed the shared readout (shell): forget its owner as well */
      U.on('tooltip:dismiss', function () { tipOwner = null; tipAt = null; });
      [['growth chart', initGrowth], ['forgetting chart', initForgetting], ['evaluation pyramid', initPyramid], ['taxonomy tree', initTaxonomy]]
        .forEach(function (p) {
          try { p[1](); } catch (err) { report(p[0], err); }
        });
    },
    evidenceProfile: function (el, axis) {
      try { evidenceProfile(el, axis); } catch (err) { report('evidence profile ' + axis, err); }
    }
  };
})();
