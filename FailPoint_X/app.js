"use strict";
const data = window.FPX_DATA;
const labels = {wrong_placement:"Wrong placement",wrong_object:"Wrong object",collision:"Collision",missed_grasp:"Missed grasp",stuck:"No progress (stuck)",dropped:"Dropped object",drawer_not_closed:"Unclosed drawer"};
const byId = id => document.getElementById(id);
let selectedCase = data.cases[0], selectedFrame = 1, replayFrame = 0;
const names = {base_restart:"Base-restart",takeover_bc:"Takeover-BC",iql_r2:"IQL-R2"};
const colors = {base_restart:"var(--base)",takeover_bc:"var(--bc)",iql_r2:"var(--iql)"};
function node(tag, text, className) { const el=document.createElement(tag); if(text!==undefined) el.textContent=text; if(className) el.className=className; return el; }
function selectTab() {
  const tab = ["explorer","levels","replays"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "explorer";
  document.querySelectorAll(".tab-panel").forEach(el => { el.hidden = el.id !== tab; });
  document.querySelectorAll("[data-tab]").forEach(el => {const active=el.dataset.tab===tab;el.classList.toggle("active",active);if(active)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current");});
}
function filteredCases() {return data.cases.filter(c => (byId("level-filter").value==="all" || c.level===byId("level-filter").value) && (byId("type-filter").value==="all" || c.type===byId("type-filter").value));}
function renderCaseList() {
  const cases=filteredCases();
  if(cases.length && !cases.includes(selectedCase)){selectedCase=cases[0];selectedFrame=1;}
  byId("case-count").textContent=`${cases.length} selected example${cases.length===1?"":"s"}`;
  byId("case-list").replaceChildren();
  if(!cases.length){byId("case-list").append(node("p","No examples match these filters.","filter-count"));document.querySelector(".case-viewer").hidden=true;return;}
  document.querySelector(".case-viewer").hidden=false;
  cases.forEach(c => {const b=node("button",labels[c.type]);b.type="button";b.classList.toggle("selected",c===selectedCase);b.setAttribute("aria-pressed",String(c===selectedCase));b.append(node("small",`Family ${c.family} · ${c.level}`));b.onclick=()=>{selectedCase=c;selectedFrame=1;renderCaseList();};byId("case-list").append(b);});
  renderCase();
}
function renderCase() {
  const c=selectedCase,f=c.frames[selectedFrame];
  byId("case-family").textContent=`Family ${c.family} · ${c.level} · ${labels[c.type]}`;
  byId("case-id").textContent=c.id;
  byId("case-task").textContent=c.prompt;
  byId("case-image").src=f.src;
  byId("case-image").alt=`${labels[c.type]}, family ${c.family} ${c.level}, recorded source frame ${f.step}`;
  byId("image-label").textContent=`Frame ${f.step} · ${f.mark==="later"?"Later context":f.mark==="m"?"Midpoint":f.mark==="a"?"Interval start":"Interval end"}`;
  const fields=[['Failure type',labels[c.type]],['Source seed',c.seed],['Interval [a, b]',`[${c.interval.join(", ")}]`],['Midpoint m',c.midpoint],['Selected frame',f.step]];
  byId("case-fields").replaceChildren(...fields.flatMap(([k,v])=>[node("dt",k),node("dd",String(v))]));
  byId("interval-note").textContent=f.mark==="later"?"Later context: this image is outside [a, b]. It makes the subsequent visible outcome easier to inspect.":"The interval records uncertainty in failure onset. The held-out evaluator uses the interval midpoint.";
  const marks=["a · Start","m · Midpoint","b · End","Later context"];
  byId("frame-controls").replaceChildren(...c.frames.map((f,i)=>{const b=node("button");b.type="button";b.classList.toggle("active",i===selectedFrame);b.setAttribute("aria-pressed",String(i===selectedFrame));b.append(node("span","","point"),node("span",marks[i]),node("small",`Frame ${f.step}`));b.onclick=()=>{selectedFrame=i;renderCase();};return b;}));
}
function renderReplays() {
  const cam=byId("replay-camera").value;
  const title=["t = 0","t = 50","t = 100","t = 150","Endpoints"];
  byId("replay-controls").replaceChildren(...title.map((t,i)=>{const b=node("button",t);b.type="button";b.classList.toggle("active",replayFrame===i);b.setAttribute("aria-pressed",String(replayFrame===i));b.onclick=()=>{replayFrame=i;renderReplays();};return b;}));
  byId("replay-grid").replaceChildren(...data.replays.runs.map(r=>{const f=r.frames[replayFrame],card=node("article",undefined,"replay-card");card.style.setProperty("--arm-color",colors[r.id]);card.append(node("h3",names[r.id]));const im=node("img");im.src=f[cam];im.alt=`${names[r.id]}, ${cam} camera, ${f.step} control steps after restart`;card.append(im);const result=node("div",undefined,"replay-result");result.append(node("strong",r.success?"Success":"Timeout"),node("span",r.success?`Success step ${r.success_step}`:"No success by 1,200"));card.append(result,node("p",`Shown step: ${f.step}`,"replay-time"));return card;}));
  byId("replay-time-note").textContent=replayFrame===4?"Actual endpoints: Base at 1,200, Takeover-BC at 186, IQL-R2 at 184. These three images are not at a common time.":"All three images are at the same number of control steps after restart. Keyframes show recorded execution, not a live simulator.";
}
function renderExecutionVideos() {
  const camera=byId("video-camera").value;
  document.querySelectorAll("#execution-grid video").forEach(video=>video.pause());
  byId("execution-grid").replaceChildren(...data.replays.runs.map(run=>{
    const terminal=run.frames[run.frames.length-1].step;
    const card=node("article",undefined,"replay-card");
    card.style.setProperty("--arm-color",colors[run.id]);
    const heading=node("h3",names[run.id]);heading.id=`${run.id}-video-heading`;
    const video=node("video");video.controls=true;video.playsInline=true;video.muted=true;video.preload="metadata";
    video.setAttribute("aria-labelledby",heading.id);
    video.src=`media/${run.id}_${camera}.mp4`;video.poster=run.frames[0][camera];
    const outcome=node("div",undefined,"replay-result");
    outcome.append(node("strong",run.success?"Success":"Timeout"),node("span",run.success?`Success step ${run.success_step}`:`Horizon ${terminal.toLocaleString()}`));
    const progress=node("p",`Shown step: 0 / ${terminal.toLocaleString()}`,"replay-time");
    const updateProgress=()=>{const step=Math.min(terminal,Math.floor(video.currentTime*20+0.000001));progress.textContent=`Shown step: ${step.toLocaleString()} / ${terminal.toLocaleString()}${video.ended?" · Recording ended":""}`;};
    video.addEventListener("timeupdate",updateProgress);video.addEventListener("ended",updateProgress);
    video.addEventListener("error",()=>{byId("video-status").textContent="A video could not be loaded. Try its Open video link or reload the page.";});
    const open=node("a","Open video","open-video");open.href=video.src;open.target="_blank";open.rel="noopener";
    card.append(heading,video,outcome,progress,open);return card;
  }));
  byId("video-status").textContent="Play together restarts all three recordings from the shared failure state.";
}
byId("video-camera").onchange=renderExecutionVideos;
byId("play-videos").onclick=()=>{
  const videos=Array.from(document.querySelectorAll("#execution-grid video"));
  videos.forEach(video=>{video.pause();if(video.readyState>=1)video.currentTime=0;});
  Promise.allSettled(videos.map(video=>video.play())).then(results=>{
    byId("video-status").textContent=results.some(result=>result.status==="rejected")?"Use each video's play control if your browser blocks simultaneous playback.":"Playing from the same start at 1× speed. Successful recordings stop at their own endpoints while Base-restart continues.";
  });
};
byId("pause-videos").onclick=()=>{document.querySelectorAll("#execution-grid video").forEach(video=>video.pause());byId("video-status").textContent="All recordings paused.";};
for(const type of Object.keys(labels)){const opt=node("option",labels[type]);opt.value=type;byId("type-filter").append(opt);}
byId("level-filter").onchange=renderCaseList;byId("type-filter").onchange=renderCaseList;
byId("replay-camera").onchange=renderReplays;
byId("replay-task").textContent=data.replays.task;
byId("level-gallery").replaceChildren(...[1,2,3,4,5].map((n,i)=>{const card=node("article",undefined,"level-card");card.append(node("h3",`L${n}`));const im=node("img");im.src=`assets/L${n}_initial.jpg`;im.alt=`Family 12 L${n} recorded initial scene, source seed ${data.environment.seeds[i]}`;card.append(im,node("p",n===5?"Paraphrased instruction":`Source seed ${data.environment.seeds[i]}`));return card;}));
window.addEventListener("hashchange",selectTab);
selectTab();renderCaseList();renderReplays();renderExecutionVideos();
