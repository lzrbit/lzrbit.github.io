# Execution videos

These six H.264 MP4s render every saved MuJoCo state from the already recorded autonomous policy rollouts used in the qualitative case study. Each policy has overview and wrist views at native 256 × 256 resolution and 20 fps. No new action execution, policy inference or evaluation was performed to make these files. All frames come from saved states; there is no temporal interpolation or AI image generation.

The recordings start at the same held-out failure midpoint (family 0, L1, source seed 4008, midpoint 281, sampling index k = 0). Base-restart reaches 1,200 steps without success. Takeover-BC succeeds at 186 steps; IQL-R2 succeeds at 184. This is one post-hoc selected qualitative case, with the original-versus-new Base termination difference disclosed in the main provenance notes.

There are 1,201, 187 and 185 frames per view, respectively: one initial state followed by one state after each executed action. The terminal state is the final member of that sequence. Container durations are therefore 60.05, 9.35 and 9.25 seconds. No terminal frames are repeated to length-match the policies, and videos do not loop.

State restoration was checked against the archived trajectories, with maximum absolute numerical difference 2.23e-16. Re-rendering was also compared with all 322 previously captured snapshots: the largest per-image mean absolute RGB difference was 0.491 on a 0–255 scale. Re-rendered videos should not be treated as byte-identical copies of the earlier PNGs. The original keyframe images remain unchanged.

All MP4s have their metadata before the media data for progressive browser loading. File hashes, frame counts, durations, source trajectory hashes and outcome labels are in manifest.json. The [benchmark code](https://github.com/yujieyan81/failpoint-x) provides the scorer, evaluation clients, post-training code and recorded Base-restart outcomes. Full trajectories, restorable states and model weights are not included in this preview.
