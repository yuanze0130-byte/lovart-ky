'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CANVAS_TASK_LOG_CHANGED_EVENT,
  canvasTaskLogEntryToServerRow,
  canvasTaskLogServerRowToEntry,
  loadCanvasTaskLogEntries,
  mergeCanvasTaskLogCollections,
  saveCanvasTaskLogEntries,
  upsertCanvasTaskLogEntries,
  type CanvasTaskLogEntry,
  type CanvasTaskLogServerRow,
  type CanvasTaskLogUpdate,
} from '@/lib/canvas-task-log';
import type { Database } from '@/lib/supabase';

export type CanvasTaskLogSyncState = 'local' | 'syncing' | 'synced' | 'offline';

export function useCanvasTaskLog(
  projectId?: string | null,
  userId?: string | null,
  supabase?: SupabaseClient<Database> | null,
) {
  const [entries, setEntries] = useState<CanvasTaskLogEntry[]>([]);
  const [syncState, setSyncState] = useState<CanvasTaskLogSyncState>('local');
  const entriesRef = useRef<CanvasTaskLogEntry[]>([]);
  const serverAvailableRef = useRef<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const localEntries = loadCanvasTaskLogEntries(projectId);
    entriesRef.current = localEntries;
    serverAvailableRef.current = null;
    const serverSyncEnabled = Boolean(projectId && userId && supabase);
    queueMicrotask(() => {
      if (!active) return;
      setEntries(localEntries);
      setSyncState(serverSyncEnabled ? 'syncing' : 'local');
    });

    if (!projectId || !userId || !supabase) {
      return () => { active = false; };
    }

    void Promise.resolve(supabase
      .from('canvas_task_logs')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(200)
      .then(async ({ data, error }) => {
        if (error) throw error;
        const remoteEntries = (data || [])
          .map((row) => canvasTaskLogServerRowToEntry(row as CanvasTaskLogServerRow))
          .filter((entry): entry is CanvasTaskLogEntry => Boolean(entry));
        const merged = mergeCanvasTaskLogCollections(localEntries, remoteEntries);
        if (!active) return;
        entriesRef.current = merged;
        setEntries(merged);
        saveCanvasTaskLogEntries(projectId, merged);
        if (merged.length > 0) {
          const { error: uploadError } = await supabase
            .from('canvas_task_logs')
            .upsert(merged.map((entry) => canvasTaskLogEntryToServerRow(entry, userId)), {
              onConflict: 'project_id,id',
            });
          if (uploadError) throw uploadError;
        }
        const { data: staleRows, error: staleRowsError } = await supabase
          .from('canvas_task_logs')
          .select('id')
          .eq('project_id', projectId)
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .range(200, 999);
        if (staleRowsError) throw staleRowsError;
        if (staleRows && staleRows.length > 0) {
          const { error: pruneError } = await supabase
            .from('canvas_task_logs')
            .delete()
            .eq('project_id', projectId)
            .eq('user_id', userId)
            .in('id', staleRows.map((row) => row.id));
          if (pruneError) throw pruneError;
        }
        serverAvailableRef.current = true;
        if (active) setSyncState('synced');
      }))
      .catch((error: unknown) => {
        if (!active) return;
        serverAvailableRef.current = false;
        console.warn('Canvas task log server sync unavailable:', error);
        setSyncState('offline');
      });

    return () => { active = false; };
  }, [projectId, supabase, userId]);

  const recordTask = useCallback((update: CanvasTaskLogUpdate) => {
    const next = upsertCanvasTaskLogEntries(entriesRef.current, update, projectId);
    const updatedEntry = next.find((entry) => entry.id === update.id);
    entriesRef.current = next;
    setEntries(next);
    saveCanvasTaskLogEntries(projectId, next);
    if (projectId && userId && supabase && updatedEntry && serverAvailableRef.current !== false) {
      void Promise.resolve(supabase
        .from('canvas_task_logs')
        .upsert(canvasTaskLogEntryToServerRow(updatedEntry, userId), { onConflict: 'project_id,id' })
        .then(({ error }) => {
          if (error) throw error;
          serverAvailableRef.current = true;
          setSyncState('synced');
        }))
        .catch((error: unknown) => {
          serverAvailableRef.current = false;
          console.warn('Canvas task log entry sync failed:', error);
          setSyncState('offline');
        });
    }
    window.dispatchEvent(new CustomEvent(CANVAS_TASK_LOG_CHANGED_EVENT, {
      detail: { projectId: projectId || 'local', taskId: update.id },
    }));
  }, [projectId, supabase, userId]);

  const clearTasks = useCallback(() => {
    entriesRef.current = [];
    setEntries([]);
    saveCanvasTaskLogEntries(projectId, []);
    if (projectId && userId && supabase && serverAvailableRef.current !== false) {
      void Promise.resolve(supabase
        .from('canvas_task_logs')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .then(({ error }) => {
          if (error) throw error;
          serverAvailableRef.current = true;
          setSyncState('synced');
        }))
        .catch((error: unknown) => {
          serverAvailableRef.current = false;
          console.warn('Canvas task log clear sync failed:', error);
          setSyncState('offline');
        });
    }
    window.dispatchEvent(new CustomEvent(CANVAS_TASK_LOG_CHANGED_EVENT, {
      detail: { projectId: projectId || 'local' },
    }));
  }, [projectId, supabase, userId]);

  return { entries, recordTask, clearTasks, syncState };
}
