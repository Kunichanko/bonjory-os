ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
