// Worker → Lovable Cloud "claim next queued run" endpoint.
//
// Replaces direct Postgres polling so the Fly worker doesn't need
// SUPABASE_DB_URL. Same auth model as ingest-run: shared header secret.
//
// Atomically picks the oldest status='queued' row, flips it to 'running',
// and returns its identity. Returns { id: null } when the queue is empty.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("WORKER_INGEST_SECRET");
  if (!secret) return json({ error: "WORKER_INGEST_SECRET not configured" }, 500);
  if (req.headers.get("x-worker-secret") !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Find oldest queued row.
  const { data: candidate, error: selErr } = await supabase
    .from("runs")
    .select("id, sequence_id, sequence_name, method")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selErr) return json({ error: selErr.message }, 500);
  if (!candidate) return json({ id: null });

  // Atomic claim: only succeeds if still queued.
  const { data: claimed, error: updErr } = await supabase
    .from("runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("id, sequence_id, sequence_name, method")
    .maybeSingle();

  if (updErr) return json({ error: updErr.message }, 500);
  if (!claimed) return json({ id: null }); // someone else got it first

  return json(claimed);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}