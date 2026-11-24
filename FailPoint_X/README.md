# FailPoint-X project website

Project page of FailPoint-X (https://lzrbit.github.io/FailPoint_X/) with selected recorded examples. Open index.html for the film, framework, task-level data, results, and bilingual guides. Open explorer.html for the seven failure intervals and camera replays. All image paths are relative and all assets are local. No analytics or external fonts.

Authors: Zirui Li\*, Yujie Yan\*, Jingxuan Qian, Yangang Ren, Haizhou Han, Haoran Xu and Chen Lv† (Nanyang Technological University, Singapore). \*Equal contribution. †Corresponding author.

The failure explorer contains 7 selected examples, not the full dataset. Task-level gallery uses family 12 with source seeds 2036 and 2000. Policy replays show one post hoc selected held-out point and k0. Original Base failed through a physics fault at step 371; the new replay times out at 1,200 steps. These are qualitative new replays, not exact original trajectory reproduction or new aggregate estimates.

The [benchmark code](https://github.com/yujieyan81/failpoint-x) provides the scorer, evaluation clients, post-training code and recorded Base-restart outcomes. Full trajectories, restorable states and model weights are not included in this preview.

The Policy replays tab includes full per-step execution videos for Base-restart, Takeover-BC and IQL-R2, each with overview and wrist views. Play together starts all three from the common failure state; each recording ends at its own terminal state. Expand Inspect recorded keyframes for the earlier common-step and endpoint comparison. See media/manifest.json and media/README.md for video provenance and timing.
