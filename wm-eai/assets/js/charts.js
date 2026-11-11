/* Learned policy evaluators: scatter of reported Pearson r against policies or checkpoints validated (survey Fig. 8),
   drawn with D3 at the container's pixel width, at least 640 px (the CSS min-width of .chart, so that phones scroll the
   chart instead of shrinking its text); plus a data table and a summary. */
(() => {
  'use strict';
  const D = window.WM_DATA, { $, esc, fmt, word, updateScrollRegions } = window.WM;
  const E = D.evaluators;
  const el = $('#evalChart'), tip = $('#tip');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* summary sentence and table (always available, also without D3) */
  const N = E.length, refit = E.filter(e => e.refit_revalidated).length, calib = E.filter(e => e.calibrated === 'yes').length;
  const partial = E.filter(e => e.calibrated === 'partial').map(e => e.name);
  const andList = a => (a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a.join(''));
  $('#evalSummary').textContent =
    `${refit ? `${cap(word(refit))} of the ${word(N)} evaluators are` : `None of the ${word(N)} evaluators is`} re-validated after a refit on the policy it evaluates, ` +
    `and ${calib ? `${word(calib)} report` : 'none reports'} calibrated absolute success with intervals` +
    (partial.length ? `; ${andList(partial)} compare absolute success in part (ringed).` : '.') +
    ' Evaluators that report only a linear fit sit in the band below the plot; those that do not state a policy count sit in the right-hand column.';
  const gt = e => e.ground_truth_label;
  $('#evalTable').innerHTML = '<caption class="sr-only">Validation of learned policy evaluators</caption><thead><tr><th scope="col">Evaluator</th><th scope="col">Policies or checkpoints</th><th scope="col">Pearson r</th><th scope="col">Ground truth</th><th scope="col">Real trials</th><th scope="col">Calibrated absolute success</th><th scope="col">Status</th></tr></thead><tbody>' +
    E.map(e => `<tr><th scope="row">${esc(e.name)}</th><td class="num">${e.n_policies ?? 'not stated'}</td><td class="num">${e.value !== null ? e.value : esc(e.metric) + ' only'}</td><td>${esc(gt(e))}</td>` +
      `<td class="num">${e.real_trials ? fmt(e.real_trials) + (e.real_trials_lower_bound ? '+' : '') : e.ground_truth === 'sim' ? 'not applicable (simulator)' : 'not reported'}</td><td>${esc(e.calibrated)}</td><td>${esc(e.status)}</td></tr>`).join('') + '</tbody>';

  /* label placement per evaluator: r right, l left, la left and above, a above (sub to the right) */
  const PLACE = { zhu2025irasim: 'a', li2025worldeval: 'r', quevedo2026worldgym: 'l', geminiroboticsteam2025evaluating: 'r', guo2026ctrlworld: 'r',
    li2026scalingb: 'l', gao2026dreamdojo: 'a', jeon2026roboworld: 'r', wang2026proworld: 'la', ma2026gigaworld: 'l', tseng2025scalable: 'l' };
  const SPLIT = { tseng2025scalable: ['Scalable Policy', 'Evaluation'] };

  const showTip = (html, ev) => {
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, ev.clientX + 14)) + 'px';
    tip.style.top = (ev.clientY + h + 24 > innerHeight ? ev.clientY - h - 12 : ev.clientY + 16) + 'px';
  };
  const hideTip = () => { tip.hidden = true; };

  addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('pointerdown', ev => { if (!ev.target.closest || !ev.target.closest('#evalChart .pt')) hideTip(); });
  $('#evalDetails').addEventListener('toggle', updateScrollRegions);

  const MIN_W = 640;                                          // keep in step with .chart { min-width } in style.css
  let lastW = 0;
  function draw() {
    hideTip();
    if (!window.d3) { el.innerHTML = '<p class="small">The chart could not be drawn; the values are in the table below.</p>'; return; }
    const W = Math.max(MIN_W, Math.round(el.clientWidth || MIN_W));
    if (W === lastW) { updateScrollRegions(); return; } lastW = W;
    el.innerHTML = '';
    const m = { t: 34, r: 16, l: 66 };
    const plotB = 320, bandY = plotB + 14, bandH = 34, axisY = bandY + bandH + 12, H = axisY + 62;
    const nsX = W - m.r - 46;                                   // "not stated" column
    const x = d3.scaleLog().domain([1.7, 10]).range([m.l + 10, nsX - 96]);
    const y = d3.scaleLinear().domain([0.6, 1.0]).range([plotB, m.t]);
    const rs = d3.scaleSqrt().domain([0, 1600]).range([0, 22]);
    const rad = e => (e.real_trials ? Math.max(5, rs(e.real_trials)) : 7);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('aria-hidden', 'true').attr('focusable', 'false');

    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(4)).join('line')
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', d => y(d)).attr('y2', d => y(d));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('.1f')).tickSizeOuter(0)).call(s => s.select('.domain').remove());
    const yt = svg.append('text').attr('transform', `translate(18,${(m.t + plotB) / 2}) rotate(-90)`).attr('text-anchor', 'middle');
    yt.append('tspan').text('Pearson ');
    yt.append('tspan').style('font-style', 'italic').text('r');
    yt.append('tspan').text(' with ground truth');

    svg.append('rect').attr('class', 'band').attr('x', m.l).attr('y', bandY).attr('width', W - m.l - m.r).attr('height', bandH).attr('rx', 3);
    svg.append('text').attr('x', m.l + 10).attr('y', bandY + bandH / 2 + 4.5).style('font-weight', 600).text('Linear fit only');

    const ax = svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${axisY})`);
    ax.call(d3.axisBottom(x).tickValues([2, 3, 4, 6, 8]).tickFormat(d3.format('d')).tickSizeOuter(0));
    ax.select('.domain').attr('d', `M${x(1.7)},0H${x(10)}`);
    ax.append('line').attr('x1', nsX - 22).attr('x2', nsX + 22).attr('stroke', '#9a9a9a');
    ax.append('line').attr('x1', nsX).attr('x2', nsX).attr('y2', 6).attr('stroke', '#9a9a9a');
    ax.append('text').attr('x', nsX).attr('y', 21).attr('text-anchor', 'middle').attr('fill', 'currentColor').style('font-size', '13px').text('not stated');
    svg.append('text').attr('x', (x(1.7) + x(10)) / 2).attr('y', axisY + 48).attr('text-anchor', 'middle').text('Policies or checkpoints validated (log scale)');

    const pts = E.map(e => ({ e, cx: e.n_policies ? x(e.n_policies) : nsX, cy: e.value !== null ? y(e.value) : bandY + bandH / 2 }))
      .sort((a, b) => rad(b.e) - rad(a.e));
    const g = svg.append('g').selectAll('g').data(pts).join('g').attr('class', 'pt').attr('transform', p => `translate(${p.cx},${p.cy})`);
    g.each(function (p) {
      const s = d3.select(this), e = p.e, r = rad(e), real = e.ground_truth === 'real';
      const fill = real ? '#3a3a3a' : '#fff', stroke = real ? '#fff' : '#3a3a3a';
      if (e.real_trials) s.append('circle').attr('r', r).attr('fill', fill).attr('fill-opacity', real ? .85 : 1).attr('stroke', stroke).attr('stroke-width', real ? 1 : 1.6);
      else s.append('path').attr('d', d3.symbol(d3.symbolDiamond, 110)()).attr('fill', fill).attr('stroke', real ? 'none' : stroke).attr('stroke-width', 1.6);
      if (e.calibrated === 'partial') s.append('circle').attr('class', 'ring').attr('r', r + 5).attr('fill', 'none').attr('stroke', '#3a3a3a').attr('stroke-width', 1.6).attr('stroke-dasharray', '3.5 2.5');
      const sub = e.real_trials ? fmt(e.real_trials) + (e.real_trials_lower_bound ? '+' : '') : e.ground_truth_label.includes('leaderboard') ? 'vs. leaderboard' : '';
      const mode = PLACE[e.key] || 'r', gap = r + (e.calibrated === 'partial' ? 11 : 7);
      const lines = SPLIT[e.key] || [e.name];
      const add = (txt, cls, tx, ty, anchor) => s.append('text').attr('class', cls).attr('x', tx).attr('y', ty).attr('text-anchor', anchor).text(txt);
      if (mode === 'r' || mode === 'l') {
        const dx = mode === 'r' ? gap : -gap, anchor = mode === 'r' ? 'start' : 'end';
        const y0 = sub ? -3 : 5 - (lines.length - 1) * 8;         // centre the block on the marker
        lines.forEach((t, i) => add(t, 'lbl', dx, y0 + i * 16, anchor));
        if (sub) add(sub, 'lbl-sub', dx, y0 + lines.length * 16, anchor);
      } else if (mode === 'la') {
        add(e.name, 'lbl', -gap + 2, -r - 18, 'end');
        if (sub) add(sub, 'lbl-sub', -gap + 2, -r - 3, 'end');
      } else {                                                   // above, sub to the right
        add(e.name, 'lbl', 0, -r - 9, 'middle');
        if (sub) add(sub, 'lbl-sub', gap, 5, 'start');
      }
    });
    g.on('pointermove pointerdown', (ev, p) => {
      const e = p.e;
      showTip(`<b>${esc(e.name)}</b><br>${e.value !== null ? 'Pearson r ' + e.value : esc(e.metric) + ' only'} · ${e.n_policies ? e.n_policies + ' policies or checkpoints' : 'policy count not stated'}<br>` +
        `Ground truth: ${esc(e.ground_truth_label)}${e.real_trials ? ' · ' + fmt(e.real_trials) + (e.real_trials_lower_bound ? '+' : '') + ' real trials' : ''}<br>` +
        `Calibrated absolute success: ${esc(e.calibrated)} · ${esc(e.status)}`, ev);
    }).on('pointerleave', ev => { if (ev.pointerType === 'mouse') hideTip(); });
    updateScrollRegions();
  }
  draw();
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 120); });
})();
