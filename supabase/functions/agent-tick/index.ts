// agent-tick: takes a frame_id + context string, asks the worker (or
// Lovable AI Gateway as fallback) for a structured action token string,
// parses it into nav/arm/target fields and writes a row into agent_decisions.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  frame_id: z.string().uuid().optional(),
  context: z.string().min(1).max(512).default("Context: Path clear ahead. Action required:"),
});

const WORKER_URL = Deno.env.get("WORKER_AGENT_URL"); // e.g. https://worker-misty-butterfly-4770.fly.dev

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const b = parsed.data;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const t0 = Date.now();
  let raw_output = "";
  let model_version = "fallback-rule";

  // 1) Try the Fly.io worker microAgent first.
  if (WORKER_URL) {
    try {
      const r = await fetch(`${WORKER_URL.replace(/\/$/, "")}/agent/infer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: b.context }),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const j = await r.json();
        raw_output = String(j.raw ?? "");
        model_version = String(j.model_version ?? "worker-microagent");
      }
    } catch (_) { /* fall through */ }
  }

  // 2) Fallback: Lovable AI Gateway with a tight schema prompt.
  if (!raw_output) {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (apiKey) {
      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "You output ONE line in this exact protocol: '[NAV] <FORWARD|STOP|GOTO> <speed>' optionally followed by '[ARM] <GRASP|RELEASE|HOME> [TARGET] <ID>'. Examples: '[NAV] FORWARD 0.5', '[NAV] STOP 0.0 [ARM] GRASP [TARGET] OBJ_A'. No explanation." },
              { role: "user", content: b.context },
            ],
            temperature: 0.2,
          }),
        });
        if (r.ok) {
          const j = await r.json();
          raw_output = (j.choices?.[0]?.message?.content ?? "").trim();
          model_version = "lovable-ai/gemini-2.5-flash-lite";
        }
      } catch (_) { /* fall through */ }
    }
  }

  // 3) Last resort: deterministic safe stop.
  if (!raw_output) {
    raw_output = "[NAV] STOP 0.0";
    model_version = "fallback-rule";
  }

  const { nav_cmd, arm_cmd, target_id } = parseTokens(raw_output);
  const latency_ms = Date.now() - t0;

  const ins = await supabase.from("agent_decisions").insert({
    frame_id: b.frame_id ?? null,
    context: b.context,
    raw_output,
    nav_cmd,
    arm_cmd,
    target_id,
    model_version,
    latency_ms,
  }).select("id, ts").single();
  if (ins.error) return json({ error: ins.error.message }, 500);

  return json({ ok: true, decision: { ...ins.data, raw_output, nav_cmd, arm_cmd, target_id, model_version, latency_ms } });
});

function parseTokens(s: string) {
  let nav_cmd: string | null = null;
  let arm_cmd: string | null = null;
  let target_id: string | null = null;
  const navIdx = s.indexOf("[NAV]");
  const armIdx = s.indexOf("[ARM]");
  if (navIdx >= 0) {
    const end = armIdx > navIdx ? armIdx : s.length;
    nav_cmd = s.slice(navIdx + 5, end).trim() || null;
  }
  if (armIdx >= 0) {
    const tail = s.slice(armIdx + 5).trim();
    const tIdx = tail.indexOf("[TARGET]");
    if (tIdx >= 0) {
      arm_cmd = tail.slice(0, tIdx).trim() || null;
      target_id = tail.slice(tIdx + 8).trim() || null;
    } else {
      arm_cmd = tail || null;
    }
  }
  return { nav_cmd, arm_cmd, target_id };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}