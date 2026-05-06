create table public.worker_heartbeats (
  id text primary key default 'singleton',
  last_ingest_at timestamptz not null default now(),
  last_run_id uuid,
  last_method text,
  last_status text
);

alter table public.worker_heartbeats enable row level security;

create policy "worker_heartbeats_public_read"
  on public.worker_heartbeats
  for select
  using (true);

insert into public.worker_heartbeats (id, last_ingest_at, last_method, last_status)
values ('singleton', 'epoch', null, null)
on conflict (id) do nothing;