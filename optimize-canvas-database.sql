-- Cache the authenticated subject once per statement instead of recalculating
-- auth.jwt() for every row evaluated by RLS.
ALTER POLICY "Users can view their own projects"
  ON public.projects
  USING (((select auth.jwt())->>'sub') = user_id);

ALTER POLICY "Users can insert their own projects"
  ON public.projects
  WITH CHECK (((select auth.jwt())->>'sub') = user_id);

ALTER POLICY "Users can update their own projects"
  ON public.projects
  USING (((select auth.jwt())->>'sub') = user_id)
  WITH CHECK (((select auth.jwt())->>'sub') = user_id);

ALTER POLICY "Users can delete their own projects"
  ON public.projects
  USING (((select auth.jwt())->>'sub') = user_id);

ALTER POLICY "Users can view their own canvas elements"
  ON public.canvas_elements
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = canvas_elements.project_id
        AND projects.user_id = ((select auth.jwt())->>'sub')
    )
  );

ALTER POLICY "Users can insert canvas elements to their projects"
  ON public.canvas_elements
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = canvas_elements.project_id
        AND projects.user_id = ((select auth.jwt())->>'sub')
    )
  );

ALTER POLICY "Users can update their own canvas elements"
  ON public.canvas_elements
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = canvas_elements.project_id
        AND projects.user_id = ((select auth.jwt())->>'sub')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = canvas_elements.project_id
        AND projects.user_id = ((select auth.jwt())->>'sub')
    )
  );

ALTER POLICY "Users can delete their own canvas elements"
  ON public.canvas_elements
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = canvas_elements.project_id
        AND projects.user_id = ((select auth.jwt())->>'sub')
    )
  );

-- The loading query filters by project and reads newest element revisions first.
-- This composite index removes the extra sort and still supports project-only lookups.
DROP INDEX IF EXISTS public.idx_canvas_elements_project_id;
CREATE INDEX IF NOT EXISTS idx_canvas_elements_project_updated
  ON public.canvas_elements(project_id, updated_at DESC, created_at DESC, id ASC);
