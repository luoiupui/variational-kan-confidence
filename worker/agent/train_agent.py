"""Optional training script — run locally to populate
worker/agent/checkpoints/{micro_robot_model.pt, vocab_config.pt}.

    cd worker && python -m agent.train_agent
"""
from __future__ import annotations
import os
from pathlib import Path
import torch
import torch.nn as nn
import torch.optim as optim
from .tiny_net import MicroRobotTransformer

HERE = Path(__file__).parent
CKPT_DIR = HERE / "checkpoints"
CKPT_DIR.mkdir(exist_ok=True)
LOGS = HERE / "telemetry_logs.txt"

SAMPLE = """\
Context: Path clear ahead. Action required: [NAV] FORWARD 0.5
Context: Red obstacle detected on sensor. Action required: [NAV] STOP 0.0
Context: Arrived at kitchen table, item visible. Action required: [ARM] GRASP [TARGET] OBJ_A
Context: Approaching sorting bin, arm holding cargo. Action required: [ARM] RELEASE [TARGET] BIN_3
Context: Critical error on arm joints. Action required: [NAV] STOP 0.0 [ARM] HOME
Context: Target object located on shelf. Action required: [NAV] GOTO 2.1 0.5 [ARM] GRASP [TARGET] OBJ_B
Context: Low battery warning. Action required: [NAV] STOP 0.0
Context: Route confirmed clear. Action required: [NAV] FORWARD 0.5
"""

def main():
    if not LOGS.exists():
        LOGS.write_text(SAMPLE)
    text = LOGS.read_text()
    chars = sorted(set(text + "abcdefghijklmnopqrstuvwxyz0123456789 :,.[]_-FSRABCNVMTGOJHIKLPQUWXYZ\n"))
    stoi = {c: i for i, c in enumerate(chars)}
    itos = {i: c for c, i in stoi.items()}
    vocab_size = len(chars)
    data = torch.tensor([stoi[c] for c in text], dtype=torch.long)
    block_size, batch_size, max_iters, lr = 64, 4, 1500, 1e-3
    model = MicroRobotTransformer(vocab_size=vocab_size, block_size=block_size)
    opt = optim.AdamW(model.parameters(), lr=lr)
    for it in range(max_iters):
        ix = torch.randint(len(data) - block_size, (batch_size,))
        x = torch.stack([data[i:i+block_size] for i in ix])
        y = torch.stack([data[i+1:i+block_size+1] for i in ix])
        logits = model(x)
        B, T, C = logits.shape
        loss = nn.functional.cross_entropy(logits.view(B*T, C), y.view(B*T))
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        if it % 300 == 0:
            print(f"iter {it:4d}  loss {loss.item():.4f}")
    torch.save({"stoi": stoi, "itos": itos, "vocab_size": vocab_size}, CKPT_DIR / "vocab_config.pt")
    torch.save(model.state_dict(), CKPT_DIR / "micro_robot_model.pt")
    print(f"saved -> {CKPT_DIR}")

if __name__ == "__main__":
    main()