/* ContinualDrive project page: animated method stepper, findings showcase, results explorer. No dependencies. */
(function () {
  "use strict";
  const D = window.CD_DATA || {};
  const LB = D.leaderboard || { runs: [], c0: {} };
  const F = D.findings || {};
  const NS = "http://www.w3.org/2000/svg";
  const REG_COL = { "Full-FT": "#e8643a", "Adapter-FT": "#4ba3ec", "Replay": "#22b3a3", "PEGP-style": "#9a86f0",
    "LoRA-FT": "#f5b335", "LoRA+Replay": "#ffd27a", "LoRA+PEGP": "#d9a441", "Joint Full-FT": "#f2a08a", "Joint Adapter-FT": "#c9d2dd" };
  const PLN = { plantf: "PlanTF", diffusion: "Diffusion Planner" };
  const STREAM = { "forward-s1": "forward · main run", "forward-s2": "forward · second seed", reverse: "reverse order", third: "third order", joint: "joint (all groups)" };
  const minus = (s) => String(s).replace(/-/g, "−");
  const fmt = (v, d = 3, sign = false) => v == null ? "—" : minus((sign && v > 0 ? "+" : "") + v.toFixed(d));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = (p) => 1 - Math.pow(1 - p, 3);

  function el(tag, attrs, parent, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function sv(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function tween(dur, fn, delay = 0) {
    const t0 = performance.now() + delay;
    fn(0);
    function step(now) {
      const p = clamp((now - t0) / dur, 0, 1);
      fn(ease(p));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  const lin = (d0, d1, r0, r1) => (v) => r0 + (v - d0) / (d1 - d0) * (r1 - r0);

  /* ------------------------------------------------------------------ reveal on scroll */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach((e) => io.observe(e));

  /* ================================================================== METHOD STEPPER (animated Fig. 1) */
  const IMG = (n) => "assets/img/" + n + ".png";
  const GROUPS = [["sc_straight", "straight-TL"], ["sc_follow", "follow-lead"], ["sc_curve", "high-lat-acc"], ["sc_multi", "near-multi-veh"],
    ["sc_ped", "wait-ped"], ["sc_pickup", "pickup-dropoff"], ["sc_stationary", "stationary"]];
  const ACTS = [
    { t: "Deploy", s: "pre-train, deploy C₀",
      h: "A learned planner goes into service",
      p: "The planner maps object-level inputs from real-world nuPlan logs to ego trajectories. Its deployed checkpoint C<sub>0</sub> is the checkpoint every later update must not regress.",
      stat: ["C<sub>0</sub>", "the reference of every release verdict"],
      log: ["load real-world nuPlan logs", "pre-train planner (PlanTF · Diffusion Planner)", "<i>deploy</i> checkpoint <b>C0</b>", "C0 enters service: the anchor for all verdicts"] },
    { t: "Stream", s: "new logs, one group at a time",
      h: "New logs keep arriving",
      p: "Newly logged expert data arrive one scenario-type group at a time. Seven groups are visited in forward, reverse or a third order; T<sub>k</sub> is the checkpoint after stage k.",
      stat: ["7 groups", "413,939 training samples from 2,142 logs"],
      log: GROUPS.map((g, i) => `stage ${i + 1}: fine-tune on <b>${g[1]}</b> → <i>T${i + 1}</i>`) },
    { t: "Update", s: "fine-tune, risk forgetting",
      h: "Every update can forget",
      p: "Four core regimes act as probes: full fine-tuning, adapters on a frozen backbone, and adapters with replay or PEGP-style gradient projection, plus a LoRA branch. New skills can cost what C<sub>0</sub> could already do.",
      stat: ["24 core runs", "2 planners × 4 regimes × 3 stream settings, with paired intervals"],
      log: ["regime Full-FT: update all weights", "regime Adapter-FT: width-16 adapters, frozen backbone", "regime Replay: + 512 stored samples per group", "regime PEGP-style: + two-sided gradient projection", "extensions: third order · LoRA · joint · equal-data · 720-scenario panel"] },
    { t: "Measure", s: "same checkpoints, four axes",
      h: "One set of checkpoints, four readings",
      p: "The same checkpoints are scored in open loop (cached ADE) and closed loop (nuPlan CLS and pass rate, non-reactive and IDM-reactive). Four measurement axes are made explicit: loop, reference, aggregation and stream.",
      stat: ["4 axes", "changed one at a time from the deployment reading"],
      log: ["open loop: ADE on 5,120 cached dev samples", "closed loop: 64-scenario core panel, 20-s simulations", "A loop · B reference · C aggregation · D stream", "verdicts can reverse when one axis changes"] },
    { t: "Verdict", s: "release vs C₀",
      h: "A three-valued release verdict",
      p: "Each comparison with C<sub>0</sub> returns better, no detectable change or worse from a paired 95% interval. In the core suite, no regime measurably improved on C<sub>0</sub> in closed loop.",
      stat: ["0 of 96", "final closed-loop intervals above zero (24 runs × CLS, SR × NR, IDM-R)"],
      log: ["compare T7 with C0 (paired, 56 targets)", "verdict ∈ {better, no detectable change, worse}", "<i>0</i> of 96 final intervals above zero", "distill a reporting contract: seven rules"] },
  ];
  const ACT_MS = 7600;

  function buildSchematic(host) {
    const s = sv("svg", { viewBox: "0 0 680 420", role: "img", "aria-label": "Animated overview of the ContinualDrive protocol" }, host);
    const defs = sv("defs", {}, s);
    const lg = sv("linearGradient", { id: "gt", x1: 0, x2: 1 }, defs);
    sv("stop", { offset: "0", "stop-color": "#2ab7b7" }, lg); sv("stop", { offset: "1", "stop-color": "#f5b335" }, lg);
    const ar = sv("marker", { id: "arw", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto" }, defs);
    sv("path", { d: "M0,0 L10,5 L0,10 z", fill: "#a1acba" }, ar);
    const img = (g, n, x, y, w, h, cls, delay) => { const i = sv("image", { href: IMG(n), x: x - w / 2, y: y - h / 2, width: w, height: h, class: cls || "pop", preserveAspectRatio: "xMidYMid meet" }, g); if (delay != null) i.style.animationDelay = delay + "s"; return i; };
    const txt = (g, x, y, t, cls, anchor, delay) => { const e = sv("text", { x, y, class: cls || "sv-label", "text-anchor": anchor || "middle" }, g, t); if (delay != null) { e.classList.add("pop"); e.style.animationDelay = delay + "s"; } return e; };
    const layers = [];
    // ---- 1 deploy
    let g = sv("g", { class: "layer" }, s); layers.push(g);
    img(g, "v2_obj_database", 110, 200, 92, 92, "pop", 0.1); txt(g, 110, 268, "Driving logs", null, null, 0.1);
    sv("line", { x1: 165, y1: 200, x2: 215, y2: 200, stroke: "#a1acba", "stroke-width": 2, "marker-end": "url(#arw)", class: "flow" }, g);
    img(g, "v2_obj_brain", 270, 200, 92, 88, "pop", 0.45); txt(g, 270, 268, "Pre-train", null, null, 0.45);
    sv("line", { x1: 325, y1: 200, x2: 380, y2: 200, stroke: "#a1acba", "stroke-width": 2, "marker-end": "url(#arw)", class: "flow" }, g);
    sv("circle", { cx: 470, cy: 196, r: 78, fill: "rgba(42,183,183,.10)", class: "pulse" }, g);
    img(g, "v2_hero_car", 470, 196, 140, 125, "pop", 0.8); txt(g, 470, 282, "Deploy", null, null, 0.8);
    const c0 = sv("g", { class: "pop" }, g); c0.style.animationDelay = "1.2s";
    sv("rect", { x: 445, y: 92, width: 50, height: 28, rx: 14, fill: "#0c1118", stroke: "#ffffff", "stroke-width": 1.5 }, c0);
    sv("text", { x: 470, y: 111, "text-anchor": "middle", class: "sv-title", style: "font-size:15px" }, c0, "C₀");
    txt(g, 340, 360, "the deployed checkpoint is the reference every update must not regress", "sv-mono", null, 1.4);
    // ---- 2 stream
    g = sv("g", { class: "layer" }, s); layers.push(g);
    img(g, "v2_hero_car", 70, 220, 82, 72, "pop", 0);
    sv("line", { x1: 70, y1: 300, x2: 650, y2: 300, stroke: "#1c2531", "stroke-width": 3 }, g);
    const tl = sv("line", { x1: 70, y1: 300, x2: 650, y2: 300, stroke: "url(#gt)", "stroke-width": 3, class: "draw" }, g); tl.style.setProperty("--len", 580);
    sv("circle", { cx: 70, cy: 300, r: 7, fill: "#04060a", stroke: "#fff", "stroke-width": 2 }, g); txt(g, 70, 330, "C₀", "sv-title");
    GROUPS.forEach((gr, i) => {
      const x = 150 + i * 78, d = 0.25 + i * 0.22;
      img(g, gr[0], x, 214, 56, 60, "pop", d);
      txt(g, x, 258, gr[1], "sv-mono", null, d);
      const n = sv("circle", { cx: x, cy: 300, r: 6, fill: i < 3 ? "#2ab7b7" : i < 5 ? "#b9b66f" : "#f5b335", class: "pop" }, g); n.style.animationDelay = (d + 0.15) + "s";
      txt(g, x, 330, "T" + "₁₂₃₄₅₆₇"[i], "sv-label", null, d + 0.15);
    });
    txt(g, 360, 140, "one scenario-type group per stage · forward, reverse or third order", "sv-mono", null, 1.8);
    // ---- 3 update / forgetting
    g = sv("g", { class: "layer" }, s); layers.push(g);
    const X0 = 110, X1 = 610, Yb = 150, Ye = 330;
    sv("line", { x1: X0, y1: 90, x2: X0, y2: 350, class: "ax" }, g); sv("line", { x1: X0, y1: 350, x2: X1, y2: 350, class: "ax" }, g);
    sv("line", { x1: X0, y1: Yb, x2: X1, y2: Yb, stroke: "#f5b335", "stroke-width": 2, "stroke-dasharray": "6 6" }, g);
    txt(g, X0 + 8, Yb - 12, "skills of C₀", "sv-label", "start");
    let dpath = "", apath = `M${X0},${Yb}`;
    for (let i = 0; i <= 60; i++) { const u = i / 60, x = X0 + u * (X1 - X0), y = Yb + (Ye - Yb) * (1 - Math.exp(-2.6 * u)) / (1 - Math.exp(-2.6)); dpath += (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1); apath += `L${x.toFixed(1)},${y.toFixed(1)}`; }
    apath += `L${X1},${Yb}Z`;
    const area = sv("path", { d: apath, fill: "rgba(240,124,108,.22)", class: "pop" }, g); area.style.animationDelay = "1.1s";
    const cur = sv("path", { d: dpath, fill: "none", stroke: "#2ab7b7", "stroke-width": 3.5, class: "draw" }, g); cur.style.setProperty("--len", 620);
    for (let k = 0; k < 8; k++) txt(g, X0 + k * (X1 - X0) / 7, 372, k ? "T" + "₁₂₃₄₅₆₇"[k - 1] : "C₀", "sv-mono");
    img(g, "v2_ev_warning", 470, 230, 54, 48, "pop", 1.5);
    txt(g, 470, 282, "forgetting = safety risk", "sv-label", null, 1.6).setAttribute("style", "fill:#f07c6c;font-weight:700");
    const regs = [["Full-FT", "#e8643a"], ["Adapter-FT", "#4ba3ec"], ["Replay", "#22b3a3"], ["PEGP-style", "#9a86f0"], ["LoRA branch", "#f5b335"]];
    regs.forEach((r, i) => { const gg = sv("g", { class: "pop" }, g); gg.style.animationDelay = (0.2 + i * 0.15) + "s";
      sv("rect", { x: 130 + i * 98, y: 40, width: 92, height: 26, rx: 13, fill: "#0c1118", stroke: r[1], "stroke-width": 1.4 }, gg);
      sv("text", { x: 176 + i * 98, y: 57, "text-anchor": "middle", class: "sv-mono", style: "fill:" + r[1] }, gg, r[0]); });
    // ---- 4 measure
    g = sv("g", { class: "layer" }, s); layers.push(g);
    for (let k = 0; k < 8; k++) { const x = 90 + k * 71; const c = sv("circle", { cx: x, cy: 70, r: 6, fill: k ? "#2ab7b7" : "#04060a", stroke: "#fff", "stroke-width": k ? 0 : 2, class: "pop" }, g); c.style.animationDelay = k * 0.05 + "s"; txt(g, x, 96, k ? "T" + "₁₂₃₄₅₆₇"[k - 1] : "C₀", "sv-mono"); }
    sv("line", { x1: 90, y1: 70, x2: 587, y2: 70, stroke: "#2a3644", "stroke-width": 2 }, g).style.order = -1;
    txt(g, 340, 40, "same checkpoints", "sv-mono");
    [["v2_pl_log", "Open loop", "cached ADE · ADE₈ₛ · PDMS-style", 180], ["v2_pl_sim", "Closed loop", "CLS · SR · NR & IDM-R", 500]].forEach((l, i) => {
      const gg = sv("g", { class: "pop" }, g); gg.style.animationDelay = (0.3 + i * 0.2) + "s";
      sv("rect", { x: l[3] - 150, y: 118, width: 300, height: 56, rx: 28, fill: "#0c1118", stroke: "#2a3644" }, gg);
      sv("image", { href: IMG(l[0]), x: l[3] - 135, y: 128, width: 38, height: 36 }, gg);
      sv("text", { x: l[3] - 88, y: 142, class: "sv-title", style: "font-size:15px" }, gg, l[1]);
      sv("text", { x: l[3] - 88, y: 162, class: "sv-mono" }, gg, l[2]);
    });
    [["A", "Loop", "open vs closed loop", "#2ab7b7"], ["B", "Reference", "C₀ vs learning endpoint", "#f5b335"], ["C", "Aggregation", "final · stage-avg · worst", "#4ba3ec"], ["D", "Stream", "task order vs seed", "#9a86f0"]].forEach((a, i) => {
      const x = 40 + (i % 2) * 305, y = 200 + Math.floor(i / 2) * 104;
      const gg = sv("g", { class: "pop" }, g); gg.style.animationDelay = (0.8 + i * 0.25) + "s";
      sv("rect", { x, y, width: 290, height: 90, rx: 14, fill: "#0c1118", stroke: a[3], "stroke-opacity": 0.7, "stroke-width": 1.5 }, gg);
      sv("circle", { cx: x + 30, cy: y + 32, r: 14, fill: a[3] }, gg);
      sv("text", { x: x + 30, y: y + 37, "text-anchor": "middle", style: "font:700 14px var(--mono);fill:#000" }, gg, a[0]);
      sv("text", { x: x + 54, y: y + 38, class: "sv-title" }, gg, a[1]);
      sv("text", { x: x + 22, y: y + 70, class: "sv-label" }, gg, a[2]);
    });
    // ---- 5 verdict
    g = sv("g", { class: "layer" }, s); layers.push(g);
    img(g, "v2_ev_shield", 150, 170, 120, 130, "pop", 0.05);
    txt(g, 150, 270, "release T₇ ?", "sv-title", null, 0.2);
    txt(g, 150, 294, "better than C₀? keeps what C₀ could do?", "sv-mono", null, 0.3);
    [["▲", "better", "#2ab7b7"], ["○", "no detectable change", "#a1acba"], ["▼", "worse", "#f07c6c"]].forEach((v, i) => {
      const gg = sv("g", { class: "pop vchip" }, g); gg.style.animationDelay = (0.5 + i * 0.3) + "s";
      const r = sv("rect", { x: 320, y: 96 + i * 62, width: 300, height: 48, rx: 24, fill: "#0c1118", stroke: v[2], "stroke-width": 1.5 }, gg);
      sv("text", { x: 350, y: 127 + i * 62, "text-anchor": "middle", style: "font:16px var(--mono);fill:" + v[2] }, gg, v[0]);
      sv("text", { x: 374, y: 126 + i * 62, class: "sv-label", style: "fill:" + v[2] + ";font-size:15px;font-weight:600" }, gg, v[1]);
      r.dataset.col = v[2];
    });
    const big = sv("g", { class: "pop" }, g); big.style.animationDelay = "1.6s";
    sv("text", { x: 320, y: 330, class: "sv-title", style: "font-size:44px" }, big, "0 of 96");
    sv("text", { x: 320, y: 356, class: "sv-mono" }, big, "core-suite final closed-loop intervals above zero");
    sv("text", { x: 320, y: 384, class: "sv-mono", style: "fill:#f5b335" }, big, "→ reporting contract · seven rules");
    return layers;
  }

  (function initMethod() {
    const host = document.getElementById("schem"), stepper = document.getElementById("stepper"), cap = document.getElementById("caption");
    if (!host) return;
    const layers = buildSchematic(host);
    const steps = ACTS.map((a, i) => { const b = el("button", { class: "step", type: "button" }, stepper, `<span class="n">0${i + 1}</span><span class="t">${a.t}</span><span class="s">${a.s}</span><span class="bar"></span>`); b.onclick = () => { go(i, true); }; return b; });
    let cur = -1, playing = true, t0 = 0, timers = [], inView = false;
    const btn = document.getElementById("playbtn");
    btn.onclick = () => { playing = !playing; btn.textContent = playing ? "❚❚ pause" : "▶ play"; t0 = performance.now() - elapsed; };
    let elapsed = 0;
    function go(i, user) {
      timers.forEach(clearTimeout); timers = [];
      cur = i; t0 = performance.now(); elapsed = 0;
      if (user) { /* keep playing from the chosen act */ }
      layers.forEach((l, k) => { l.classList.remove("on"); });
      void host.offsetWidth;
      layers[i].classList.add("on");
      steps.forEach((s, k) => { s.classList.toggle("active", k === i); s.classList.toggle("done", k < i); s.querySelector(".bar").style.width = k < i ? "100%" : "0"; });
      document.getElementById("hud-act").textContent = `act ${i + 1}/5`;
      const a = ACTS[i];
      cap.innerHTML = `<div class="act fade-swap">Act ${i + 1} of 5 · ${a.t}</div><h3 class="fade-swap">${a.h}</h3><p class="fade-swap">${a.p}</p>
        <div class="stat fade-swap"><b>${a.stat[0]}</b><span>${a.stat[1]}</span></div><div class="log" id="log"></div>`;
      const log = document.getElementById("log");
      a.log.forEach((line, k) => timers.push(setTimeout(() => {
        const sec = ((performance.now() - t0) / 1000).toFixed(1).padStart(4, "0");
        el("div", {}, log, `[t+${sec}s] ${line}`);
        while (log.children.length > 6) log.removeChild(log.firstChild);
      }, 350 + k * (ACT_MS - 1500) / a.log.length)));
    }
    function frame(now) {
      if (playing && inView && cur >= 0) {
        elapsed = now - t0;
        const p = clamp(elapsed / ACT_MS, 0, 1);
        steps[cur].querySelector(".bar").style.width = (p * 100).toFixed(1) + "%";
        if (p >= 1) go((cur + 1) % ACTS.length);
      } else if (cur >= 0) { t0 = now - elapsed; }
      requestAnimationFrame(frame);
    }
    new IntersectionObserver((es) => es.forEach((e) => { inView = e.isIntersecting; if (inView && cur < 0) go(0); }), { threshold: 0.35 }).observe(host);
    requestAnimationFrame(frame);
  })();

  /* ================================================================== FINDINGS SHOWCASE */
  function chartFrame(host, w, h) {
    host.innerHTML = "";
    return sv("svg", { viewBox: `0 0 ${w} ${h}` }, host);
  }
  function yAxis(s, ys, ticks, x0, x1, fmtf) {
    ticks.forEach((v) => { sv("line", { x1: x0, x2: x1, y1: ys(v), y2: ys(v), class: v === 0 ? "ax" : "grid" }, s); sv("text", { x: x0 - 8, y: ys(v) + 4, "text-anchor": "end", class: "tick" }, s, fmtf ? fmtf(v) : minus(v)); });
  }
  function ciWhisker(s, x, y0, y1, col, delay) {
    const l = sv("line", { x1: x, x2: x, y1: (y0 + y1) / 2, y2: (y0 + y1) / 2, stroke: col, "stroke-width": 2 }, s);
    tween(700, (p) => { l.setAttribute("y1", (y0 + y1) / 2 + ((y0 - y1) / 2) * p); l.setAttribute("y2", (y0 + y1) / 2 - ((y0 - y1) / 2) * p); }, delay);
    [y0, y1].forEach((yy) => { const c = sv("line", { x1: x - 8, x2: x + 8, y1: yy, y2: yy, stroke: col, "stroke-width": 2, opacity: 0 }, s); tween(300, (p) => c.setAttribute("opacity", p), delay + 600); });
  }
  function bar(s, x, w, y0, yv, col, filled, delay) {
    const r = sv("rect", { x, width: w, y: y0, height: 0, rx: 3, fill: filled ? col : col + "55", stroke: filled ? "none" : col, "stroke-width": 1.5 }, s);
    tween(900, (p) => { const y = y0 + (yv - y0) * p; r.setAttribute("y", Math.min(y0, y)); r.setAttribute("height", Math.max(1.5, Math.abs(y - y0))); }, delay);
    return r;
  }
  const ci = (o) => o.ci_printed || o.ci_plotted;

  const FINDINGS = [
    { key: "loop", badge: "A", col: "#2ab7b7", tab: "Loop flips the verdict",
      copy: () => { const c = F.fig2a_loop_scatter.counts; return `<div class="tag" style="color:#57d3d3">Axis A · evaluation loop</div><h3>Open loop says better, closed loop says worse</h3>
        <div class="big" style="color:#f5b335" data-count="${c.plantf_open_loop_better}">0<small>of 12</small></div>
        <p>PlanTF's cached open-loop ADE beats C<sub>0</sub> in ${c.plantf_open_loop_better} of 12 core runs, while all four closed-loop scores trail C<sub>0</sub> in all 12. No final checkpoint is better than C<sub>0</sub> in both loops (point estimates).</p><div class="src">Fig. 2(a) · 24 core-suite final checkpoints</div>`; },
      draw: drawScatter },
    { key: "ref", badge: "B", col: "#f5b335", tab: "BWT misses the loss",
      copy: () => `<div class="tag" style="color:#f5b335">Axis B · reference checkpoint</div><h3>Backward transfer misses a loss already present at the endpoint</h3>
        <div class="big" style="color:#ee7a6a">${fmt(F.fig2b_fig3a_reference_bars.metrics.CLS_NR.bwt.value)}</div>
        <p>Pooled over the 12 PlanTF runs, closed loop shows no detectable forgetting against the learning endpoint (BWT), yet the same checkpoints are worse than C<sub>0</sub>: the loss sits in Δ<sub>end</sub>, which BWT excludes by construction.</p>
        <div class="seg" id="refseg"></div><div class="src">Figs. 2(b), 3(a) · scenario-cluster 95% intervals · Δ<sub>fin</sub> = Δ<sub>end</sub> + (6/7) BWT</div>`,
      draw: drawReference },
    { key: "agg", badge: "C", col: "#4ba3ec", tab: "Aggregation separates",
      copy: () => `<div class="tag" style="color:#4ba3ec">Axis C · temporal aggregation</div><h3>Stage averages separate what the final checkpoint cannot</h3>
        <div class="big" style="color:#4ba3ec">${fmt(F.fig2c_aggregation.stageavg.value, 3, true)}</div>
        <p>PlanTF Replay minus Adapter-FT in non-reactive CLS (main run): the final-checkpoint interval includes zero, the stage-averaged interval excludes it.</p><div class="src">Fig. 2(c) · paired 95% intervals over 56 targets</div>`,
      draw: drawAggregation },
    { key: "stream", badge: "D", col: "#9a86f0", tab: "Order beats seed",
      copy: () => `<div class="tag" style="color:#b3a6f5">Axis D · stream protocol</div><h3>Rankings move far more with task order than with seed</h3>
        <div class="big" style="color:#9a86f0">${fmt(F.fig2d_stream.streams[0].value, 3, true)} <small>→ ${fmt(F.fig2d_stream.streams[2].value, 3, true)}</small></div>
        <p>Diffusion Planner Replay leads Adapter-FT in final CLS-NR in both forward-order seeds, but not detectably in reverse order. Over nine metric families, the mean Kendall τ<sub>b</sub> of final rankings is 0.95 (PlanTF) and 0.84 (Diffusion Planner) between seeds, but 0.41 and −0.03 between forward and reverse orders.</p><div class="src">Fig. 2(d) · Sec. 5 (Axis D)</div>`,
      draw: drawStream },
    { key: "deploy", badge: "★", col: "#e7ecf2", tab: "No gain over C₀",
      copy: () => `<div class="tag" style="color:#e7ecf2">The verdict that did not flip</div><h3>No regime measurably improved on the deployed planner</h3>
        <div class="big" style="color:#fff" data-count="0">0<small>of 96</small></div>
        <p>Core-suite final closed-loop intervals above zero (24 runs × CLS, SR × NR, IDM-R). On a panel more than ten times larger, every evaluated final checkpoint trails C<sub>0</sub>; joint training on all groups recovers much of the loss without exceeding C<sub>0</sub>'s closed-loop score.</p><div class="src">Sec. 5.1 · Tab. 2 · 720-scenario panel and joint references are point estimates</div>`,
      draw: drawForest },
    { key: "stage", badge: "⏱", col: "#f07c6c", tab: "Per checkpoint",
      copy: () => `<div class="tag" style="color:#f07c6c">Checkpoint by checkpoint</div><h3>Where along the stream the loss appears</h3>
        <p>Change in non-reactive CLS from C<sub>0</sub> at each main-run checkpoint (95% intervals). The <i>stationary</i> update at stage 7 collapses Diffusion Planner Adapter-FT, while Replay and PEGP-style avoid it.</p>
        <div class="seg" id="stageseg"></div><div class="src">Fig. 4(a) · main run</div>`,
      draw: drawStages },
  ];

  function drawScatter(host) {
    const A = F.fig2a_loop_scatter, W = 640, H = 430;
    const s = chartFrame(host, W, H);
    const xs = lin(-2.35, 1.55, 70, W - 16), ys = lin(0.13, -0.66, 30, H - 50);
    sv("rect", { x: xs(0), y: ys(0), width: W - 16 - xs(0), height: H - 50 - ys(0), fill: "rgba(245,179,53,.07)" }, s);
    sv("rect", { x: xs(0), y: 30, width: W - 16 - xs(0), height: ys(0) - 30, fill: "rgba(42,183,183,.05)" }, s);
    yAxis(s, ys, [-0.6, -0.4, -0.2, 0], 70, W - 16, (v) => v ? minus(v.toFixed(1)) : "0");
    sv("line", { x1: xs(0), x2: xs(0), y1: 30, y2: H - 50, class: "ax", "stroke-dasharray": "4 5" }, s);
    [-2, -1, 0, 1].forEach((v) => sv("text", { x: xs(v), y: H - 30, "text-anchor": "middle", class: "tick" }, s, v ? minus((v > 0 ? "+" : "") + v) : "0"));
    sv("text", { x: (70 + W) / 2, y: H - 6, "text-anchor": "middle", class: "alab" }, s, "open loop: Δfin cached ADE (m), better →");
    sv("text", { x: 16, y: (30 + H - 50) / 2, "text-anchor": "middle", class: "alab", transform: `rotate(-90 16 ${(30 + H - 50) / 2})` }, s, "closed loop: Δfin CLS (NR)");
    sv("text", { x: W - 22, y: H - 60, "text-anchor": "end", class: "alab", style: "fill:#f5b335;font-weight:600" }, s, "open loop better, closed loop worse");
    sv("text", { x: W - 22, y: 48, "text-anchor": "end", class: "alab", style: "fill:#57d3d3;font-weight:600" }, s, `better in both loops: ${A.counts.both_loops_better_point} of 24`);
    A.points.forEach((p, i) => {
      const x = xs(Math.max(p.x_dfin_cachedADE_m, -2.2)), y = ys(p.y_dfin_CLS_NR), c = ci(p), col = REG_COL[p.regime];
      const d = 120 + i * 45;
      ciWhisker(s, x, ys(c[0]), ys(c[1]), col + "bb", d);
      let m;
      if (p.planner === "plantf") m = sv("circle", { cx: x, cy: y, r: 0, fill: col, stroke: "#000", "stroke-width": 1.2 }, s);
      else m = sv("path", { d: `M${x},${y - 8}L${x + 8},${y}L${x},${y + 8}L${x - 8},${y}Z`, fill: col, opacity: 0 }, s);
      tween(500, (q) => { if (p.planner === "plantf") m.setAttribute("r", 6.5 * q); else m.setAttribute("opacity", q); }, d);
      if (p.x_dfin_cachedADE_m < -2.2) { const t = sv("text", { x: x + 11, y: y + 4, class: "tick", opacity: 0 }, s, minus(p.x_dfin_cachedADE_m.toFixed(2))); tween(400, (q) => t.setAttribute("opacity", q), d + 300); }
      if (p.x_dfin_cachedADE_m > 0 && p.y_dfin_CLS_NR < 0) { const r = sv("circle", { cx: x, cy: y, r: 11, fill: "none", stroke: "#f5b335", "stroke-width": 1.5, class: "pulse" }, s); }
      m.appendChild(sv("title", {}, null, `${PLN[p.planner]} · ${p.regime} · ${STREAM[p.stream]}\nopen loop ${fmt(p.x_dfin_cachedADE_m, 2, true)} m · closed loop ${fmt(p.y_dfin_CLS_NR, 3, true)} [${fmt(c[0])}, ${fmt(c[1])}]`));
    });
    legend(host, true);
  }
  function legend(host, planners) {
    const L = el("div", { style: "display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:#a1acba;margin:6px 6px 0" }, host);
    if (planners) L.innerHTML += `<span>● PlanTF</span><span>◆ Diffusion Planner</span>`;
    ["Full-FT", "Adapter-FT", "Replay", "PEGP-style"].forEach((r) => L.innerHTML += `<span><i style="display:inline-block;width:14px;height:8px;border-radius:2px;background:${REG_COL[r]};margin-right:6px"></i>${r}</span>`);
  }
  function seg(id, opts, cb, init) {
    const box = document.getElementById(id); if (!box) return;
    box.style.cssText = "display:flex;gap:6px;margin-top:16px;flex-wrap:wrap";
    opts.forEach(([k, lab]) => { const b = el("button", { type: "button", style: "font:inherit;font-size:13px;cursor:pointer;border-radius:8px;padding:5px 11px;border:1px solid #2a3644;background:#0c1118;color:#a1acba" }, box, lab);
      b.onclick = () => { [...box.children].forEach((c) => { c.style.borderColor = "#2a3644"; c.style.color = "#a1acba"; }); b.style.borderColor = "#2ab7b7"; b.style.color = "#e7ecf2"; cb(k); stopAuto(); };
      if (k === init) { b.style.borderColor = "#2ab7b7"; b.style.color = "#e7ecf2"; } });
  }
  function drawReference(host, metric) {
    metric = metric || "CLS_NR";
    const M = F.fig2b_fig3a_reference_bars.metrics[metric], W = 640, H = 430;
    const s = chartFrame(host, W, H);
    const vals = ["d_end", "bwt", "d_fin"].map((k) => M[k]);
    const lo = Math.min(0, ...vals.map((v) => ci(v)[0])) * 1.12, hi = Math.max(0, ...vals.map((v) => ci(v)[1])) * 1.12 || 0.05;
    const ys = lin(hi, lo, 40, H - 60);
    const step = Math.pow(10, Math.floor(Math.log10((hi - lo) / 3)));
    const ticks = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(6));
    yAxis(s, ys, ticks, 80, W - 20, (v) => v ? minus(v.toFixed(step < 0.1 ? 2 : 1)) : "0");
    const cols = ["#f2b33b", "#ee7a6a", "#8fa0b8"], labs = ["Δend", "BWT", "Δfin"];
    vals.forEach((v, i) => {
      const x = 130 + i * 170, c = ci(v), excl = c[1] < 0 || c[0] > 0;
      bar(s, x - 50, 100, ys(0), ys(v.value), cols[i], excl, i * 250);
      ciWhisker(s, x, ys(c[0]), ys(c[1]), "#e7ecf2", 500 + i * 250);
      const t = sv("text", { x, y: v.value < 0 ? ys(c[0]) + 22 : ys(c[1]) - 10, "text-anchor": "middle", class: "vlab", opacity: 0 }, s, fmt(v.value, metric === "ADE8s" ? 2 : 3, true));
      tween(400, (q) => t.setAttribute("opacity", q), 900 + i * 250);
      sv("text", { x, y: H - 30, "text-anchor": "middle", class: "alab", style: "font-size:15px;fill:#e7ecf2;font-weight:600" }, s, labs[i]);
    });
    sv("text", { x: 80, y: 22, class: "alab" }, s, { CLS_NR: "change in CLS (NR) · PlanTF, 12 runs pooled", SR_NR: "change in SR (NR) · PlanTF, 12 runs pooled", ADE8s: "change in −ADE₈ₛ (m, higher is better) · PlanTF" }[metric]);
    sv("text", { x: W - 20, y: 22, "text-anchor": "end", class: "tick" }, s, "filled: 95% interval excludes 0");
    if (!document.getElementById("refseg").children.length) seg("refseg", [["CLS_NR", "CLS (NR)"], ["SR_NR", "SR (NR)"], ["ADE8s", "ADE₈ₛ (open loop)"]], (k) => drawReference(host, k), "CLS_NR");
  }
  function drawAggregation(host) {
    const A = F.fig2c_aggregation, W = 640, H = 430, s = chartFrame(host, W, H);
    const ys = lin(0.22, -0.06, 40, H - 60);
    yAxis(s, ys, [-0.05, 0, 0.05, 0.1, 0.15, 0.2], 80, W - 20, (v) => v ? minus((v > 0 ? "+" : "") + v.toFixed(2)) : "0");
    [["final", "Final checkpoint"], ["stageavg", "Stage-averaged"]].forEach(([k, lab], i) => {
      const v = A[k], c = ci(v), x = 230 + i * 220;
      bar(s, x - 60, 120, ys(0), ys(v.value), "#22b3a3", v.excludes_zero, i * 300);
      ciWhisker(s, x, ys(c[0]), ys(c[1]), "#e7ecf2", 500 + i * 300);
      sv("text", { x, y: ys(c[1]) - 12, "text-anchor": "middle", class: "vlab" }, s, fmt(v.value, 3, true));
      sv("text", { x, y: H - 30, "text-anchor": "middle", class: "alab", style: "font-size:15px;fill:#e7ecf2;font-weight:600" }, s, lab);
      sv("text", { x, y: H - 12, "text-anchor": "middle", class: "tick" }, s, `[${fmt(c[0])}, ${fmt(c[1])}]`);
    });
    sv("text", { x: 80, y: 22, class: "alab" }, s, "PlanTF Replay − Adapter-FT, CLS (NR), main run");
  }
  function drawStream(host) {
    const A = F.fig2d_stream, W = 640, H = 430, s = chartFrame(host, W, H);
    const ys = lin(0.7, -0.05, 40, H - 70);
    yAxis(s, ys, [0, 0.2, 0.4, 0.6], 80, 400, (v) => v ? "+" + v.toFixed(1) : "0");
    const labs = { "forward-s1": "Main run", "forward-s2": "Second seed", reverse: "Reverse", third: "Third order" };
    A.streams.forEach((v, i) => {
      const c = ci(v) || [v.value, v.value], x = 120 + i * 78, has = !!ci(v);
      bar(s, x - 26, 52, ys(0), ys(v.value), "#22b3a3", has ? v.excludes_zero : true, i * 220);
      if (has) ciWhisker(s, x, ys(c[0]), ys(c[1]), "#e7ecf2", 400 + i * 220);
      sv("text", { x, y: ys(Math.max(c[1], v.value)) - 10, "text-anchor": "middle", class: "vlab", style: "font-size:13px" }, s, fmt(v.value, 3, true));
      sv("text", { x, y: H - 50, "text-anchor": "middle", class: "tick", style: "fill:#a1acba" }, s, labs[v.stream] || v.stream);
    });
    sv("text", { x: 60, y: 22, class: "alab" }, s, "Diffusion Planner Replay − Adapter-FT, final CLS (NR)");
    // Kendall tau panel
    const T = (F.headlines || []).find((h) => h.id === "seeds_vs_orders");
    if (T) {
      const xs2 = lin(-0.2, 1, 440, 620);
      sv("text", { x: 440, y: 22, class: "alab" }, s, "mean Kendall τb");
      sv("line", { x1: xs2(0), x2: xs2(0), y1: 40, y2: H - 60, class: "ax" }, s);
      const rows = [["plantf", "seeds", "PlanTF · seeds"], ["plantf", "forward_vs_reverse", "PlanTF · fwd/rev"], ["plantf", "forward_vs_third", "PlanTF · fwd/third"],
        ["diffusion", "seeds", "Diffusion · seeds"], ["diffusion", "forward_vs_reverse", "Diffusion · fwd/rev"], ["diffusion", "forward_vs_third", "Diffusion · fwd/third"]];
      const cols = { seeds: "#2ab7b7", forward_vs_reverse: "#f07c6c", forward_vs_third: "#f5b335" };
      rows.forEach(([p, k, lab], i) => {
        const v = T.values[p][k].mean, y = 60 + i * 52 + (i > 2 ? 14 : 0);
        sv("text", { x: 440, y: y - 6, class: "tick", style: "fill:#a1acba" }, s, lab);
        const r = sv("rect", { x: xs2(0), y, width: 0, height: 14, rx: 3, fill: cols[k] }, s);
        tween(900, (q) => { const x1 = xs2(v * q); r.setAttribute("x", Math.min(xs2(0), x1)); r.setAttribute("width", Math.abs(x1 - xs2(0))); }, 300 + i * 120);
        sv("text", { x: Math.max(xs2(v), xs2(0)) + 6, y: y + 12, class: "tick", style: "fill:#e7ecf2" }, s, minus(v.toFixed(2)));
      });
    }
  }
  function drawForest(host) {
    const pts = F.fig2a_loop_scatter.points.slice().sort((a, b) => (a.planner === b.planner ? a.y_dfin_CLS_NR - b.y_dfin_CLS_NR : a.planner === "plantf" ? -1 : 1));
    const W = 640, H = 430, s = chartFrame(host, W, H);
    const xs = lin(-0.68, 0.2, 170, W - 20), rh = (H - 70) / pts.length;
    [-0.6, -0.4, -0.2].forEach((v) => { sv("line", { x1: xs(v), x2: xs(v), y1: 20, y2: H - 46, class: "grid" }, s); sv("text", { x: xs(v), y: H - 30, "text-anchor": "middle", class: "tick" }, s, minus(v.toFixed(1))); });
    sv("line", { x1: xs(0), x2: xs(0), y1: 14, y2: H - 46, stroke: "#fff", "stroke-width": 1.6 }, s);
    sv("text", { x: xs(0), y: H - 30, "text-anchor": "middle", class: "tick", style: "fill:#fff" }, s, "C₀");
    sv("text", { x: (170 + W) / 2, y: H - 8, "text-anchor": "middle", class: "alab" }, s, "Δfin CLS (NR) vs C₀, 95% intervals");
    pts.forEach((p, i) => {
      const y = 20 + rh * (i + 0.5), c = ci(p), col = REG_COL[p.regime], d = 80 + i * 40;
      if (i === 0 || pts[i - 1].planner !== p.planner) sv("text", { x: 8, y: y + 4, class: "alab", style: "fill:#e7ecf2;font-weight:600" }, s, PLN[p.planner]);
      sv("text", { x: 160, y: y + 4, "text-anchor": "end", class: "tick" }, s, `${p.regime} · ${{ "forward-s1": "s1", "forward-s2": "s2", reverse: "rev" }[p.stream]}`);
      const l = sv("line", { x1: xs(p.y_dfin_CLS_NR), x2: xs(p.y_dfin_CLS_NR), y1: y, y2: y, stroke: col, "stroke-width": 3, "stroke-linecap": "round" }, s);
      tween(700, (q) => { l.setAttribute("x1", xs(p.y_dfin_CLS_NR) + (xs(c[0]) - xs(p.y_dfin_CLS_NR)) * q); l.setAttribute("x2", xs(p.y_dfin_CLS_NR) + (xs(c[1]) - xs(p.y_dfin_CLS_NR)) * q); }, d);
      const m = sv("circle", { cx: xs(p.y_dfin_CLS_NR), cy: y, r: 0, fill: col }, s); tween(400, (q) => m.setAttribute("r", 4.5 * q), d);
      m.appendChild(sv("title", {}, null, `${PLN[p.planner]} · ${p.regime} · ${STREAM[p.stream]}: ${fmt(p.y_dfin_CLS_NR, 3, true)} [${fmt(c[0])}, ${fmt(c[1])}]`));
    });
  }
  function drawStages(host, planner) {
    planner = planner || "diffusion";
    const P = F.fig4a_per_checkpoint_cls_nr.planners[planner], W = 640, H = 430, s = chartFrame(host, W, H);
    const regs = ["Full-FT", "Adapter-FT", "Replay", "PEGP-style"];
    let lo = 0; regs.forEach((r) => P.regimes[r].stages.forEach((st) => { lo = Math.min(lo, (st.ci_plotted || [st.d_CLS_NR])[0]); }));
    lo = Math.floor((lo - 0.03) * 10) / 10;
    const ys = lin(0.12, lo, 30, H - 70), xs = (k) => 90 + k * 76;
    const ticks = []; for (let v = 0; v >= lo - 1e-9; v -= (lo < -0.4 ? 0.2 : 0.1)) ticks.push(+v.toFixed(2));
    yAxis(s, ys, ticks, 80, W - 20, (v) => v ? minus(v.toFixed(1)) : "0");
    sv("rect", { x: xs(6) - 30, y: 30, width: 60, height: H - 100, fill: "rgba(255,255,255,.04)" }, s);
    const groups = F.fig4a_per_checkpoint_cls_nr.stage_groups;
    groups.forEach((g, k) => sv("text", { x: xs(k), y: H - 50, "text-anchor": "end", class: "tick", transform: `rotate(-30 ${xs(k)} ${H - 50})` }, s, g));
    regs.forEach((r, ri) => {
      const st = P.regimes[r].stages, col = REG_COL[r];
      const dx = (ri - 1.5) * 6;
      st.forEach((p, k) => { if (p.ci_plotted) { const l = sv("line", { x1: xs(k) + dx, x2: xs(k) + dx, y1: ys(p.ci_plotted[0]), y2: ys(p.ci_plotted[1]), stroke: col, "stroke-width": 1.4, opacity: 0 }, s); tween(500, (q) => l.setAttribute("opacity", 0.55 * q), 300 + ri * 250 + k * 80); } });
      const d = st.map((p, k) => `${k ? "L" : "M"}${xs(k) + dx},${ys(p.d_CLS_NR)}`).join("");
      const path = sv("path", { d, fill: "none", stroke: col, "stroke-width": 2.6, "stroke-linejoin": "round" }, s);
      const len = path.getTotalLength ? path.getTotalLength() : 600;
      path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
      tween(1300, (q) => { path.style.strokeDashoffset = len * (1 - q); }, ri * 250);
      st.forEach((p, k) => { const c = sv("circle", { cx: xs(k) + dx, cy: ys(p.d_CLS_NR), r: 0, fill: col }, s); tween(300, (q) => c.setAttribute("r", 4 * q), ri * 250 + k * 170); c.appendChild(sv("title", {}, null, `${r} · ${p.stage} (${p.group}): ${fmt(p.d_CLS_NR, 3, true)}`)); });
    });
    sv("text", { x: 80, y: 18, class: "alab" }, s, `${PLN[planner]}: CLS (NR) change from C₀ per checkpoint, main run`);
    legend(host, false);
    if (!document.getElementById("stageseg").children.length) seg("stageseg", [["diffusion", "Diffusion Planner"], ["plantf", "PlanTF"]], (k) => drawStages(host, k), "diffusion");
  }

  let autoTimer = null, fcur = 0, fInView = false, fUser = false;
  function stopAuto() { fUser = true; if (autoTimer) clearInterval(autoTimer); document.querySelectorAll(".ftab .prog").forEach((p) => p.style.width = "0"); }
  (function initFindings() {
    const tabs = document.getElementById("ftabs"); if (!tabs || !F.fig2a_loop_scatter) return;
    const btns = FINDINGS.map((f, i) => { const b = el("button", { class: "ftab", type: "button" }, tabs, `<span class="badge" style="background:${f.col}">${f.badge}</span>${f.tab}<span class="prog"></span>`); b.onclick = () => { stopAuto(); show(i); }; return b; });
    function show(i) {
      fcur = i; btns.forEach((b, k) => b.classList.toggle("active", k === i));
      const f = FINDINGS[i], copy = document.getElementById("fcopy"), chart = document.getElementById("fchart");
      copy.innerHTML = f.copy(); copy.classList.remove("fade-swap"); void copy.offsetWidth; copy.classList.add("fade-swap");
      const big = copy.querySelector("[data-count]");
      if (big) { const n = +big.dataset.count, small = big.querySelector("small").outerHTML; tween(1100, (q) => big.innerHTML = Math.round(n * q) + small, 300); }
      f.draw(chart);
    }
    const DUR = 10000; let tStart = 0;
    function tick() {
      if (!fUser && fInView) {
        const p = (performance.now() - tStart) / DUR;
        btns[fcur].querySelector(".prog").style.width = Math.min(100, p * 100) + "%";
        if (p >= 1) { btns[fcur].querySelector(".prog").style.width = "0"; show((fcur + 1) % FINDINGS.length); tStart = performance.now(); }
      } else tStart = performance.now() - (parseFloat(btns[fcur].querySelector(".prog").style.width || 0) / 100) * DUR;
      if (!fUser) requestAnimationFrame(tick);
    }
    let started = false;
    new IntersectionObserver((es) => es.forEach((e) => { fInView = e.isIntersecting; if (fInView && !started) { started = true; show(0); tStart = performance.now(); requestAnimationFrame(tick); } }), { threshold: 0.3 }).observe(document.getElementById("fpanel"));
  })();

  /* ================================================================== RESULTS EXPLORER */
  const METRICS = [
    ["CLS_NR", "CLS · NR (closed loop)", true, 3], ["CLS_R", "CLS · IDM-R (closed loop)", true, 3],
    ["SR_NR", "SR · NR (pass rate)", true, 3], ["SR_R", "SR · IDM-R (pass rate)", true, 3],
    ["PDMS", "PDMS-style (open-loop-like)", true, 3], ["ADE8s", "Panel ADE₈ₛ (m, open loop)", false, 3],
    ["cachedADE_final", "Cached ADE · final (m)", false, 3], ["cachedADE_stageavg", "Cached ADE · stage-averaged (m)", false, 3],
    ["cachedADE_worst", "Cached ADE · worst stage (m)", false, 3]];
  const SUITES = [["core", "Core suite (24 runs)"], ["core+third", "Core + third order"], ["lora", "LoRA branch (18 runs)"],
    ["joint", "Joint references (4 runs)"], ["equal", "Equal-data runs (8 runs)"], ["expanded", "720-scenario panel"], ["all", "All trained runs"]];
  const STREAMS = [["all", "All stream settings"], ["forward-s1", "Forward · main run"], ["forward-s2", "Forward · second seed"], ["reverse", "Reverse order"], ["third", "Third order"]];
  const state = { planner: "plantf", metric: "CLS_NR", suite: "core", stream: "all", sort: "rank" };

  (function initExplorer() {
    const ctl = document.getElementById("controls"); if (!ctl || !LB.runs.length) return;
    const mk = (key, label, opts) => { const d = el("div", { class: "ctl" }, ctl); el("label", { for: "sel-" + key }, d, label); const s = el("select", { id: "sel-" + key }, d);
      opts.forEach(([v, t]) => { const o = el("option", { value: v }, s, t); if (v === state[key]) o.selected = true; });
      s.onchange = () => { state[key] = s.value; render(); }; };
    mk("planner", "Planner", [["plantf", "PlanTF"], ["diffusion", "Diffusion Planner"]]);
    mk("metric", "Score", METRICS.map((m) => [m[0], m[1]]));
    mk("suite", "Runs", SUITES);
    mk("stream", "Stream", STREAMS);
    mk("sort", "Order rows by", [["rank", "Rank (best first)"], ["regime", "Regime"]]);
    render();
  })();

  function c0For(planner, metric, panel) {
    const src = panel === "expanded720" ? LB.c0_expanded : LB.c0;
    if (!src || !src[planner]) return null;
    const key = metric.startsWith("cachedADE") ? "cachedADE" : metric;
    return src[planner][key];
  }
  function render() {
    const [mk, mlabel, higher, dp] = METRICS.find((m) => m[0] === state.metric);
    const fam = { core: ["core"], "core+third": ["core", "third"], lora: ["lora"], joint: ["joint"], equal: ["equal"], expanded: ["expanded"], all: ["core", "third", "lora", "joint", "equal"] }[state.suite];
    let rows = LB.runs.filter((r) => r.planner === state.planner && fam.includes(r.family) && (state.stream === "all" || r.stream === state.stream));
    const missing = rows.filter((r) => r.metrics[mk] == null).length;
    rows = rows.filter((r) => r.metrics[mk] != null);
    const panel = state.suite === "expanded" ? "expanded720" : "core64";
    const c0 = c0For(state.planner, mk, panel);
    rows.forEach((r) => { r._v = r.metrics[mk]; r._gain = c0 == null ? 0 : (higher ? r._v - c0 : c0 - r._v); });
    rows.sort((a, b) => b._gain - a._gain);
    const items = rows.map((r) => ({ r }));
    if (c0 != null) { const pos = rows.findIndex((r) => r._gain < 0); items.splice(pos < 0 ? rows.length : pos, 0, { c0: true }); }
    if (state.sort === "regime") items.sort((a, b) => (a.c0 ? -1 : b.c0 ? 1 : a.r.regime.localeCompare(b.r.regime) || a.r.stream.localeCompare(b.r.stream)));
    const maxg = Math.max(1e-9, ...rows.map((r) => Math.abs(r._gain)));
    const box = document.getElementById("rows"), RH = 46;
    const seen = new Set();
    let rank = 0;
    items.forEach((it, i) => {
      const id = it.c0 ? "row-c0" : "row-" + it.r.id; seen.add(id);
      let row = document.getElementById(id);
      const fresh = !row;
      if (fresh) { row = el("div", { class: "row" + (it.c0 ? " c0" : ""), id }, box); row.style.transform = `translateY(${i * RH}px)`; row.style.opacity = 0; }
      let html;
      if (it.c0) {
        html = `<span class="rk">—</span><span class="rg"><span class="dot" style="background:#fff"></span>C<sub>0</sub> deployed</span><span class="st">${panel === "expanded720" ? "720-scenario panel" : "reference"}</span>
          <span class="val"><span class="num">${fmt(c0, dp)}</span><span class="barbox"><span class="zero" style="left:50%"></span></span></span><span class="chip none">anchor</span>`;
      } else {
        const r = it.r; rank += 1;
        const w = Math.abs(r._gain) / maxg * 50, left = r._gain >= 0 ? 50 : 50 - w;
        const col = REG_COL[r.regime] || "#ccc";
        let chip = `<span class="chip na">point est.</span>`;
        if (mk === "CLS_NR" && r.ci_dCLS_NR) { const [lo, hi] = r.ci_dCLS_NR; chip = lo > 0 ? `<span class="chip better">▲ better</span>` : hi < 0 ? `<span class="chip worse">▼ worse</span>` : `<span class="chip none">○ no change</span>`; }
        else if (r.family === "core" && mk !== "CLS_NR") chip = `<span class="chip na">see paper</span>`;
        const d = r._v - c0;
        const flag = r.note && /2,?048|not update-matched/i.test(r.note) ? ` <span title="${r.note}" style="color:#f5b335">*</span>` : "";
        html = `<span class="rk">${rank}</span><span class="rg"><span class="dot" style="background:${col}"></span>${r.regime}${flag}</span><span class="st">${STREAM[r.stream] || r.stream}</span>
          <span class="val"><span class="num" title="Δ vs C0 = ${fmt(d, dp, true)}">${fmt(r._v, dp)}</span><span class="barbox"><span class="zero" style="left:50%"></span><span class="b" style="left:${left}%;width:${w}%;background:${r._gain >= 0 ? "#2ab7b7" : col}"></span></span></span>${chip}`;
      }
      row.innerHTML = html;
      requestAnimationFrame(() => { row.style.transform = `translateY(${i * RH}px)`; row.style.opacity = 1; });
    });
    [...box.children].forEach((c) => { if (!seen.has(c.id)) { c.style.opacity = 0; setTimeout(() => c.remove(), 400); } });
    box.style.height = items.length * RH + "px";
    document.getElementById("valhead").innerHTML = `${higher ? "Value" : "Value (lower is better)"} · Δ vs C<sub>0</sub>`;
    const notes = [];
    if (missing) notes.push(`${missing} run(s) have no ${mlabel} value in this view${D.variant === "anon" ? " in the paper" : ""}.`);
    if (state.suite !== "core") notes.push("Only the core suite carries intervals; extension values are point estimates.");
    if (state.suite === "expanded") notes.push("Expanded panel: C0 and T7 of the eight main runs on 720 scenarios (630 targets); not an independent test split.");
    notes.push("Verdict chips use the paired 95% interval of Δfin CLS-NR (core suite).");
    document.getElementById("explnote").textContent = notes.join(" ");
    renderC0(panel, c0, mlabel, dp);
    renderBump(mk, higher);
  }
  function renderC0(panel, c0, mlabel, dp) {
    const P = document.getElementById("c0panel"), src = panel === "expanded720" ? LB.c0_expanded : LB.c0, c = src && src[state.planner];
    if (!c) { P.innerHTML = ""; return; }
    const cells = [["CLS_NR", "CLS-NR"], ["CLS_R", "CLS-R"], ["SR_NR", "SR-NR"], ["SR_R", "SR-R"], ["ADE8s", "ADE₈ₛ"], ["cachedADE", "cached ADE"]].filter(([k]) => c[k] != null);
    P.innerHTML = `<h4>Deployed C<sub>0</sub> · ${PLN[state.planner]}</h4><p class="hint">${panel === "expanded720" ? "720-scenario panel (630 targets)" : "64-scenario core panel (56 targets) · cached ADE on 5,120 dev samples"}</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">${cells.map(([k, l]) => `<div style="border:1px solid #1c2531;border-radius:10px;padding:8px 10px"><div class="mono" style="font-size:10.5px;color:#66717f;letter-spacing:.08em">${l}</div><div style="font-family:var(--display);font-size:20px;font-weight:700">${fmt(c[k], 3)}</div></div>`).join("")}</div>`;
  }
  function renderBump(mk, higher) {
    const host = document.getElementById("bump");
    const regs = ["Full-FT", "Adapter-FT", "Replay", "PEGP-style"], sts = ["forward-s1", "forward-s2", "reverse", "third"];
    const labs = ["main", "seed 2", "reverse", "third"];
    const ranks = {};
    sts.forEach((st) => {
      const vals = regs.map((r) => { const run = LB.runs.find((x) => x.planner === state.planner && x.regime === r && x.stream === st && (x.family === "core" || x.family === "third")); return [r, run ? run.metrics[mk] : null]; }).filter((x) => x[1] != null);
      vals.sort((a, b) => higher ? b[1] - a[1] : a[1] - b[1]);
      vals.forEach(([r], i) => { (ranks[r] = ranks[r] || {})[st] = i + 1; });
    });
    const W = 380, H = 220, s = chartFrame(host, W, H);
    const xs = (i) => 60 + i * 95, ys = (rk) => 30 + (rk - 1) * 50;
    sts.forEach((st, i) => sv("text", { x: xs(i), y: H - 6, "text-anchor": "middle", class: "tick", style: "fill:#a1acba" }, s, labs[i]));
    [1, 2, 3, 4].forEach((rk) => sv("text", { x: 14, y: ys(rk) + 4, class: "tick" }, s, "#" + rk));
    regs.forEach((r, ri) => {
      const pts = sts.map((st, i) => ranks[r] && ranks[r][st] ? [xs(i), ys(ranks[r][st])] : null).filter(Boolean);
      if (pts.length < 2) return;
      const path = sv("path", { d: pts.map((p, i) => (i ? "L" : "M") + p.join(",")).join(""), fill: "none", stroke: REG_COL[r], "stroke-width": 3, "stroke-linejoin": "round", opacity: 0.9 }, s);
      const len = path.getTotalLength(); path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
      tween(900, (q) => path.style.strokeDashoffset = len * (1 - q), ri * 120);
      pts.forEach((p) => sv("circle", { cx: p[0], cy: p[1], r: 6, fill: REG_COL[r], stroke: "#0c1118", "stroke-width": 2 }, s));
    });
    const missing = sts.some((st) => regs.some((r) => !(ranks[r] && ranks[r][st])));
    document.getElementById("bumphint").textContent = `${PLN[state.planner]} · rank 1 = best · core regimes in each stream setting` + (missing ? " (missing values skipped)" : "");
  }

  /* ================================================================== BibTeX copy */
  const cb = document.getElementById("copybib");
  if (cb) cb.onclick = () => {
    const t = document.getElementById("bibtext").innerText;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { cb.textContent = "Copied ✓"; setTimeout(() => cb.textContent = "Copy", 1600); })
      .catch(() => { const r = document.createRange(); r.selectNode(document.getElementById("bibtext")); getSelection().removeAllRanges(); getSelection().addRange(r); });
  };
})();
