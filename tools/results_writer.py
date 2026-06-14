"""Single source of truth for writing experiment artefacts that the React
`/results` page auto-discovers.

Folder contract:

    docs/results/<run_id>/
        meta.json        # required — title, dataset, tags, metrics, figures
        <name>.png       # one entry per figure
        metrics.json     # optional — numeric series for Recharts

If `meta.json` is missing the folder is ignored by the web UI.
"""
from __future__ import annotations

import json
from datetime import date as _date
from pathlib import Path
from typing import Any, Mapping


# Project root is two levels up from this file (tools/ -> repo root).
REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_ROOT = REPO_ROOT / "docs" / "results"


def write_result(
    run_id: str,
    *,
    title: str,
    figures: Mapping[str, Any],
    description: str = "",
    dataset: str = "",
    sequence: str = "",
    tags: list[str] | None = None,
    metrics: Mapping[str, float] | None = None,
    series: Mapping[str, list[float]] | None = None,
    captions: Mapping[str, str] | None = None,
    date: str | None = None,
    root: Path | None = None,
    dpi: int = 140,
) -> Path:
    """Write a run folder under `docs/results/<run_id>/`.

    Parameters
    ----------
    run_id    : folder name (slug-like, no spaces)
    figures   : mapping of filename -> matplotlib Figure
    series    : optional dict of named numeric series (lists)
    """
    root = root or RESULTS_ROOT
    out_dir = root / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    fig_meta = []
    for fname, fig in figures.items():
        # accept either a Figure or an already-saved path
        target = out_dir / fname
        if hasattr(fig, "savefig"):
            fig.savefig(target, dpi=dpi, bbox_inches="tight")
        else:
            Path(fig).replace(target)
        fig_meta.append(
            {"file": fname, "caption": (captions or {}).get(fname, "")}
        )

    meta: dict[str, Any] = {
        "title": title,
        "date": date or _date.today().isoformat(),
        "description": description,
        "dataset": dataset,
        "sequence": sequence,
        "tags": list(tags or []),
        "metrics": dict(metrics or {}),
        "figures": fig_meta,
    }

    if series:
        (out_dir / "metrics.json").write_text(json.dumps(series, indent=2))
        meta["series"] = "metrics.json"

    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    print(f"[results_writer] wrote {out_dir}  ({len(fig_meta)} figures)")
    return out_dir