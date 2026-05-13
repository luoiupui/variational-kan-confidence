
-- frames
create table public.frames (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  width int not null,
  height int not null,
  storage_path text not null,
  tag text,
  sequence_id text
);
alter table public.frames enable row level security;
create policy "frames_public_read" on public.frames for select using (true);
create policy "frames_public_insert" on public.frames for insert with check (true);
create index frames_ts_idx on public.frames (ts desc);

-- agent_decisions
create table public.agent_decisions (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  frame_id uuid references public.frames(id) on delete set null,
  context text,
  raw_output text,
  nav_cmd text,
  arm_cmd text,
  target_id text,
  model_version text,
  latency_ms int
);
alter table public.agent_decisions enable row level security;
create policy "agent_decisions_public_read" on public.agent_decisions for select using (true);
create index agent_decisions_ts_idx on public.agent_decisions (ts desc);

-- realtime
alter publication supabase_realtime add table public.agent_decisions;
alter table public.agent_decisions replica identity full;

-- storage bucket (private)
insert into storage.buckets (id, name, public) values ('agent-frames', 'agent-frames', false)
on conflict (id) do nothing;

-- allow anyone to upload into agent-frames (frames are throwaway thumbnails);
-- reads happen via signed URLs from edge functions.
create policy "agent_frames_public_insert" on storage.objects
  for insert with check (bucket_id = 'agent-frames');
create policy "agent_frames_public_read" on storage.objects
  for select using (bucket_id = 'agent-frames');
