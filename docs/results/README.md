# `docs/results/` — auto-discovered experiment artefacts

Every subfolder here is a "run" that appears automatically on the website at
`/results`. There is no manifest to edit and no React component to add per
run — the Vite plugin `vite-plugin-results-index.ts` scans this directory at
dev start and build time.

## Folder contract

```
docs/results/
  <run-id>/                # slug, no spaces; sorts by `date` desc on the UI
    meta.json              # REQUIRED — see schema below
    <name>.png             # any number of figure PNGs
    metrics.json           # OPTIONAL — numeric series for the line chart
```

A folder without `meta.json` is ignored. A folder whose `meta.json` fails to
parse is rendered as an amber error card so you notice it.

## `meta.json` schema

```json
{
  "title": "TUM fr3/walking_xyz — V-KAN gate",
  "date": "2026-06-14",
  "dataset": "TUM RGB-D",
  "sequence": "fr3/walking_xyz",
  "tags": ["vkan", "dynamic", "gate"],
  "description": "ELBO + NOTEARS keyframe trigger on 858 frames.",
  "metrics": { "ate_rmse_m": 0.041, "keyframes": 92, "frames": 858 },
  "figures": [
    { "file": "free_energy.png", "caption": "Free energy over time" },
    { "file": "latent_traj.png", "caption": "Latent z₁ vs z₂" }
  ],
  "series": "metrics.json"
}
```

## Producing a run from Python

Use the single helper — do not hand-write `meta.json`:

```python
from tools.results_writer import write_result

write_result(
    "2026-06-14_synthetic",
    title="Synthetic dynamic scene — V-KAN demo",
    dataset="synthetic",
    tags=["vkan", "demo"],
    description="Two regime changes at t=400, t=800.",
    figures={"diagnostic.png": fig},          # matplotlib Figure
    metrics={"keyframes": len(keyframes), "frames": int(X.shape[0])},
    series={"free_energy": fe.tolist(), "kl": kl.tolist()},
)
```

`tools/vkan_demo.py` calls this helper when run with `--emit-results <id>`.

## Why this design

- **Single source of truth.** The producer writes the contract; the React app
  just renders it. No JSON copied into TypeScript.
- **Zero coupling.** New runs need zero code changes — only a new folder.
- **Local-first.** Same files are inspected on disk by the researcher and
  served by Vite to the browser, so the two layers cannot drift.