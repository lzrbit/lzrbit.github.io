"use strict";
const el = id => document.getElementById(id);
const number = value => value.toLocaleString("en-US");
const score = value => value.toFixed(1) + "%";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
function reveal(node) {
  if (!reducedMotion.matches) node.animate([{opacity: .4, transform: "translateY(4px)"}, {opacity: 1, transform: "none"}], {duration: 260});
}

const film = el("film");
const play = el("play");
function showPosterButton() {
  film.controls = false;
  play.hidden = false;
}
showPosterButton();
play.addEventListener("click", async () => {
  film.controls = true;
  play.hidden = true;
  try { await film.play(); }
  catch { film.controls = true; }
});
film.addEventListener("play", () => { play.hidden = true; film.controls = true; });

const stageLabels = ["Policy failures", "Human takeovers", "Post-training", "Evaluation"];
const stepButtons = paper.steps.map((step, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = stageLabels[index];
  button.setAttribute("aria-controls", "stage-title");
  button.addEventListener("click", () => { stopFigure(); showStep(index); });
  el("steps").append(button);
  return button;
});
let activeStep = 0;
let timer = null;
function showStep(index) {
  activeStep = index;
  const step = paper.steps[index];
  el("stage-image").src = step.image;
  el("stage-counter").textContent = "Stage " + (index + 1) + " of " + paper.steps.length;
  el("stage-title").textContent = step.title;
  el("stage-copy").textContent = step.description;
  el("stage-metric").textContent = step.metric;
  stepButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(index === i)));
  reveal(el("stage-image"));
}
function stopFigure() {
  clearInterval(timer);
  timer = null;
  el("figure-label").textContent = "Play sequence";
  el("figure-play").setAttribute("aria-pressed", "false");
}
el("figure-play").addEventListener("click", () => {
  if (timer !== null) { stopFigure(); return; }
  if (activeStep === paper.steps.length - 1) showStep(0);
  el("figure-play").setAttribute("aria-pressed", "true");
  el("figure-label").textContent = "Pause sequence";
  timer = setInterval(() => {
    showStep(activeStep + 1);
    if (activeStep === paper.steps.length - 1) stopFigure();
  }, 3500);
});
document.addEventListener("visibilitychange", () => { if (document.hidden) stopFigure(); });
showStep(0);

const levelSelect = el("level");
paper.levels.forEach(level => levelSelect.add(new Option(level.level + " · " + level.name, level.level)));
const levelVideo = el("level-replay");
const previewLevels = el("preview-levels");
let previewLevel = paper.levels[0];
let replayVisible = false;
let playOnView = true;

function playLevelWhenVisible() {
  if (replayVisible && playOnView && !document.hidden && !reducedMotion.matches) {
    playOnView = false;
    levelVideo.play().catch(() => {}); // Native controls remain available if autoplay is blocked.
  }
}
const finalPlacement = el("final-placement");

function updateReplayProgress(time = levelVideo.currentTime) {
  const replay = previewLevel.replay;
  const frame = finalPlacement.hidden ? Math.floor(time * replay.fps + 0.0001) : replay.terminal;
  let current = replay.changes[0][1];
  for (const [at, flags] of replay.changes) {
    if (at > frame) break;
    current = flags;
  }
  const phase = frame >= replay.terminal ? "Task complete" : frame >= replay.handoff ? "Human takeover" : "Policy attempt";
  el("replay-phase").textContent = phase;
  Array.from(el("replay-goals").children).forEach((row, i) => {
    row.dataset.met = String(current[i]);
    row.querySelector(".goal-state").textContent = current[i] ? "In place" : "Pending";
  });
}

function setFinalView(show) {
  const replay = previewLevel.replay;
  if (show) {
    playOnView = false;
    levelVideo.pause();
    finalPlacement.alt = "Final placement: " + replay.goals.join(" and ") + ".";
    finalPlacement.src = replay.finalView;
  }
  levelVideo.hidden = show;
  finalPlacement.hidden = !show;
  el("view-final").textContent = show ? "Back to replay" : "View final placement";
  updateReplayProgress();
}
el("view-final").addEventListener("click", () => setFinalView(finalPlacement.hidden));
for (const event of ["timeupdate", "seeked", "ended"]) {
  levelVideo.addEventListener(event, () => updateReplayProgress());
}

function showLevelReplay(level) {
  previewLevel = level;
  if (levelVideo.getAttribute("src") !== level.replay.video) {
    setFinalView(false);
    levelVideo.pause();
    levelVideo.poster = level.replay.poster;
    levelVideo.src = level.replay.video;
    levelVideo.setAttribute("aria-label", level.level + " policy attempt and completed human takeover");
    playOnView = true;
  }
  for (const button of previewLevels.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.value === level.level));
  }
  const replay = level.replay;
  el("goal-note").hidden = level.level !== "L2";
  el("scene-caption").textContent = level.level + " · Family " + replay.family + " · seed " + replay.seed + " · policy attempt and human takeover";
  el("level-instruction").textContent = "“" + replay.instruction + "”";
  el("replay-goals").replaceChildren(...replay.goals.map(label => {
    const row = document.createElement("li");
    const state = document.createElement("span");
    state.className = "goal-state";
    row.append(document.createTextNode(label), state);
    return row;
  }));
  updateReplayProgress(levelVideo.readyState ? levelVideo.currentTime : 0);
  playLevelWhenVisible();
}
for (const level of paper.levels) {
  const button = document.createElement("button");
  button.type = "button";
  button.value = level.level;
  button.textContent = level.level;
  button.setAttribute("aria-label", "Preview " + level.level + " · " + level.name);
  button.addEventListener("click", () => showLevelReplay(level));
  previewLevels.append(button);
}
if ("IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => {
    replayVisible = entry.intersectionRatio >= 0.4;
    if (replayVisible) playLevelWhenVisible();
    else levelVideo.pause();
  }, {threshold: [0, 0.4]}).observe(levelVideo);
}
levelVideo.addEventListener("play", () => { playOnView = false; });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) levelVideo.pause();
  else playLevelWhenVisible();
});
function updateDataset() {
  const chosen = paper.levels.find(level => level.level === levelSelect.value);
  const dataset = chosen || paper.summary;
  el("data-label").textContent = chosen ? chosen.level : "L1–L5";
  el("data-heading").textContent = chosen ? chosen.name : "All task levels";
  const stats = [
    ["Training failure states", dataset.train],
    ["Held-out failure states", dataset.heldOut],
    ["Takeover attempts on active sources", chosen ? chosen.attempts : dataset.activeAttempts],
    ["Accepted human recoveries", dataset.accepted]
  ];
  const pairs = stats.map(([label, value]) => {
    const div = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = label; dd.textContent = number(value); div.append(dt, dd); return div;
  });
  el("data-stats").replaceChildren(...pairs);
  el("data-footnote").textContent = chosen
    ? chosen.configs + " complete configurations · " + chosen.completeSources + " complete takeover sources."
    : "48 complete configurations across 10 families. Of 2,400 accepted recoveries, 2,320 were used for post-training and 80 for development. Including archived sources, 2,823 attempts were logged.";
  previewLevels.hidden = Boolean(chosen);
  showLevelReplay(chosen || previewLevel);
}
levelSelect.addEventListener("change", updateDataset);
updateDataset();

const arm = id => paper.arms.find(item => item.id === id);
const stories = [
  {label:"Q1 · L1–L3 recovery", title:"Human recoveries improve failure recovery.", text:"Takeover-BC and Demo-continue share the same actor-update budget.", ids:["demo_continue","takeover_bc"], key:"rec_l13", contrast:"Q1", unit:"Held-out recovery success"},
  {label:"Q2 · L1–L3 recovery", title:"The tested value-weighted recipe has an uncertain advantage.", text:"IQL-R2 adds failed trajectories and value weighting. Its paired interval includes zero.", ids:["takeover_bc","iql_r2"], key:"rec_l13", contrast:"Q2", unit:"Held-out recovery success"},
  {label:"Exploratory · nominal starts", title:"Recovery training costs nominal success.", text:"Takeover-BC succeeds less often than Base-restart from ordinary task starts.", ids:["base_restart","takeover_bc"], key:"nominal", unit:"Success on valid nominal starts"}
];
function setStory(index) {
  const story = stories[index];
  const contrast = paper.contrasts.find(row => row.id === story.contrast);
  document.querySelectorAll("[data-story]").forEach((button,i) => button.setAttribute("aria-pressed", String(i === index)));
  el("story-label").textContent = story.label;
  // The manuscript calculates paired differences on unrounded scores.
  const headline = contrast ? "+" + contrast.delta.toFixed(1) : score(arm("takeover_bc").nominal);
  el("story-number").textContent = headline;
  if (contrast) { const unit = document.createElement("small"); unit.textContent = "pp"; el("story-number").append(unit); }
  el("story-title").textContent = story.title; el("story-detail").textContent = story.text;
  el("story-unit").textContent = story.unit;
  story.ids.forEach((id, i) => {
    const method = arm(id), value = method[story.key];
    let row = el("story-bars").children[i];
    if (!row) {
      row = document.createElement("div"); row.className = "comparison-row";
      row.innerHTML = '<span></span><strong></strong><div class="comparison-track" aria-hidden="true"><i></i></div>';
      el("story-bars").append(row);
    }
    row.children[0].textContent = method.name; row.children[1].textContent = score(value);
    row.querySelector("i").style.width = value + "%";
  });
  el("story-interval").textContent = contrast ? "Paired-family 95% BCa interval: " + contrast.ci.map(n => n.toFixed(1).replace("-","−")).join(" to ") + " pp." : "Pooled over 437 valid nominal starts at 1,200 steps.";
  reveal(el("story-number"));
}
document.querySelectorAll("[data-story]").forEach((button,i) => button.addEventListener("click", () => setStory(i)));
setStory(0);

const metricSelect = el("metric"), ranksSelect = el("rank-level");
function rankingOptions() {
  const recover = metricSelect.value === "recovery", oldValue = ranksSelect.value;
  const options = recover ? [["rec_l13","L1–L3 (primary)"],["rec_l45","L4–L5"]] : [["nominal","All valid starts"]];
  paper.levels.forEach(level => options.push([level.level,level.level]));
  ranksSelect.replaceChildren(...options.map(([value,label]) => new Option(label,value)));
  if (options.some(([value]) => value === oldValue)) ranksSelect.value = oldValue;
  showRanks();
}
function showRanks() {
  const level = ranksSelect.value, recover = metricSelect.value === "recovery";
  const single = paper.levels.findIndex(item => item.level === level);
  const rows = paper.arms.map(method => ({method,value:single < 0 ? method[level] : method[recover ? "rec_levels" : "nominal_levels"][single]}));
  rows.sort((a,b) => b.value - a.value || a.method.name.localeCompare(b.method.name));
  let lastValue, rank;
  const ranked = rows.map(({method,value}, i) => {
    if (lastValue !== value) rank = i + 1;
    lastValue = value;
    const row = document.createElement("tr");
    row.innerHTML = '<td></td><th scope="row"></th><td><div class="rate"><span class="track" aria-hidden="true"><i></i></span><b></b></div></td>';
    row.children[0].textContent = rank; row.children[1].textContent = method.name;
    if (method.exploratory) { const mark = document.createElement("sup"); mark.textContent = "†"; mark.className = "exp-mark"; row.children[1].append(mark); }
    row.querySelector("i").style.width = value + "%"; row.querySelector("b").textContent = score(value);
    if (level === "rec_l13") {
      const interval = document.createElement("small");
      interval.className = "rank-interval";
      interval.textContent = "95% CI " + method.rec_l13_ci.map(score).join("–");
      row.lastElementChild.append(interval);
    }
    return row;
  });
  el("rank-rows").replaceChildren(...ranked);
  el("rank-caption").textContent = metricSelect.selectedOptions[0].text + " · " + ranksSelect.selectedOptions[0].text;
  el("rank-note").textContent = recover
    ? "Recovery averages task families after three policy samples per held-out state. L1–L3 covers 240 states and L4–L5 covers 144. L1–L3 intervals quantify uncertainty for each checkpoint. Pairwise comparisons are shown above. Per-level results are descriptive."
    : "Nominal success pools the starts passing the frozen validity check within the selected levels. All nominal comparisons are exploratory.";
}
metricSelect.addEventListener("change", rankingOptions);
ranksSelect.addEventListener("change", showRanks);
rankingOptions();

el("bib-text").textContent = citation;
el("copy-bib").addEventListener("click", async () => {
  let copied = false;
  try { await navigator.clipboard.writeText(citation + "\n"); copied = true; }
  catch {
    const range = document.createRange(); range.selectNodeContents(el("bib-text"));
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    try { copied = document.execCommand("copy"); } catch { /* The selected citation can be copied manually. */ }
    if (copied) selection.removeAllRanges();
  }
  el("copy-bib").textContent = copied ? "Copied" : "Text selected";
  el("copy-status").textContent = copied ? "BibTeX copied to clipboard." : "BibTeX selected. Use your system copy command.";
});
