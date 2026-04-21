ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS resubmit_requested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_submission jsonb DEFAULT NULL;
