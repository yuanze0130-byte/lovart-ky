import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { loadLocalCanvasDraft, saveLocalCanvasDraft } from '@/lib/local-canvas-store';
import { normalizeCanvasConnections } from '@/lib/canvas-connections';
import { persistCanvasElementAssets } from '@/lib/canvas-asset-upload';
interface UseProjectPersistenceParams {
  user: User | null | undefined;
  initialProjectId: string | null;
  elements: CanvasElement[];
  title: string;
  isInteractionActive?: boolean;
  onProjectLoaded: (payload: { title: string; elements: CanvasElement[]; append?: boolean }) => void;
  onAssetsPersisted: (elements: CanvasElement[]) => void;
}

const ELEMENT_PAGE_SIZE = 100;
const ELEMENT_WRITE_BATCH_SIZE = 50;
const ELEMENT_DELETE_BATCH_SIZE = 100;

type CanvasElementLoadRow = Pick<CanvasElementRow, 'id' | 'element_data' | 'created_at' | 'updated_at'>;

function isCanvasElement(value: unknown): value is CanvasElement {
  if (!value || typeof value !== 'object') return false;

  const element = value as Partial<CanvasElement>;
  return typeof element.id === 'string'
    && typeof element.type === 'string'
    && typeof element.x === 'number'
    && typeof element.y === 'number';
}

function getUniqueElements(elements: CanvasElement[]) {
  return Array.from(new Map(elements.map((element) => [element.id, element])).values());
}

function getBatches<T>(items: T[], batchSize: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

export function useProjectPersistence({
  user,
  initialProjectId,
  elements,
  title,
  isInteractionActive = false,
  onProjectLoaded,
  onAssetsPersisted,
}: UseProjectPersistenceParams) {
  const supabase = useSupabase();
  const router = useRouter();
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(initialProjectId);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'local' | 'offline'>('saved');
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrating, setIsHydrating] = useState(true);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const isSavingRef = useRef(false);
  const needsSaveRef = useRef(false);
  const persistedTitleRef = useRef<string | null>(null);
  const persistedElementRefsRef = useRef(new Map<string, CanvasElement>());
  const rowIdsByElementIdRef = useRef(new Map<string, string[]>());
  const staleRowIdsRef = useRef<string[]>([]);
  const performSave = useCallback(async () => {
    if (user === undefined) return;
    if (!user) {
      try {
        setSaveStatus('saving');
        await saveLocalCanvasDraft({ title, elements });
        setSaveStatus('local');
      } catch (error) {
        console.error('Failed to save local project:', error);
        setSaveStatus('offline');
      }
      return;
    }
    if (!supabase) {
      return;
    }

    if (currentProjectId && !isInitializedRef.current) {
      return;
    }

    if (isSavingRef.current) {
      needsSaveRef.current = true;
      return;
    }

    isSavingRef.current = true;

    try {
      setSaveStatus('saving');

      const uniqueElements = getUniqueElements(elements);
      const persistedElements = await persistCanvasElementAssets(uniqueElements);
      const assetsChanged = persistedElements.some((element, index) => element !== uniqueElements[index]);

      if (assetsChanged) {
        onAssetsPersisted(persistedElements);
      }

      if (currentProjectId) {
        const currentElementById = new Map(persistedElements.map((element) => [element.id, element]));
        const dirtyElements = persistedElements.filter(
          (element) => persistedElementRefsRef.current.get(element.id) !== element
        );
        const deletedElementIds = Array.from(persistedElementRefsRef.current.keys()).filter(
          (elementId) => !currentElementById.has(elementId)
        );
        const canonicalRowIdByElementId = new Map<string, string>();

        persistedElements.forEach((element) => {
          canonicalRowIdByElementId.set(
            element.id,
            rowIdsByElementIdRef.current.get(element.id)?.[0] || uuidv4()
          );
        });

        const rowIdsToDelete = new Set(staleRowIdsRef.current);
        deletedElementIds.forEach((elementId) => {
          rowIdsByElementIdRef.current.get(elementId)?.forEach((rowId) => rowIdsToDelete.add(rowId));
        });
        persistedElements.forEach((element) => {
          rowIdsByElementIdRef.current.get(element.id)?.slice(1).forEach((rowId) => rowIdsToDelete.add(rowId));
        });

        const titleChanged = persistedTitleRef.current !== title;
        const hasElementChanges = dirtyElements.length > 0 || rowIdsToDelete.size > 0;

        if (!titleChanged && !hasElementChanges) {
          setSaveStatus('saved');
          return;
        }

        if (dirtyElements.length > 0) {
          const canvasRows: CanvasElementInsert[] = dirtyElements.map((element) => ({
            id: canonicalRowIdByElementId.get(element.id),
            project_id: currentProjectId,
            element_data: element,
          }));

          for (const canvasRowsBatch of getBatches(canvasRows, ELEMENT_WRITE_BATCH_SIZE)) {
            const { error: elementsError } = await supabase
              .from('canvas_elements')
              .upsert(canvasRowsBatch);

            if (elementsError) throw elementsError;
          }
        }

        if (rowIdsToDelete.size > 0) {
          for (const rowIdBatch of getBatches(Array.from(rowIdsToDelete), ELEMENT_DELETE_BATCH_SIZE)) {
            const { error: deleteError } = await supabase
              .from('canvas_elements')
              .delete()
              .in('id', rowIdBatch);

            if (deleteError) throw deleteError;
          }
        }
        const projectUpdate: ProjectUpdate = {
          title,
          updated_at: new Date().toISOString(),
        };
        const { error: projectError } = await supabase
          .from('projects')
          .update(projectUpdate)
          .eq('id', currentProjectId);

        if (projectError) throw projectError;

        persistedElementRefsRef.current = new Map(persistedElements.map((element) => [element.id, element]));
        rowIdsByElementIdRef.current = new Map(
          uniqueElements.map((element) => [element.id, [canonicalRowIdByElementId.get(element.id)!]])
        );
        staleRowIdsRef.current = [];
        persistedTitleRef.current = title;
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

        setCurrentProjectId(newProjectId);
        router.replace(`/canvas?id=${newProjectId}`);

        const rowIdsByElementId = new Map<string, string[]>();

        if (persistedElements.length > 0) {
          const canvasRows: CanvasElementInsert[] = persistedElements.map((element) => {
            const rowId = uuidv4();
            rowIdsByElementId.set(element.id, [rowId]);
            return {
              id: rowId,
              project_id: newProjectId,
              element_data: element,
            };
          });
          rowIdsByElementIdRef.current = rowIdsByElementId;

          for (const canvasRowsBatch of getBatches(canvasRows, ELEMENT_WRITE_BATCH_SIZE)) {
            const { error: elementsError } = await supabase
              .from('canvas_elements')
              .insert(canvasRowsBatch);

            if (elementsError) throw elementsError;
          }
        }

        persistedElementRefsRef.current = new Map(persistedElements.map((element) => [element.id, element]));
        rowIdsByElementIdRef.current = rowIdsByElementId;
        staleRowIdsRef.current = [];
        persistedTitleRef.current = title;
      }

      setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to save project:', error);
      setSaveStatus('offline');
    } finally {
      isSavingRef.current = false;
    }
  }, [currentProjectId, elements, onAssetsPersisted, router, supabase, title, user]);

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
        setIsHydrating(false);
        return;
      }

      if (!supabase) {
        return;
      }

      try {
        setIsLoading(true);
        setIsHydrating(true);
        setSaveStatus('saved');
        isInitializedRef.current = false;
        persistedElementRefsRef.current = new Map();
        rowIdsByElementIdRef.current = new Map();
        staleRowIdsRef.current = [];

        const fetchElementPage = (from: number) => supabase
          .from('canvas_elements')
          .select('id,element_data,created_at,updated_at')
          .eq('project_id', projectId)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + ELEMENT_PAGE_SIZE - 1);

        const [projectResult, firstElementsResult] = await Promise.all([
          supabase.from('projects').select('id,title').eq('id', projectId).eq('user_id', user.id).single(),
          fetchElementPage(0),
        ]);

        if (projectResult.error) throw projectResult.error;
        if (firstElementsResult.error) throw firstElementsResult.error;

        const project = projectResult.data as Pick<ProjectRow, 'id' | 'title'> | null;
        const loadedElementIds = new Set<string>();
        const ingestRows = (rows: CanvasElementLoadRow[]) => {
          const nextElements: CanvasElement[] = [];

          rows.forEach((row) => {
            if (!isCanvasElement(row.element_data)) {
              staleRowIdsRef.current.push(row.id);
              return;
            }

            const element = row.element_data;
            const rowIds = rowIdsByElementIdRef.current.get(element.id) || [];
            rowIdsByElementIdRef.current.set(element.id, [...rowIds, row.id]);

            if (loadedElementIds.has(element.id)) return;

            loadedElementIds.add(element.id);
            persistedElementRefsRef.current.set(element.id, element);
            nextElements.push(element);
          });

          return nextElements;
        };

        const projectTitle = project?.title || 'Untitled';
        persistedTitleRef.current = projectTitle;
        setCurrentProjectId(projectId);

        let pageRows = (firstElementsResult.data || []) as unknown as CanvasElementLoadRow[];
        onProjectLoaded({
          title: projectTitle,
          elements: ingestRows(pageRows),
          append: false,
        });
        setIsLoading(false);

        let nextOffset = ELEMENT_PAGE_SIZE;
        while (pageRows.length === ELEMENT_PAGE_SIZE) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

          const elementsResult = await fetchElementPage(nextOffset);
          if (elementsResult.error) throw elementsResult.error;

          pageRows = (elementsResult.data || []) as unknown as CanvasElementLoadRow[];
          const nextElements = ingestRows(pageRows);
          if (nextElements.length > 0) {
            onProjectLoaded({
              title: projectTitle,
              elements: nextElements,
              append: true,
            });
          }
          nextOffset += ELEMENT_PAGE_SIZE;
        }

        isInitializedRef.current = true;
      } catch (error) {
        console.error('Failed to load project:', error);
        setSaveStatus('offline');
      } finally {
        setIsLoading(false);
        setIsHydrating(false);
      }
    },
    [onProjectLoaded, supabase, user]
  );

  useEffect(() => {
    if (hasLoadedRef.current || user === undefined) return;

    if (initialProjectId && user && supabase && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      void loadProject(initialProjectId);
    } else if (initialProjectId && user === null) {
      hasLoadedRef.current = true;
      setIsLoading(false);
      setIsHydrating(false);
      isInitializedRef.current = true;
    } else if (!initialProjectId) {
      hasLoadedRef.current = true;
      if (user === null) {
        void loadLocalCanvasDraft()
          .then((draft) => {
            if (draft) {
              onProjectLoaded({
                title: draft.title,
                elements: normalizeCanvasConnections(draft.elements),
                append: false,
              });
            }
            setSaveStatus(draft ? 'local' : 'saved');
          })
          .catch((error) => {
            console.error('Failed to load local project:', error);
            setSaveStatus('offline');
          })
          .finally(() => {
            setIsLoading(false);
            setIsHydrating(false);
            isInitializedRef.current = true;
          });
      } else {
        setIsLoading(false);
        setIsHydrating(false);
        isInitializedRef.current = true;
      }
    }
  }, [initialProjectId, loadProject, onProjectLoaded, supabase, user]);

  useEffect(() => {
    if (user === undefined || isHydrating || !isInitializedRef.current || isInteractionActive) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      return;
    }

    scheduleSave(2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [elements, isHydrating, isInteractionActive, scheduleSave, title, user]);

  return {
    currentProjectId,
    saveStatus,
    isLoading,
    isHydrating,
    supabase,
    loadProject,
    saveProject: performSave,
    setCurrentProjectId,
  };
}
