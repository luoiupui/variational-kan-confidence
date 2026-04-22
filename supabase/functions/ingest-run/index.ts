// Stage 4 result ingest endpoint.
// Called by the GPU worker (Fly.io) after eval_with_evo.py finishes,
// to persist a completed V-KAN / ORB-SLAM3 / DynaSLAM run into public.runs.
//
// Auth: requires header `x-worker-secret` matching the WORKER_INGEST_SECRET env var.
//       (We don't want anonymous browsers writing fake metric rows; the public
//        RLS policy only allows status='queued' rows without metrics.)

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

const Metrics = z.object({
  ate_rmse: z.number(),
  ate_mean: z.number(),
  ate_max: z.number().optional(),
  rpe_trans: z.number(),
  rpe_rot: z.number(),
  tracking_pct: z.number(),
  fps: z.number().optional(),
});

const Body = z.object({
  run_id: z.string().uuid().optional(), // if present we UPDATE instead of INSERT
  sequence_id: z.string().min(1),
  sequence_name: z.string().min(1),
  method: z.enum(["vkan", "orb3", "dynaslam"]),
  status: z.enum(["running", "done", "failed"]).default("done"),
  frames: z.number().int().nonnegative().optional(),
  metrics: Metrics.optional(),
  trajectory_est: z.array(Vec3).optional(),
  trajectory_gt: z.array(Vec3).optional(),
  ate_per_frame: z.array(z.number()).optional(),
  keyframes: z.array(z.number().int()).optional(),
  map_points: z
    .array(z.object({ pos: Vec3, weight: z.number().optional() }))
    .optional(),
  fe: z.array(z.number()).optional(),
  git_sha: z.string().optional(),
  checkpoint_hash: z.string().optional(),
  notes: z.string().optional(),
  error: z.string().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("WORKER_INGEST_SECRET");
  if (!secret) {
    return json({ error: "WORKER_INGEST_SECRET not configured" }, 500);
  }
  if (req.headers.get("x-worker-secret") !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, 400);
  }
  const b = parsed.data;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const row = {
    sequence_id: b.sequence_id,
    sequence_name: b.sequence_name,
    method: b.method,
    status: b.status,
    frames: b.frames ?? null,
    metrics: b.metrics ?? null,
    trajectory_est: b.trajectory_est ?? null,
    trajectory_gt: b.trajectory_gt ?? null,
    ate_per_frame: b.ate_per_frame ?? null,
    keyframes: b.keyframes ?? null,
    map_points: b.map_points ?? null,
    fe: b.fe ?? null,
    git_sha: b.git_sha ?? null,
    checkpoint_hash: b.checkpoint_hash ?? null,
    notes: b.notes ?? null,
    error: b.error ?? null,
    requested_by: "worker",
    completed_at: b.status === "done" || b.status === "failed" ? new Date().toISOString() : null,
  };

  if (b.run_id) {
    const { data, error } = await supabase
      .from("runs")
      .update(row)
      .eq("id", b.run_id)
      .select("id")
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: data.id, mode: "update" });
  }

  const { data, error } = await supabase
    .from("runs")
    .insert(row)
    .select("id")
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, id: data.id, mode: "insert" });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}