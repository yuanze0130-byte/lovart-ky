import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type {
  CanvasElementInsert,
  CanvasElementRow,
  ProjectInsert,
  ProjectRow,
  ProjectUpdate,
} from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { useSupabase } from '@/hooks/useSupabase';

interface UseProjectPersistenceParams {
  user: User | null | undefined;
  initialProjectId: string | null;
  elements: CanvasElement[];
  title: string;
  onProjectLoaded: (payload: { title: string; elements: CanvasElement[] }) => void;
}

export function useProjectPersistence({
  user,
  initialProjectId,
  elements,
  title,
  onProjectLoaded,
}: UseProjectPersistenceParams) {
  const supabase = useSupabase();
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(initialProjectId);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [isLoading, setIsLoading] = useState(true);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const isSavingRef = useRef(false);
  const needsSaveRef = useRef(false);

  const performSave = useCallback(async () => {
    if (!user) {
      setSaveStatus('offline');
      return;
    }

    if (!supabase) {
      return;
    }

    if (isSavingRef.current) {
      needsSaveRef.current = true;
      return;
    }

    isSavingRef.current = true;

    try {
      setSaveStatus('saving');

      if (currentProjectId) {
        const projectUpdate: ProjectUpdate = {
          title,
          updated_at: new Date().toISOString(),
        };

        const { error: projectError } = await supabase
          .from('projects')
          .update(projectUpdate)
          .eq('id', currentProjectId);

        if (projectError) throw projectError;

        const { error: deleteError } = await supabase
          .from('canvas_elements')
          .delete()
          .eq('project_id', currentProjectId);

        if (deleteError) throw deleteError;

        if (elements.length > 0) {
          const uniqueElements = Array.from(new Map(elements.map((item) => [item.id, item])).values());
          const canvasRows: CanvasElementInsert[] = uniqueElements.map((el) => ({
            project_id: currentProjectId,
            element_data: el,
          }));

          const { error: elementsError } = await supabase
            .from('canvas_elements')
            .insert(canvasRows);

          if (elementsError) throw elementsError;
        }
      } else {
        const newProjectId = uuidv4();
        const newProject: ProjectInsert = {
          id: newProjectId,
          title,
        };

        const { error: projectError } = await supabase
          .from('projects')
          .insert(newProject);

        if (projectError) throw projectError;

        if (elements.length > 0) {
          const uniqueElements = Array.from(new Map(elements.map((item) => [item.id, item])).values());
          const canvasRows: CanvasElementInsert[] = uniqueElements.map((el) => ({
            project_id: newProjectId,
            element_data: el,
          }));

          const { error: elementsError } = await supabase
            .from('canvas_elements')
            .insert(canvasRows);

          if (elementsError) throw elementsError;
        }

        setCurrentProjectId(newProjectId);
        if (typeof window !== 'undefined') {
          window.history.pushState({}, '', `/canvas?id=${newProjectId}`);
        }
      }

      setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to save project:', error);
      setSaveStatus('offline');
    } finally {
      isSavingRef.current = false;
    }
  }, [currentProjectId, elements, supabase, title, user]);

  const scheduleSave = useCallback(
    (delayMs = 2000) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        if (isSavingRef.current) {
          needsSaveRef.current = true;
          scheduleSave(300);
          return;
        }

        needsSaveRef.current = false;
        await performSave();

        if (needsSaveRef.current) {
          needsSaveRef.current = false;
          scheduleSave(300);
        }
      }, delayMs);
    },
    [performSave]
  );

  const loadProject = useCallback(
    async (projectId: string) => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      if (!supabase) {
        return;
      }

      try {
        setIsLoading(true);

        const [projectResult, elementsResult] = await Promise.all([
          supabase.from('projects').select('*').eq('id', projectId).single(),
          supabase.from('canvas_elements').select('*').eq('project_id', projectId),
        ]);

        if (projectResult.error) throw projectResult.error;
        if (elementsResult.error) throw elementsResult.error;

        const project = projectResult.data as ProjectRow | null;
        const canvasElements = elementsResult.data as CanvasElementRow[] | null;
        const loadedElements = (canvasElements || []).map((ce) => ce.element_data as CanvasElement);
        const uniqueElements = Array.from(new Map(loadedElements.map((item) => [item.id, item])).values());

        onProjectLoaded({
          title: project?.title || 'Untitled',
          elements: uniqueElements,
        });
      } catch (error) {
        console.error('Failed to load project:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [onProjectLoaded, supabase, user]
  );

  useEffect(() => {
    if (initialProjectId && user && supabase && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      void loadProject(initialProjectId);
    } else if (!initialProjectId) {
      setIsLoading(false);
      isInitializedRef.current = true;
    }
  }, [initialProjectId, loadProject, supabase, user]);

  useEffect(() => {
    if (!isLoading && !isInitializedRef.current && hasLoadedRef.current) {
      isInitializedRef.current = true;
    }
  }, [isLoading]);

  useEffect(() => {
    if (!user || isLoading || !isInitializedRef.current) {
      return;
    }

    scheduleSave(2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [elements, isLoading, scheduleSave, title, user]);

  return {
    currentProjectId,
    saveStatus,
    isLoading,
    supabase,
    loadProject,
    saveProject: performSave,
    setCurrentProjectId,
  };
}
