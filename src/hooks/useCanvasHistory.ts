import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { normalizeStoryboardItems, type StoryboardItem, type StoryboardLayoutMode } from '@/hooks/useProjectAssets';

interface HistorySnapshot {
  elements: CanvasElement[];
  storyboard: StoryboardItem[];
  storyboardLayout: StoryboardLayoutMode;
  selectedStoryboardItemId: string | null;
}

interface UseCanvasHistoryParams {
  elements: CanvasElement[];
  storyboard: StoryboardItem[];
  storyboardLayout: StoryboardLayoutMode;
  selectedStoryboardItemId: string | null;
  isLoading: boolean;
  selectedIds: string[];
  setElements: Dispatch<SetStateAction<CanvasElement[]>>;
  setStoryboard: Dispatch<SetStateAction<StoryboardItem[]>>;
  setStoryboardLayout: Dispatch<SetStateAction<StoryboardLayoutMode>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setSelectedStoryboardItemId: Dispatch<SetStateAction<string | null>>;
  deleteElements: (ids: string[]) => void;
  saveProject: () => Promise<void>;
}

function cloneElements(elements: CanvasElement[]) {
  return JSON.parse(JSON.stringify(elements)) as CanvasElement[];
}

function cloneStoryboard(storyboard: StoryboardItem[]) {
  return JSON.parse(JSON.stringify(storyboard)) as StoryboardItem[];
}

function createSnapshot(input: Pick<UseCanvasHistoryParams, 'elements' | 'storyboard' | 'storyboardLayout' | 'selectedStoryboardItemId'>): HistorySnapshot {
  return {
    elements: cloneElements(input.elements),
    storyboard: cloneStoryboard(input.storyboard),
    storyboardLayout: input.storyboardLayout,
    selectedStoryboardItemId: input.selectedStoryboardItemId,
  };
}

function duplicateElements(source: CanvasElement[]) {
  const idMap = new Map<string, string>();
  source.forEach((element) => {
    idMap.set(element.id, uuidv4());
  });

  return source.map((element) => {
    const nextElement = {
      ...element,
      id: idMap.get(element.id)!,
      x: element.x + 24,
      y: element.y + 24,
      referenceImageId: element.referenceImageId ? idMap.get(element.referenceImageId) || element.referenceImageId : element.referenceImageId,
      connectorFrom: element.connectorFrom ? idMap.get(element.connectorFrom) || element.connectorFrom : element.connectorFrom,
      connectorTo: element.connectorTo ? idMap.get(element.connectorTo) || element.connectorTo : element.connectorTo,
      linkedElements: element.linkedElements?.map((id) => idMap.get(id) || id),
      groupId: element.groupId ? uuidv4() : element.groupId,
    } as CanvasElement;

    delete nextElement.storyboardItemId;
    delete nextElement.storyboardShotLabel;
    delete nextElement.storyboardTitle;
    delete nextElement.storyboardMeta;
    delete nextElement.storyboardBrief;
    delete nextElement.storyboardAspectRatio;
    delete nextElement.storyboardVideoSize;
    delete nextElement.storyboardOrientation;
    delete nextElement.storyboardSourceAspectRatio;
    delete nextElement.storyboardSourceVideoSize;
    delete nextElement.storyboardSourceOrientation;
    delete nextElement.storyboardRenderProfile;
    delete nextElement.storyboardDurationSec;
    delete nextElement.storyboardShotIndex;
    delete nextElement.storyboardShotCount;
    delete nextElement.storyboardSequenceState;
    delete nextElement.storyboardSequenceHint;
    delete nextElement.storyboard序列State;
    delete nextElement.storyboard序列Hint;
    delete nextElement.storyboardBoardMode;
    delete nextElement.storyboardElementRole;
    delete nextElement.storyboardLaneOrientation;

    return nextElement;
  });
}

function normalizeElements(elements: CanvasElement[]) {
  const nextElements = cloneElements(elements);
  const remainingElementIds = new Set(nextElements.map((element) => element.id));

  return nextElements
    .filter((element) => {
      if (element.type !== 'connector') return true;
      if (!element.connectorFrom || !element.connectorTo) return false;
      return remainingElementIds.has(element.connectorFrom) && remainingElementIds.has(element.connectorTo);
    })
    .map((element) => {
      const nextElement = { ...element } as CanvasElement;

      if (nextElement.referenceImageId && !remainingElementIds.has(nextElement.referenceImageId)) {
        delete nextElement.referenceImageId;
      }

      if (nextElement.linkedElements?.length) {
        const nextLinkedElements = nextElement.linkedElements.filter((linkedId) => remainingElementIds.has(linkedId));
        if (nextLinkedElements.length > 0) {
          nextElement.linkedElements = nextLinkedElements;
        } else {
          delete nextElement.linkedElements;
        }
      }

      return nextElement;
    });
}

function normalizeHistoryState(snapshot: HistorySnapshot) {
  const elements = normalizeElements(snapshot.elements);
  const remainingElementIds = new Set(elements.map((element) => element.id));
  const storyboard = normalizeStoryboardItems(
    cloneStoryboard(snapshot.storyboard).filter((item) => remainingElementIds.has(item.elementId))
  );
  const selectedStoryboardItemId = snapshot.selectedStoryboardItemId && storyboard.some((item) => item.id === snapshot.selectedStoryboardItemId)
    ? snapshot.selectedStoryboardItemId
    : storyboard[0]?.id ?? null;

  return {
    elements,
    storyboard,
    storyboardLayout: snapshot.storyboardLayout,
    selectedStoryboardItemId,
  } satisfies HistorySnapshot;
}

export function useCanvasHistory({
  elements,
  storyboard,
  storyboardLayout,
  selectedStoryboardItemId,
  isLoading,
  selectedIds,
  setElements,
  setStoryboard,
  setStoryboardLayout,
  setSelectedIds,
  setSelectedStoryboardItemId,
  deleteElements,
  saveProject,
}: UseCanvasHistoryParams) {
  const historyRef = useRef<HistorySnapshot[]>([]);
  const futureRef = useRef<HistorySnapshot[]>([]);
  const clipboardRef = useRef<CanvasElement[]>([]);
  const suppressHistoryRef = useRef(false);

  useEffect(() => {
    if (isLoading || suppressHistoryRef.current) return;

    const nextSnapshot = createSnapshot({
      elements,
      storyboard,
      storyboardLayout,
      selectedStoryboardItemId,
    });
    const previousSnapshot = historyRef.current[historyRef.current.length - 1];
    const serializedNext = JSON.stringify(nextSnapshot);
    const serializedPrevious = previousSnapshot ? JSON.stringify(previousSnapshot) : null;

    if (serializedNext === serializedPrevious) {
      return;
    }

    historyRef.current.push(nextSnapshot);
    if (historyRef.current.length > 100) {
      historyRef.current.shift();
    }
    futureRef.current = [];
  }, [elements, isLoading, selectedStoryboardItemId, storyboard, storyboardLayout]);

  const restoreSnapshot = useCallback((snapshot: HistorySnapshot) => {
    suppressHistoryRef.current = true;
    const normalizedSnapshot = normalizeHistoryState(snapshot);

    setElements(normalizedSnapshot.elements);
    setStoryboard(normalizedSnapshot.storyboard);
    setStoryboardLayout(normalizedSnapshot.storyboardLayout);
    setSelectedStoryboardItemId(normalizedSnapshot.selectedStoryboardItemId);
    window.setTimeout(() => {
      suppressHistoryRef.current = false;
    }, 0);
  }, [setElements, setSelectedStoryboardItemId, setStoryboard, setStoryboardLayout]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      const activeElement = document.activeElement as HTMLElement | null;
      const activeTag = activeElement?.tagName;
      const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeElement?.isContentEditable === true;
      const key = e.key.toLowerCase();
      const isUndo = modKey && key === 'z' && !e.shiftKey;
      const isRedo = modKey && ((isMac && key === 'z' && e.shiftKey) || (!isMac && key === 'y' && !e.shiftKey));

      if (modKey && key === 's') {
        e.preventDefault();
        void saveProject();
        return;
      }

      if (isTyping) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        deleteElements(selectedIds);
        return;
      }

      if (modKey && key === 'c' && selectedIds.length > 0) {
        e.preventDefault();
        clipboardRef.current = elements.filter((el) => selectedIds.includes(el.id));
        return;
      }

      if (modKey && key === 'v' && clipboardRef.current.length > 0) {
        e.preventDefault();
        const duplicated = duplicateElements(clipboardRef.current);
        setElements((prev) => [...prev, ...duplicated]);
        setSelectedIds(duplicated.map((el) => el.id));
        return;
      }

      if (isUndo) {
        e.preventDefault();
        if (historyRef.current.length > 1) {
          const current = historyRef.current.pop();
          if (current) futureRef.current.unshift(current);
          const previous = historyRef.current[historyRef.current.length - 1];
          if (previous) {
            restoreSnapshot(previous);
            setSelectedIds([]);
          }
        }
        return;
      }

      if (isRedo) {
        e.preventDefault();
        const next = futureRef.current.shift();
        if (next) {
          historyRef.current.push(createSnapshot(next));
          restoreSnapshot(next);
          setSelectedIds([]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteElements, elements, restoreSnapshot, saveProject, selectedIds, setElements, setSelectedIds]);

  return {
    restoreSnapshot,
  };
}
