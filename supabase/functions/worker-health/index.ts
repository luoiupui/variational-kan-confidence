// Public read-only worker health probe.
// Returns: last heartbeat from the Fly poller (via ingest-run), queue counts,
// and the age of the oldest queued run. Used by the Run Center dashboard to
// distinguish "Fly machine alive but wrong image" from "worker actually working".

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const [{ data: hb }, { data: runs }] = await Promise.all([
    supabase
      .from("worker_heartbeats")
      .select("last_ingest_at, last_run_id, last_method, last_status")
      .eq("id", "singleton")
      .maybeSingle(),
    supabase
      .from("runs")
      .select("status, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const now = Date.now();
  const lastAt = hb?.last_ingest_at ? new Date(hb.last_ingest_at).getTime() : 0;
  const secondsSinceIngest =
    lastAt > 0 ? Math.floor((now - lastAt) / 1000) : null;

  let queued = 0,
    running = 0,
    done24 = 0,
    failed24 = 0;
  let oldestQueuedAge: number | null = null;
  const dayAgo = now - 24 * 3600 * 1000;
  for (const r of runs ?? []) {
    const t = new Date(r.created_at).getTime();
    if (r.status === "queued") {
      queued++;
      const age = Math.floor((now - t) / 1000);
      if (oldestQueuedAge === null || age > oldestQueuedAge) oldestQueuedAge = age;
    } else if (r.status === "running") running++;
    else if (r.status === "done" && t >= dayAgo) done24++;
    else if (r.status === "failed" && t >= dayAgo) failed24++;
  }

  let health: "healthy" | "stale" | "down" = "down";
  if (secondsSinceIngest !== null) {
    if (secondsSinceIngest < 120) health = "healthy";
    else if (secondsSinceIngest < 600) health = "stale";
    else health = "down";
  }

  return new Response(
    JSON.stringify({
      health,
      last_ingest_at: hb?.last_ingest_at ?? null,
      last_run_id: hb?.last_run_id ?? null,
      last_method: hb?.last_method ?? null,
      last_status: hb?.last_status ?? null,
      seconds_since_ingest: secondsSinceIngest,
      queued,
      running,
      done_24h: done24,
      failed_24h: failed24,
      oldest_queued_age_s: oldestQueuedAge,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});