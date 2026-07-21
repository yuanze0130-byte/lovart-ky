-- Project dashboards filter by user_id, then sort newest first.
-- One composite index satisfies both operations and replaces two single-column indexes.
DROP INDEX IF EXISTS public.idx_projects_user_id;
DROP INDEX IF EXISTS public.idx_projects_updated_at;
CREATE INDEX IF NOT EXISTS idx_projects_user_updated
  ON public.projects(user_id, updated_at DESC, id ASC);
