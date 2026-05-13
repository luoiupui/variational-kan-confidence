"""FastAPI server exposing the microAgent over HTTP. Hosted on Fly.io as the
`agent` process; called by the Lovable Cloud `agent-tick` edge function."""
from __future__ import annotations
from fastapi import FastAPI
from pydantic import BaseModel, Field

from .micro_agent import infer, status

app = FastAPI(title="micro-ros-agent", version="0.1.0")


class InferIn(BaseModel):
    context: str = Field(..., min_length=1, max_length=512)


class InferOut(BaseModel):
    raw: str
    model_version: str


@app.get("/")
def root():
    return {"ok": True, "service": "micro-ros-agent"}


@app.get("/agent/status")
def agent_status():
    return status()


@app.post("/agent/infer", response_model=InferOut)
def agent_infer(body: InferIn):
    raw, ver = infer(body.context)
    return InferOut(raw=raw, model_version=ver)