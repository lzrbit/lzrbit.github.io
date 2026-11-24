const paper = {
  "source": {
    "tables": [
      "Table 2",
      "Table 3",
      "Table F5"
    ],
    "horizon": 1200
  },
  "arms": [
    {
      "id": "base_restart",
      "name": "Base-restart",
      "exploratory": false,
      "rec_l13": 22.2,
      "rec_l13_ci": [
        16.1,
        28.6
      ],
      "rec_l45": 7.6,
      "nominal": 43.9,
      "nominal_strict": 33.6,
      "rec_levels": [
        26.2,
        21.2,
        19.2,
        9.3,
        6.0
      ],
      "nominal_levels": [
        77.3,
        51.8,
        44.3,
        27.3,
        19.3
      ]
    },
    {
      "id": "demo_continue",
      "name": "Demo-continue",
      "exploratory": false,
      "rec_l13": 22.5,
      "rec_l13_ci": [
        17.6,
        27.9
      ],
      "rec_l45": 6.0,
      "nominal": 46.2,
      "nominal_strict": 34.1,
      "rec_levels": [
        30.0,
        20.0,
        17.5,
        6.5,
        5.6
      ],
      "nominal_levels": [
        77.3,
        56.5,
        48.9,
        25.0,
        23.9
      ]
    },
    {
      "id": "takeover_bc",
      "name": "Takeover-BC",
      "exploratory": false,
      "rec_l13": 51.9,
      "rec_l13_ci": [
        38.2,
        64.9
      ],
      "rec_l45": 36.8,
      "nominal": 14.0,
      "nominal_strict": 0.5,
      "rec_levels": [
        62.5,
        50.0,
        43.3,
        40.7,
        32.9
      ],
      "nominal_levels": [
        21.6,
        14.1,
        12.5,
        12.5,
        9.1
      ]
    },
    {
      "id": "mix_bc",
      "name": "Mix-BC",
      "exploratory": true,
      "rec_l13": 45.3,
      "rec_l13_ci": [
        33.3,
        57.2
      ],
      "rec_l45": 26.2,
      "nominal": 27.5,
      "nominal_strict": 2.7,
      "rec_levels": [
        58.8,
        42.5,
        34.6,
        32.9,
        19.4
      ],
      "nominal_levels": [
        42.0,
        37.6,
        29.5,
        17.0,
        11.4
      ]
    },
    {
      "id": "iql_r2",
      "name": "IQL-R2",
      "exploratory": false,
      "rec_l13": 53.5,
      "rec_l13_ci": [
        39.2,
        67.5
      ],
      "rec_l45": 33.6,
      "nominal": 19.7,
      "nominal_strict": 2.3,
      "rec_levels": [
        65.0,
        47.9,
        47.5,
        38.0,
        29.2
      ],
      "nominal_levels": [
        27.3,
        22.4,
        21.6,
        11.4,
        15.9
      ]
    },
    {
      "id": "iql_r0",
      "name": "IQL-R0",
      "exploratory": true,
      "rec_l13": 48.9,
      "rec_l13_ci": [
        37.5,
        60.0
      ],
      "rec_l45": 32.6,
      "nominal": 11.2,
      "nominal_strict": 0.5,
      "rec_levels": [
        59.2,
        49.6,
        37.9,
        36.6,
        28.7
      ],
      "nominal_levels": [
        14.8,
        10.6,
        12.5,
        4.5,
        13.6
      ]
    },
    {
      "id": "awac",
      "name": "AWAC",
      "exploratory": true,
      "rec_l13": 53.8,
      "rec_l13_ci": [
        40.3,
        66.3
      ],
      "rec_l45": 30.6,
      "nominal": 14.4,
      "nominal_strict": 0.7,
      "rec_levels": [
        70.4,
        46.2,
        44.6,
        38.0,
        23.1
      ],
      "nominal_levels": [
        18.2,
        14.1,
        14.8,
        11.4,
        13.6
      ]
    },
    {
      "id": "bc_first32",
      "name": "First-of-32",
      "exploratory": true,
      "rec_l13": 52.1,
      "rec_l13_ci": [
        39.2,
        65.1
      ],
      "rec_l45": 36.3,
      "nominal": 14.6,
      "nominal_strict": 0.7,
      "rec_levels": [
        65.0,
        47.5,
        43.8,
        43.1,
        29.6
      ],
      "nominal_levels": [
        23.9,
        12.9,
        13.6,
        11.4,
        11.4
      ]
    },
    {
      "id": "idql_r2",
      "name": "IDQL-R2",
      "exploratory": true,
      "rec_l13": 40.7,
      "rec_l13_ci": [
        25.4,
        58.1
      ],
      "rec_l45": 17.8,
      "nominal": 2.7,
      "nominal_strict": 0.0,
      "rec_levels": [
        53.8,
        37.1,
        31.2,
        20.4,
        15.3
      ],
      "nominal_levels": [
        1.1,
        1.2,
        1.1,
        6.8,
        3.4
      ]
    }
  ],
  "levels": [
    {
      "level": "L1",
      "name": "Local spatial changes",
      "configs": 10,
      "train": 50,
      "heldOut": 80,
      "sources": 50,
      "completeSources": 50,
      "attempts": 589,
      "accepted": 500,
      "discarded": 21,
      "stopped": 68,
      "timedOut": 0,
      "physicsFaults": 0,
      "humanSuccess": 88.5,
      "medianSeconds": 7.0,
      "p90Seconds": 29.7,
      "controlStepsK": 121.3,
      "image": "assets/paper/level-1.jpg",
      "replay": {
        "video": "assets/task-levels/complete-l1.mp4",
        "poster": "assets/task-levels/complete-l1.jpg",
        "finalView": "assets/task-levels/complete-l1-final.jpg",
        "seed": 2036,
        "instruction": "place the red mug into the right desk caddy's right compartment and place the yellow book into the right desk caddy's back compartment",
        "family": 12,
        "goals": [
          "Red mug in the right compartment",
          "Yellow book in the back compartment"
        ],
        "fps": 20,
        "handoff": 254,
        "terminal": 751,
        "changes": [
          [
            0,
            [
              false,
              false
            ]
          ],
          [
            305,
            [
              true,
              false
            ]
          ],
          [
            751,
            [
              true,
              true
            ]
          ]
        ]
      }
    },
    {
      "level": "L2",
      "name": "Extended spatial changes",
      "configs": 10,
      "train": 52,
      "heldOut": 80,
      "sources": 50,
      "completeSources": 50,
      "attempts": 592,
      "accepted": 500,
      "discarded": 10,
      "stopped": 81,
      "timedOut": 0,
      "physicsFaults": 1,
      "humanSuccess": 86.3,
      "medianSeconds": 9.9,
      "p90Seconds": 28.9,
      "controlStepsK": 131.5,
      "image": "assets/paper/level-2.jpg",
      "replay": {
        "video": "assets/task-levels/complete-l2.mp4",
        "poster": "assets/task-levels/complete-l2.jpg",
        "finalView": "assets/task-levels/complete-l2-final.jpg",
        "seed": 2036,
        "instruction": "place the red mug into the right desk caddy's right compartment and place the yellow book into the right desk caddy's back compartment",
        "family": 12,
        "goals": [
          "Red mug in the right compartment",
          "Yellow book in the back compartment"
        ],
        "fps": 20,
        "handoff": 273,
        "terminal": 819,
        "changes": [
          [
            0,
            [
              false,
              false
            ]
          ],
          [
            318,
            [
              true,
              false
            ]
          ],
          [
            815,
            [
              false,
              false
            ]
          ],
          [
            817,
            [
              false,
              true
            ]
          ],
          [
            819,
            [
              true,
              true
            ]
          ]
        ]
      }
    },
    {
      "level": "L3",
      "name": "Scene topology",
      "configs": 10,
      "train": 50,
      "heldOut": 80,
      "sources": 50,
      "completeSources": 50,
      "attempts": 576,
      "accepted": 500,
      "discarded": 17,
      "stopped": 57,
      "timedOut": 1,
      "physicsFaults": 1,
      "humanSuccess": 89.9,
      "medianSeconds": 17.2,
      "p90Seconds": 42.8,
      "controlStepsK": 188.3,
      "image": "assets/paper/level-3.jpg",
      "replay": {
        "video": "assets/task-levels/complete-l3.mp4",
        "poster": "assets/task-levels/complete-l3.jpg",
        "finalView": "assets/task-levels/complete-l3-final.jpg",
        "seed": 2000,
        "instruction": "place the red mug into the right desk caddy's right compartment and place the yellow book into the right desk caddy's back compartment",
        "family": 12,
        "goals": [
          "Red mug in the right compartment",
          "Yellow book in the back compartment"
        ],
        "fps": 20,
        "handoff": 257,
        "terminal": 777,
        "changes": [
          [
            0,
            [
              false,
              false
            ]
          ],
          [
            332,
            [
              true,
              false
            ]
          ],
          [
            777,
            [
              true,
              true
            ]
          ]
        ]
      }
    },
    {
      "level": "L4",
      "name": "Visual attributes and objects",
      "configs": 9,
      "train": 47,
      "heldOut": 72,
      "sources": 47,
      "completeSources": 45,
      "attempts": 511,
      "accepted": 450,
      "discarded": 9,
      "stopped": 42,
      "timedOut": 3,
      "physicsFaults": 7,
      "humanSuccess": 91.1,
      "medianSeconds": 18.1,
      "p90Seconds": 40.3,
      "controlStepsK": 191.9,
      "image": "assets/paper/level-4.jpg",
      "replay": {
        "video": "assets/task-levels/complete-l4.mp4",
        "poster": "assets/task-levels/complete-l4.jpg",
        "finalView": "assets/task-levels/complete-l4-final.jpg",
        "seed": 2000,
        "instruction": "place the bbq sauce into the right desk caddy's right compartment and place the ketchup into the right desk caddy's left compartment",
        "family": 12,
        "goals": [
          "BBQ sauce in the right compartment",
          "Ketchup in the left compartment"
        ],
        "fps": 20,
        "handoff": 97,
        "terminal": 692,
        "changes": [
          [
            0,
            [
              false,
              false
            ]
          ],
          [
            408,
            [
              true,
              false
            ]
          ],
          [
            692,
            [
              true,
              true
            ]
          ]
        ]
      }
    },
    {
      "level": "L5",
      "name": "Paraphrased instruction",
      "configs": 9,
      "train": 46,
      "heldOut": 72,
      "sources": 45,
      "completeSources": 45,
      "attempts": 531,
      "accepted": 450,
      "discarded": 14,
      "stopped": 61,
      "timedOut": 0,
      "physicsFaults": 6,
      "humanSuccess": 88.4,
      "medianSeconds": 19.2,
      "p90Seconds": 39.0,
      "controlStepsK": 195.8,
      "image": "assets/paper/level-5.jpg",
      "replay": {
        "video": "assets/task-levels/complete-l5.mp4",
        "poster": "assets/task-levels/complete-l5.jpg",
        "finalView": "assets/task-levels/complete-l5-final.jpg",
        "seed": 2000,
        "instruction": "position the bbq sauce within the right desk organizer's right section and position the ketchup within the right desk organizer's left section",
        "family": 12,
        "goals": [
          "BBQ sauce in the right compartment",
          "Ketchup in the left compartment"
        ],
        "fps": 20,
        "handoff": 214,
        "terminal": 687,
        "changes": [
          [
            0,
            [
              false,
              false
            ]
          ],
          [
            354,
            [
              false,
              true
            ]
          ],
          [
            687,
            [
              true,
              true
            ]
          ]
        ]
      }
    }
  ],
  "contrasts": [
    {
      "id": "Q1",
      "label": "Takeover-BC minus Demo-continue",
      "delta": 29.4,
      "ci": [
        16.9,
        44.7
      ],
      "passed": true
    },
    {
      "id": "Q2",
      "label": "IQL-R2 minus Takeover-BC",
      "delta": 1.5,
      "ci": [
        -2.2,
        5.1
      ],
      "passed": false
    }
  ],
  "steps": [
    {
      "title": "Natural failures",
      "description": "A fixed π₀.₅ checkpoint attempts LIBERO-X tasks. An annotator brackets the onset of each selected failure.",
      "image": "assets/paper/step-1.webp",
      "metric": "629 natural failures"
    },
    {
      "title": "Protocol-timed human takeovers",
      "description": "A seeded procedure samples ten frames per training source. A human uses a SpaceMouse to complete the original task from each restored state.",
      "image": "assets/paper/step-2.webp",
      "metric": "2,823 logged attempts"
    },
    {
      "title": "Equal-budget post-training",
      "description": "Trained actors start from the failure-generating checkpoint. A demonstration-only control receives the same 12,134 actor updates.",
      "image": "assets/paper/step-3.webp",
      "metric": "9 evaluated arms"
    },
    {
      "title": "Restore and continue",
      "description": "Every arm resumes at the same held-out interval midpoint. A separate evaluation measures success from nominal starts.",
      "image": "assets/paper/step-4.webp",
      "metric": "384 held-out failures"
    }
  ],
  "summary": {
    "families": 10,
    "configs": 50,
    "completeConfigs": 48,
    "failures": 629,
    "train": 245,
    "heldOut": 384,
    "confirmatoryPoints": 240,
    "exploratoryPoints": 144,
    "nominalValid": 437,
    "attempts": 2823,
    "activeAttempts": 2799,
    "sources": 242,
    "completeSources": 240,
    "accepted": 2400,
    "postTrain": 2320,
    "development": 80,
    "updates": 12134,
    "arms": 9
  }
};
const citation = "@article{li2026failpointx,\n  title   = {{FailPoint-X}: A Policy-Matched, Failure-Anchored Benchmark for Offline {VLA} Post-Training from Human Takeovers},\n  author  = {Li, Zirui and Yan, Yujie and Qian, Jingxuan and Ren, Yangang and Han, Haizhou and Xu, Haoran and Lv, Chen},\n  journal = {arXiv preprint},\n  year    = {2026}\n}";
