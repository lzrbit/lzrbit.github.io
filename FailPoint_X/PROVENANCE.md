# Source provenance

Figures 2(a), B1 and B2 of the paper. The website uses byte-identical recorded frames selected for those figures.

Data snapshot counts are transcribed from the paper. The benchmark contains 629 failure states, 2,400 accepted recoveries, 384 held-out states and 10 task families. These describe the complete benchmark; the explorer is a small selected preview. The [benchmark code](https://github.com/yujieyan81/failpoint-x) provides the scorer, evaluation clients, post-training code and recorded Base-restart outcomes. Full trajectories, restorable states and model weights are not included in this preview.

Failure samples retain the original type, interval, midpoint, task, level, source seed and source identifier. Later context is explicitly outside the annotated interval. Family 12 L5 illustrates an instruction paraphrase; displayed images do not establish a controlled same-state visual comparison.

The policy gallery contains new RTX 5090 replays of the evaluated Base-restart, Takeover-BC and IQL-R2 actor checkpoints, selected post hoc before rerunning. All restores have zero state error and identical initial images. Original and new success outcomes at 1,200 steps match; Takeover-BC and IQL-R2 succeed at steps 186 and 184 in both. Observation traces differ; original Base k0 faults at step 371 while the new Base times out at 1,200 steps. No aggregate result is inferred.

The execution videos added on 2026-11-17 re-render every archived state of those same three rollouts at 20 fps in overview and wrist views. These are complete saved-state visualizations, with no new policy run, interpolated frames or repeated terminal holds. Each MP4 includes the initial and terminal states at native 256 × 256 resolution. Original PNG keyframes remain available. See media/README.md and media/manifest.json for numerical rendering checks, hashes and exact video timing.
