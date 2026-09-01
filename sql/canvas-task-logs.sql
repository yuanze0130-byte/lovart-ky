-- Per-user, per-project canvas task history.
-- Safe to run repeatedly in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.canvas_task_logs (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  node_id TEXT,
  task_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'workflow', 'analysis')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
  progress DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  message TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  prompt_preview TEXT,
  reference_count INTEGER CHECK (reference_count IS NULL OR reference_count >= 0),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (project_id, id)
);

CREATE INDEX IF NOT EXISTS canvas_task_logs_user_project_updated_idx
  ON public.canvas_task_logs(user_id, project_id, updated_at DESC);

ALTER TABLE public.canvas_task_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own canvas task logs" ON public.canvas_task_logs;
CREATE POLICY "Users can view their own canvas task logs"
  ON public.canvas_task_logs
  FOR SELECT
  TO authenticated
  USING (
    user_id = ((SELECT auth.jwt())->>'sub')
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = canvas_task_logs.project_id
        AND projects.user_id = ((SELECT auth.jwt())->>'sub')
    )
  );

DROP POLICY IF EXISTS "Users can insert their own canvas task logs" ON public.canvas_task_logs;
CREATE POLICY "Users can insert their own canvas task logs"
  ON public.canvas_task_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = ((SELECT auth.jwt())->>'sub')
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = canvas_task_logs.project_id
        AND projects.user_id = ((SELECT auth.jwt())->>'sub')
    )
  );

DROP POLICY IF EXISTS "Users can update their own canvas task logs" ON public.canvas_task_logs;
CREATE POLICY "Users can update their own canvas task logs"
  ON public.canvas_task_logs
  FOR UPDATE
  TO authenticated
  USING (
    user_id = ((SELECT auth.jwt())->>'sub')
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = canvas_task_logs.project_id
        AND projects.user_id = ((SELECT auth.jwt())->>'sub')
    )
  )
  WITH CHECK (
    user_id = ((SELECT auth.jwt())->>'sub')
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = canvas_task_logs.project_id
        AND projects.user_id = ((SELECT auth.jwt())->>'sub')
    )
  );

DROP POLICY IF EXISTS "Users can delete their own canvas task logs" ON public.canvas_task_logs;
CREATE POLICY "Users can delete their own canvas task logs"
  ON public.canvas_task_logs
  FOR DELETE
  TO authenticated
  USING (
    user_id = ((SELECT auth.jwt())->>'sub')
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = canvas_task_logs.project_id
        AND projects.user_id = ((SELECT auth.jwt())->>'sub')
    )
  );

REVOKE ALL ON TABLE public.canvas_task_logs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.canvas_task_logs TO authenticated;
