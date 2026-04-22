-- Stage 4 runs table: stores every V-KAN / ORB-SLAM3 / DynaSLAM evaluation run
-- pushed by the GPU worker (Fly.io) after running eval_with_evo.py.

CREATE TABLE IF NOT EXISTS public.runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id TEXT NOT NULL,                 -- "fr1/xyz", "fr3/walking_xyz", ...
  sequence_name TEXT NOT NULL,
  method TEXT NOT NULL,                      -- "vkan" | "orb3" | "dynaslam"
  status TEXT NOT NULL DEFAULT 'queued',     -- "queued" | "running" | "done" | "failed"
  frames INTEGER,
  metrics JSONB,                             -- { ate_rmse, ate_mean, ate_max, rpe_trans, rpe_rot, tracking_pct, fps }
  trajectory_est JSONB,                      -- [[x,y,z], ...]
  trajectory_gt JSONB,
  ate_per_frame JSONB,                       -- [float, ...]
  keyframes JSONB,                           -- [int, ...]
  map_points JSONB,                          -- [{ pos:[x,y,z], weight? }, ...]
  fe JSONB,                                  -- free-energy per frame (vkan only)
  git_sha TEXT,                              -- worker repo commit
  checkpoint_hash TEXT,                      -- V-KAN model hash
  notes TEXT,
  error TEXT,
  requested_by TEXT,                         -- "ui" | "cron" | "manual"
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS runs_seq_method_created_idx
  ON public.runs (sequence_id, method, created_at DESC);
CREATE INDEX IF NOT EXISTS runs_status_idx
  ON public.runs (status, created_at DESC);

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

-- Public read: anyone (incl. anon) can view results — this is a public research demo.
CREATE POLICY "runs_public_read"
  ON public.runs
  FOR SELECT
  USING (true);

-- Public can INSERT only "queued" intent rows (no metrics, no trajectories).
-- All real result writes happen via the service-role key inside the edge functions.
CREATE POLICY "runs_public_enqueue"
  ON public.runs
  FOR INSERT
  WITH CHECK (
    status = 'queued'
    AND metrics IS NULL
    AND trajectory_est IS NULL
    AND map_points IS NULL
  );

-- Sequence catalog (drives the SequencePicker dropdown)
CREATE TABLE IF NOT EXISTS public.sequences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  family TEXT NOT NULL,                      -- "fr1" | "fr2" | "fr3"
  dynamic_pct INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sequences_public_read" ON public.sequences FOR SELECT USING (true);

INSERT INTO public.sequences (id, name, family, dynamic_pct, description) VALUES
  ('fr1/xyz',                'fr1/xyz',                'fr1', 0,  'Static, translation-only — sanity baseline.'),
  ('fr1/desk',               'fr1/desk',               'fr1', 5,  'Static desk scene, mild rotation.'),
  ('fr3/walking_xyz',        'fr3/walking_xyz',        'fr3', 70, 'Two people walking, large dynamic region.'),
  ('fr3/walking_halfsphere', 'fr3/walking_halfsphere', 'fr3', 70, 'Walking + camera rotates on half sphere.'),
  ('fr3/sitting_static',     'fr3/sitting_static',     'fr3', 30, 'Sitting people, mostly static, mild motion.')
ON CONFLICT (id) DO NOTHING;