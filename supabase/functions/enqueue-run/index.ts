// Mark intent: write a "queued" row that the GPU worker will pick up by polling.
// Public endpoint (no auth) — the public RLS policy already restricts what can
// be inserted (status='queued', no metrics, no trajectories), so this function
// is mostly a thin convenience wrapper that also handles CORS cleanly.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  sequence_id: z.string().min(1),
  sequence_name: z.string().min(1),
  method: z.enum(["vkan", "orb3", "dynaslam"]),
  notes: z.string().max(500).optional(),
  requested_by: z.string().max(50).default("ui"),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

  // Use anon key — the public RLS policy enforces the safety constraints.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const { data, error } = await supabase
    .from("runs")
    .insert({
      sequence_id: b.sequence_id,
      sequence_name: b.sequence_name,
      method: b.method,
      status: "queued",
      notes: b.notes ?? null,
      requested_by: b.requested_by,
    })
    .select("id, created_at")
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, id: data.id, created_at: data.created_at });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}