// Build native text tracks from the cues below so the captions do not depend on
// loading a separate VTT file.
const reviewCaptionTracks = [
  {
    "kind": "captions",
    "language": "en",
    "label": "English",
    "cues": [
      [
        0.68,
        3.466,
        "Can a robot learn to recover from its own mistakes?"
      ],
      [
        3.726,
        7.605,
        "FailPoint-X studies offline post-training from human takeovers."
      ],
      [
        8.61,
        13.208,
        "The black book belongs in the front compartment of the caddy. The\nrobot has already missed."
      ],
      [
        13.468,
        16.466,
        "Watch two policies restart from exactly that moment."
      ],
      [
        16.726,
        23.061,
        "In this replay, the base policy times out. The policy trained on\nhuman recoveries puts the book away."
      ],
      [
        24.06,
        29.026,
        "An overall success rate hides whether the robot avoided a mistake\nor recovered after making it."
      ],
      [
        29.286,
        33.984,
        "And extra training alone might help. How much do the human\ncorrections contribute?"
      ],
      [
        34.96,
        40.431,
        "We record failures from one checkpoint. An annotator marks the\ninterval where each failure begins."
      ],
      [
        40.691,
        45.715,
        "A human takes over from sampled states in training intervals and\nfinishes the original task."
      ],
      [
        45.975,
        50.505,
        "We match the training budget, then restart every method at the same\nheld-out midpoints."
      ],
      [
        51.51,
        57.405,
        "Across ten task families and five levels, we collect 2,400 accepted\nhuman recoveries."
      ],
      [
        57.665,
        63.663,
        "Eighty are reserved for development. Nine methods face the same 384\nheld-out failure states."
      ],
      [
        64.66,
        71.597,
        "Demo-continue recovers in 22.5 percent of trials. Takeover-BC\nrecovers in 51.9 percent."
      ],
      [
        71.857,
        77.231,
        "At equal training budgets, that is a 29.4 percentage point gain on\nlevels one through three."
      ],
      [
        78.21,
        84.934,
        "From ordinary starts, Base-restart succeeds in 43.9 percent of\ntrials."
      ],
      [
        85.194,
        91.576,
        "Takeover-BC succeeds in 14 percent of trials. Recovery and\nretention tell different stories."
      ]
    ]
  },
  {
    "kind": "subtitles",
    "language": "zh-Hans",
    "label": "中文 + English",
    "cues": [
      [
        0.68,
        3.466,
        "机器人能学会从自己的失误中恢复吗？\nCan a robot learn to recover from its own mistakes?"
      ],
      [
        3.726,
        7.605,
        "FailPoint-X 研究如何利用人类接管数据，对机器人策略进行离线后训练。\nFailPoint-X studies offline post-training from human takeovers."
      ],
      [
        8.61,
        13.208,
        "黑色的书本该放进收纳架的前格，机器人却放偏了。\nThe black book belongs in the front compartment of the caddy. The robot has already missed."
      ],
      [
        13.468,
        16.466,
        "看这两种策略从同一个失败状态重新开始。\nWatch two policies restart from exactly that moment."
      ],
      [
        16.726,
        23.061,
        "这次回放中，基础策略最终超时。用人类纠正轨迹训练过的策略把书放回了前格。\nIn this replay, the base policy times out. The policy trained on human recoveries puts the book away."
      ],
      [
        24.06,
        29.026,
        "只看总体成功率，很难分清机器人是避开了错误，还是出错后又完成了任务。\nAn overall success rate hides whether the robot avoided a mistake or recovered after making it."
      ],
      [
        29.286,
        33.984,
        "多训练一段时间也可能带来提升。人类纠正本身贡献了多少？\nAnd extra training alone might help. How much do the human corrections contribute?"
      ],
      [
        34.96,
        40.431,
        "我们记录同一个策略检查点产生的失败轨迹，由标注者圈出每次失败开始的时间区间。\nWe record failures from one checkpoint. An annotator marks the interval where each failure begins."
      ],
      [
        40.691,
        45.715,
        "训练时，我们从这些区间内抽取状态，让操作者接管机器人，完成原任务。\nA human takes over from sampled states in training intervals and finishes the original task."
      ],
      [
        45.975,
        50.505,
        "各方法采用相同的训练预算，评测时都从同一组留出失败区间的中点重新开始。\nWe match the training budget, then restart every method at the same held-out midpoints."
      ],
      [
        51.51,
        57.405,
        "数据覆盖 10 个任务族、5 个难度等级，共收录 2,400 条通过验收的人类恢复轨迹。\nAcross ten task families and five levels, we collect 2,400 accepted human recoveries."
      ],
      [
        57.665,
        63.663,
        "其中 80 条留作开发。9 种方法在相同的 384 个留出失败状态上接受评测。\nEighty are reserved for development. Nine methods face the same 384 held-out failure states."
      ],
      [
        64.66,
        71.597,
        "在恢复评测中，Demo-continue 的成功率为 22.5%，Takeover-BC 为 51.9%。\nDemo-continue recovers in 22.5 percent of trials. Takeover-BC recovers in 51.9 percent."
      ],
      [
        71.857,
        77.231,
        "两者训练预算相同，在 L1–L3 的恢复成功率相差 29.4 个百分点。\nAt equal training budgets, that is a 29.4 percentage point gain on levels one through three."
      ],
      [
        78.21,
        84.934,
        "从常规起点出发，Base-restart 的成功率为 43.9%。\nFrom ordinary starts, Base-restart succeeds in 43.9 percent of trials."
      ],
      [
        85.194,
        91.576,
        "Takeover-BC 的常规起点成功率为 14%。恢复能力提高了，常规任务表现却下降了。\nTakeover-BC succeeds in 14 percent of trials. Recovery and retention tell different stories."
      ]
    ]
  }
];
const reviewFilm = document.getElementById("film");
for (const definition of reviewCaptionTracks) {
  const track = reviewFilm.addTextTrack(definition.kind, definition.label, definition.language);
  for (const [start, end, text] of definition.cues) {
    track.addCue(new VTTCue(start, end, text));
  }
  track.mode = definition.language === "en" ? "showing" : "disabled";
}
