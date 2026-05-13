"""Stateless microAgent. Tries the trained tiny transformer first, then
falls back to a deterministic rule-based mapper so the dashboard always
gets a structured action token line even on a fresh deploy."""
from __future__ import annotations
import os
from pathlib import Path
from typing import Tuple

CKPT_PATH = Path(os.environ.get("AGENT_CKPT", "/app/worker/agent/checkpoints/micro_robot_model.pt"))
VOCAB_PATH = Path(os.environ.get("AGENT_VOCAB", "/app/worker/agent/checkpoints/vocab_config.pt"))

_model = None
_vocab = None
_device = "cpu"


def _load():
    global _model, _vocab
    if _model is not None or not (CKPT_PATH.exists() and VOCAB_PATH.exists()):
        return
    try:
        import torch
        from .tiny_net import MicroRobotTransformer
        _vocab = torch.load(VOCAB_PATH, map_location=_device)
        m = MicroRobotTransformer(vocab_size=_vocab["vocab_size"], block_size=64)
        m.load_state_dict(torch.load(CKPT_PATH, map_location=_device))
        m.to(_device).eval()
        _model = m
    except Exception as e:  # pragma: no cover
        print(f"[micro_agent] model load failed: {e}")


def _nn_infer(context: str) -> str | None:
    _load()
    if _model is None or _vocab is None:
        return None
    try:
        import torch
        stoi, itos = _vocab["stoi"], _vocab["itos"]
        space = stoi.get(" ", 0)
        x = torch.tensor([[stoi.get(c, space) for c in context]], dtype=torch.long, device=_device)
        gen = _model.generate_action(x, max_new_tokens=40)
        out = "".join(itos[int(i)] for i in gen[0].tolist())
        # Return only the new tail after the prompt
        tail = out[len(context):]
        return tail.strip().splitlines()[0] if tail.strip() else None
    except Exception as e:  # pragma: no cover
        print(f"[micro_agent] infer failed: {e}")
        return None


def _rule_infer(context: str) -> str:
    c = context.lower()
    if any(k in c for k in ("obstacle", "stop", "danger", "failure", "error", "low battery", "destination")):
        return "[NAV] STOP 0.0"
    if "shelf" in c or "located" in c:
        return "[NAV] GOTO 1.0 0.5 [ARM] GRASP [TARGET] OBJ_B"
    if "table" in c or "visible" in c:
        return "[ARM] GRASP [TARGET] OBJ_A"
    if "bin" in c or "release" in c:
        return "[ARM] RELEASE [TARGET] BIN_3"
    if "clear" in c or "forward" in c:
        return "[NAV] FORWARD 0.5"
    return "[NAV] STOP 0.0"


def infer(context: str) -> Tuple[str, str]:
    """Return (raw_output, model_version)."""
    nn_out = _nn_infer(context)
    if nn_out and ("[NAV]" in nn_out or "[ARM]" in nn_out):
        return nn_out, "tiny_net@local"
    return _rule_infer(context), "rule-fallback"


def status() -> dict:
    _load()
    return {
        "model_loaded": _model is not None,
        "vocab_size": (_vocab or {}).get("vocab_size"),
        "ckpt_path": str(CKPT_PATH),
        "device": _device,
        "tokens": ["[NAV]", "[ARM]", "[TARGET]"],
    }