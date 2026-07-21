-- Fetch at most one image candidate per project. The function is SECURITY INVOKER,
-- so canvas_elements RLS still limits callers to projects they own.
CREATE INDEX IF NOT EXISTS idx_canvas_elements_project_thumbnail
  ON public.canvas_elements(project_id, updated_at DESC, created_at DESC, id ASC)
  WHERE (element_data->>'type') = 'image'
    AND NULLIF(element_data->>'content', '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_project_thumbnail_candidates(p_project_ids UUID[])
RETURNS TABLE (
  project_id UUID,
  content TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT DISTINCT ON (canvas_elements.project_id)
    canvas_elements.project_id,
    canvas_elements.element_data->>'content' AS content,
    canvas_elements.updated_at
  FROM public.canvas_elements
  WHERE canvas_elements.project_id = ANY(p_project_ids)
    AND (canvas_elements.element_data->>'type') = 'image'
    AND NULLIF(canvas_elements.element_data->>'content', '') IS NOT NULL
  ORDER BY
    canvas_elements.project_id,
    canvas_elements.updated_at DESC,
    canvas_elements.created_at DESC,
    canvas_elements.id ASC;
$$;

REVOKE ALL ON FUNCTION public.get_project_thumbnail_candidates(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_thumbnail_candidates(UUID[]) TO authenticated;
