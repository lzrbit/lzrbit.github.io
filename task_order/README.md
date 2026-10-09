# Task Order project page

Standalone static research page at https://lzrbit.github.io/task_order/.
It uses only local HTML, CSS, JavaScript, figures, and results; no build step or third-party runtime is required. The existing homepage is unchanged.

## Assets and data

- `assets/paper.pdf` is the 13-page manuscript dated 9 October 2026.
- WebP figures are rendered from the manuscript's PDF figures. The teaser's ranking panel contains measured FDE-CT values; its lower panel is schematic. The entire framework figure is schematic.
- `assets/results.json` contains order-level means and sample standard deviations (`ddof=1`) from three training repetitions per algorithm and order. Its 384 means match `reproducibility/results/per_order.csv`; all means and standard deviations were independently checked against `reproducibility/inputs/performance_per_seed.csv` in [the analysis repository](https://github.com/lzrbit/task_order).
- Results retain the released units: FDE in metres, current-task MR in percent, and MR backward transfer in percentage points. Ranks use unrounded means.
- The feature figure summarises pooled historical time-step observations, not independent trajectory samples.
- `assets/provenance.json` records source and published-asset SHA-256 hashes. Update the PDF, images, data, and provenance together when releasing a manuscript revision.

## Local preview

Serve the repository root with any static HTTP server, then visit `/task_order/`. Serving over HTTP is needed for loading the JSON results.

## Release checks

The release was checked in an isolated headless browser at desktop and mobile widths, including 320 pixels. Checks covered all order/metric combinations in both ranking panels, figure enlargement and closing, mobile navigation, citation copying, resource loading, internal anchors, and absence of horizontal overflow. The GitHub Pages PDF and JSON are also checked against their local SHA-256 hashes after deployment.
