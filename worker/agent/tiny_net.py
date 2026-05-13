"""Minimal character-level transformer (Karpathy nanoGPT-style) used by the
microAgent. Tiny enough to train on CPU in seconds and infer in <50 ms."""
from __future__ import annotations
import torch
import torch.nn as nn
import torch.nn.functional as F


class MicroRobotTransformer(nn.Module):
    def __init__(self, vocab_size: int = 96, n_embd: int = 32, block_size: int = 64):
        super().__init__()
        self.token_embedding_table = nn.Embedding(vocab_size, n_embd)
        self.position_embedding_table = nn.Embedding(block_size, n_embd)
        self.lm_head = nn.Linear(n_embd, vocab_size)
        self.block_size = block_size

    def forward(self, idx: torch.Tensor) -> torch.Tensor:
        B, T = idx.shape
        tok = self.token_embedding_table(idx)
        pos = self.position_embedding_table(torch.arange(T, device=idx.device))
        return self.lm_head(tok + pos)

    @torch.no_grad()
    def generate_action(self, ctx: torch.Tensor, max_new_tokens: int = 40) -> torch.Tensor:
        for _ in range(max_new_tokens):
            cond = ctx[:, -self.block_size:]
            logits = self(cond)[:, -1, :]
            probs = F.softmax(logits, dim=-1)
            nxt = torch.multinomial(probs, num_samples=1)
            ctx = torch.cat((ctx, nxt), dim=1)
        return ctx