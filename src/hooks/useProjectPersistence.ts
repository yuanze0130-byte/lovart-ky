import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { useSupabase } from '@/hooks/useSupabase';
import { loadLocalCanvasDraft, saveLocalCanvasDraft } from '@/lib/local-canvas-store';
import { normalizeCanvasConnections } from '@/lib/canvas-connections';
import { persistCanvasElementAssets, refreshCanvasElementAssetUrls } from '@/lib/canvas-asset-upload';
import { authedFetch } from '@/lib/authed-fetch';
import { markProjectOpened } from '@/lib/project-recency';

export type ProjectViewport = { x: number; y: number; scale: number };
type Document = { id: string; title: string; elements: CanvasElement[]; revision: number; viewport?: ProjectViewport };
interface UseProjectPersistenceParams {
  user: User | null | undefined;
  initialProjectId: string | null;
  elements: CanvasElement[];
  title: string;
  viewport?: ProjectViewport;
  isInteractionActive?: boolean;
  onProjectLoaded: (payload: { title: string; elements: CanvasElement[]; append?: boolean; viewport?: ProjectViewport }) => void;
  onAssetsPersisted: (elements: CanvasElement[], originalElements?: CanvasElement[]) => void;
}

function validElements(input: unknown): input is CanvasElement[] {
  return Array.isArray(input) && input.every(e => e && typeof e.id === 'string' && typeof e.type === 'string'
    && Number.isFinite(e.x) && Number.isFinite(e.y));
}
export function useProjectPersistence({ user, initialProjectId, elements, title, viewport, isInteractionActive = false,
  onProjectLoaded, onAssetsPersisted }: UseProjectPersistenceParams) {
  const supabase = useSupabase();
  const router = useRouter();
  const [currentProjectId, setCurrentProjectId] = useState(initialProjectId);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending' | 'saving' | 'local' | 'offline' | 'load-error' | 'conflict'>('saved');
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrating, setIsHydrating] = useState(true);
  const ready = useRef(false);
  const generation = useRef(0);
  const saving = useRef(false);
  const revision = useRef(-1);
  const documentId = useRef(initialProjectId || uuidv4());
  const loadedScope = useRef<string | null>(null);
  const blocked = useRef(false);
  const persisted = useRef<{ elements: CanvasElement[]; title: string; viewport?: ProjectViewport } | null>(null);
  const latest = useRef({ elements, title, viewport });
  latest.current = { elements, title, viewport };
  const callbacks = useRef({ onProjectLoaded, onAssetsPersisted });
  callbacks.current = { onProjectLoaded, onAssetsPersisted };
  const owner = user?.id;
  const dirty = useCallback(() => {
    const a = persisted.current, b = latest.current;
    return !a || a.elements !== b.elements || a.title !== b.title || JSON.stringify(a.viewport) !== JSON.stringify(b.viewport);
  }, []);

  const loadProject = useCallback(async (id: string) => {
    if (!owner) return;
    const epoch = ++generation.current;
    ready.current = false;
    blocked.current = false;
    setIsLoading(true); setIsHydrating(true);
    try {
      const response = await authedFetch(`/api/projects/document?id=${encodeURIComponent(id)}`);
      const document: Document = await response.json();
      if (!response.ok || !validElements(document.elements) || !Number.isSafeInteger(document.revision)) throw new Error('Invalid project document');
      // Do not expose a partially hydrated document to editing or saving.
      const unique = Array.from(new Map(document.elements.map(e => [e.id, e])).values());
      const loaded = normalizeCanvasConnections(await refreshCanvasElementAssetUrls(unique));
      if (epoch !== generation.current) return;
      revision.current = document.revision;
      documentId.current = id;
      setCurrentProjectId(id);
      persisted.current = { elements: loaded, title: document.title, viewport: document.viewport || undefined };
      callbacks.current.onProjectLoaded({ ...persisted.current, append: false });
      markProjectOpened(owner, id);
      ready.current = true;
      setSaveStatus('saved');
    } catch (error) {
      if (epoch !== generation.current) return;
      console.error('Failed to load project:', error);
      blocked.current = true; setSaveStatus('load-error');
    } finally {
      if (epoch === generation.current) { setIsLoading(false); setIsHydrating(false); }
    }
  }, [owner]);

  useEffect(() => {
    if (user === undefined) return;
    const scope = `${owner || 'guest'}:${initialProjectId || 'new'}`;
    if (loadedScope.current === scope) return;
    // The URL changes when our first atomic save creates a project; keep its state.
    if (ready.current && owner && initialProjectId === documentId.current && loadedScope.current === `${owner}:new`) {
      loadedScope.current = scope; return;
    }
    loadedScope.current = scope;
    ready.current = false; blocked.current = false;
    revision.current = -1; persisted.current = null;
    documentId.current = initialProjectId || uuidv4();
    if (initialProjectId) {
      if (owner) { void loadProject(initialProjectId); }
      else { ++generation.current; blocked.current = true; setSaveStatus('load-error'); setIsLoading(false); setIsHydrating(false); }
      return;
    }
    const epoch = ++generation.current;
    setIsLoading(true); setIsHydrating(true);
    const initialize = async () => {
      try {
        const draft = owner ? null : await loadLocalCanvasDraft();
        if (epoch !== generation.current) return;
        if (draft) {
          const loaded = normalizeCanvasConnections(draft.elements);
          persisted.current = { elements: loaded, title: draft.title };
          callbacks.current.onProjectLoaded({ ...persisted.current, append: false });
        }
        ready.current = true; setSaveStatus(draft ? 'local' : 'saved');
      } catch (error) {
        console.error('Failed to load local project:', error);
        blocked.current = true; setSaveStatus('load-error');
      } finally {
        if (epoch === generation.current) { setIsLoading(false); setIsHydrating(false); }
      }
    };
    void initialize();
  }, [user, owner, initialProjectId, loadProject]);
  useEffect(() => () => { ++generation.current; ready.current = false; loadedScope.current = null; }, []);

  const performSave = useCallback(async () => {
    if (user === undefined || !ready.current || blocked.current || saving.current || !dirty()) return;
    const epoch = generation.current;
    const draft = latest.current;
    saving.current = true; setSaveStatus('saving');
    try {
      if (!owner) {
        await saveLocalCanvasDraft(draft);
        if (epoch === generation.current) { persisted.current = draft; setSaveStatus(dirty() ? 'pending' : 'local'); }
        return;
      }
      // Keep an account/project-scoped local recovery copy before any network write.
      await saveLocalCanvasDraft({ ...draft, id: `recovery:${owner}:${documentId.current}` }).catch(() => undefined);
      const uploaded = await persistCanvasElementAssets(draft.elements);
      if (epoch !== generation.current) return;
      const response = await authedFetch('/api/projects/document', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: documentId.current, revision: revision.current, title: draft.title, elements: uploaded, viewport: draft.viewport }) });
      const data = await response.json();
      if (epoch !== generation.current) return;
      if (response.status === 409) { blocked.current = true; setSaveStatus('conflict'); return; }
      if (!response.ok || !Number.isSafeInteger(data.revision)) throw new Error(data.error || 'Save failed');
      if (revision.current === -1) markProjectOpened(owner, documentId.current);
      revision.current = data.revision;
      // Preserve edits made while asset uploads were in flight.
      persisted.current = draft;
      if (uploaded.some((e, i) => e !== draft.elements[i])) callbacks.current.onAssetsPersisted(uploaded, draft.elements);
      setCurrentProjectId(documentId.current);
      if (!initialProjectId) router.replace(`/canvas?id=${documentId.current}`);
      setSaveStatus(dirty() ? 'pending' : 'saved');
    } catch (error) {
      if (epoch !== generation.current) return;
      console.error('Failed to save project:', error); setSaveStatus('offline');
    } finally { saving.current = false; }
  }, [user, owner, dirty, initialProjectId, router]);
  const saveRef = useRef(performSave); saveRef.current = performSave;
  useEffect(() => {
    if (isHydrating || !ready.current || blocked.current || user === undefined || !dirty()) return;
    setSaveStatus(s => s === 'saving' ? s : 'pending');
    if (isInteractionActive) return;
    const timer = setTimeout(() => void saveRef.current(), 2000);
    return () => clearTimeout(timer);
  }, [elements, title, viewport, isHydrating, user, isInteractionActive, dirty]);
  useEffect(() => {
    if (!['pending', 'offline'].includes(saveStatus) || isHydrating || blocked.current) return;
    const timer = setInterval(() => { if (navigator.onLine && !isInteractionActive) void saveRef.current(); }, 5000);
    return () => clearInterval(timer);
  }, [saveStatus, isHydrating, isInteractionActive]);
  useEffect(() => {
    if (!['pending', 'saving', 'offline', 'conflict'].includes(saveStatus)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveStatus]);
  const restoreVersion = useCallback(async (version: number) => {
    if (!owner || !ready.current || blocked.current || saving.current || dirty()) throw new Error('请先完成当前保存或解决保存冲突');
    saving.current = true;
    const epoch = generation.current;
    const id = documentId.current;
    const before = latest.current;
    const changed = () => latest.current.elements !== before.elements || latest.current.title !== before.title
      || JSON.stringify(latest.current.viewport) !== JSON.stringify(before.viewport);
    try {
    const response = await authedFetch(`/api/projects/document?id=${documentId.current}&history=1&revision=${version}`);
    const versions = await response.json();
    if (!response.ok || !validElements(versions[0]?.elements)) throw new Error('无法读取历史版本');
    const data = versions[0];
    if (epoch !== generation.current) return;
    if (changed()) throw new Error('读取历史版本期间画布发生了修改，请保存后再恢复');
    const restored = await authedFetch('/api/projects/document', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: documentId.current, revision: revision.current, title: data.title, elements: data.elements, viewport: data.viewport }) });
    if (!restored.ok) {
      if (epoch === generation.current && restored.status === 409) { blocked.current = true; setSaveStatus('conflict'); }
      throw new Error('项目已更新或恢复失败，请重新打开项目后再试');
    }
    if (epoch === generation.current && changed()) {
      await saveLocalCanvasDraft({ ...latest.current, id: `recovery:${owner}:${id}` }).catch(() => undefined);
      blocked.current = true; setSaveStatus('conflict');
      throw new Error('历史版本已恢复，但当前窗口有新修改；请先导出本地修改，再重新加载');
    }
    if (epoch === generation.current) await loadProject(id);
    } finally { saving.current = false; }
  }, [owner, loadProject, dirty]);
  return { currentProjectId, saveStatus, isLoading, isHydrating, supabase, loadProject, saveProject: performSave, setCurrentProjectId, restoreVersion };
}
