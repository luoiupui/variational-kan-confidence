
# Plan — `/results` page that auto-loads `docs/results/` artefacts

Goal: `vkan_demo.py` (and any future script) drops files into `docs/results/`. The React app picks them up automatically at build time — no manifest to edit, no component to add per run, no duplicated metadata.

## 1. Filesystem contract (the only thing both layers must agree on)

Each "result" is a folder under `docs/results/<run-id>/` containing:

```text
docs/results/
  2026-06-14_tum_fr3_walking_xyz/
    meta.json          # required — title, description, tags, metrics
    free_energy.png    # any number of PNGs
    latent_traj.png
    causal_dw.png
    metrics.json       # optional — numeric series for Recharts
  2026-06-15_synthetic/
    meta.json
    diagnostic.png
```

`meta.json` schema (small, stable):

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
    { "file": "free_energy.png",  "caption": "Free energy over time" },
    { "file": "latent_traj.png",  "caption": "Latent z₁ vs z₂" },
    { "file": "causal_dw.png",    "caption": "ΔW between windows" }
  ],
  "series": "metrics.json"
}
```

Rule: if `meta.json` is missing the folder is ignored (keeps experimental scratch out of the UI).

## 2. Python side — one helper, used by every script

Add `tools/results_writer.py` with one function:

```python
write_result(run_id, title, figures: dict[str, "Figure"], metrics=None, series=None, **meta)
```

It creates `docs/results/<run_id>/`, calls `fig.savefig(...)` for each entry, writes `metrics.json` if `series` is a dict of arrays, and emits `meta.json`. `vkan_demo.py` is updated to call it instead of its current ad-hoc `savefig`. Any future script uses the same helper — that is the "no duplicated code" guarantee on the producer side.

## 3. React side — one Vite glob, one page, one card component

Vite serves `docs/` if we add a tiny shim, or simpler: keep results under `public/results/` symlinked from `docs/results/`, OR use `import.meta.glob` on files inside `src/`. Cleanest option for a Vite SPA:

- Keep producer output at `docs/results/` (human-readable location).
- Add a Vite plugin alias / `publicDir` entry that exposes `docs/results` as `/results-data/` at serve and build time (a 5-line `viteStaticCopy` config, no code duplication).
- Generate an index at build time with a tiny Vite plugin (`buildStart` hook) that scans `docs/results/*/meta.json` and writes `public/results-index.json`. This runs automatically — no manual step.

Then the page is trivial:

```text
src/pages/Results.tsx
  useQuery(['results-index'], () => fetch('/results-index.json').then(r => r.json()))
  → grid of <ResultCard run={...} />

src/components/results/ResultCard.tsx
  - title, date, dataset, tags, metrics chips
  - figures rendered as <img src={`/results-data/${runId}/${file}`} />
  - if meta.series present, lazy-load metrics.json and render a Recharts LineChart
  - click → /results/:runId detail route with all figures full-size + raw JSON viewer
```

Route registration: add `<Route path="/results" />` and `<Route path="/results/:runId" />` in `src/App.tsx`, link from the nav.

## 4. Sync guarantees (what makes this duplication-free)

- **Producer → contract**: only `results_writer.py` writes the folder layout. Every script that wants to appear on the site calls it.
- **Contract → consumer**: the Vite plugin re-scans on every build/dev start. No hand-maintained list in TypeScript.
- **Schema in one place**: `meta.json` shape lives in `tools/results_writer.py` (writer) and `src/types/result.ts` (reader). A tiny `scripts/check-results-schema.ts` validates `meta.json` files against the TS type during `bun run build` to catch drift early.
- **No re-implementation of science in TS**: React only renders PNG + JSON; all numerics stay in Python.

## 5. Empty / error states

- No results yet → page shows a one-liner "Run `python tools/vkan_demo.py --out docs/results/<name>` to populate this page" plus a copy button.
- A folder with malformed `meta.json` → surfaced as a yellow card with the validation error, not silently hidden.

## 6. Files to add / change

```text
ADD    tools/results_writer.py
EDIT   tools/vkan_demo.py                 # use results_writer
ADD    vite-plugin-results-index.ts       # build-time scanner
EDIT   vite.config.ts                     # register plugin + viteStaticCopy
ADD    src/types/result.ts
ADD    src/pages/Results.tsx
ADD    src/pages/ResultDetail.tsx
ADD    src/components/results/ResultCard.tsx
ADD    src/components/results/MetricChips.tsx
ADD    src/components/results/SeriesChart.tsx
EDIT   src/App.tsx                        # two new routes
EDIT   src/components/Nav.tsx (or equiv)  # add "Results" link
ADD    docs/results/.gitkeep
ADD    docs/results/README.md             # the contract, for humans
```

## 7. Out of scope (deliberately)

- No 3D viewer in this iteration — that comes later when `.glb` splat maps exist; the same contract extends naturally (`figures` becomes `assets` with a `type` field).
- No server: everything is static, works on Lovable preview and on a local `bun dev`.
- No auth: results are public to anyone with the site URL, same as the rest of the project.

After approval I will implement steps 2–6 in one pass and verify by running `python tools/vkan_demo.py` locally so a real card appears on `/results`.
