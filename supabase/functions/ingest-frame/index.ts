// ingest-frame: receives a base64 JPEG from the dashboard, stores it in the
// agent-frames bucket, inserts a row in public.frames, and (if requested)
// triggers an agent inference tick.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  image_b64: z.string().min(64),     // raw base64 JPEG (no data: prefix)
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tag: z.string().max(64).optional(),
  context: z.string().max(512).optional(),
  tick: z.boolean().optional(),      // also call agent-tick
});

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

  // decode base64 -> bytes
  let bytes: Uint8Array;
  try {
    const bin = atob(b.image_b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return json({ error: "bad base64" }, 400);
  }

  const ts = new Date();
  const path = `${ts.getUTCFullYear()}/${String(ts.getUTCMonth()+1).padStart(2,"0")}/${ts.getUTCDate()}/${crypto.randomUUID()}.jpg`;

  const up = await supabase.storage.from("agent-frames").upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (up.error) return json({ error: `upload: ${up.error.message}` }, 500);

  const ins = await supabase.from("frames").insert({
    width: b.width,
    height: b.height,
    storage_path: path,
    tag: b.tag ?? null,
  }).select("id, ts, storage_path").single();
  if (ins.error) return json({ error: `insert: ${ins.error.message}` }, 500);

  // signed URL so the dashboard can show the thumbnail
  const sig = await supabase.storage.from("agent-frames").createSignedUrl(path, 60 * 30);

  let decision: unknown = null;
  if (b.tick) {
    try {
      const tickRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-tick`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ frame_id: ins.data.id, context: b.context }),
      });
      decision = await tickRes.json();
    } catch (e) {
      decision = { error: String(e) };
    }
  }

  return json({
    ok: true,
    frame: ins.data,
    signed_url: sig.data?.signedUrl ?? null,
    decision,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}