ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS x_consent boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS x_username text;
