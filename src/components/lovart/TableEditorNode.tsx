'use client';

import { Download, RefreshCw, Rows3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CanvasElement } from './CanvasArea';
import { parseTableContent, tableToCsv, tableToMarkdown } from '@/lib/table-editor';

interface TableEditorNodeProps {
  connectedContent?: string;
  columns: string[];
  rows: string[][];
  view: 'table' | 'markdown';
  autoHeight: boolean;
  markdown: string;
  onConfigChange: (updates: Partial<CanvasElement>) => void;
}

interface DraftInputProps {
  value: string;
  className: string;
  onFocus: () => void;
  onDraftChange: (value: string) => void;
  onCommit: (value: string) => void;
}

function DraftInput({ value, className, onFocus, onDraftChange, onCommit }: DraftInputProps) {
  const [state, setState] = useState({ draft: value, external: value, focused: false, dirty: false });

  if (value !== state.external) {
    setState((current) => ({
      ...current,
      draft: current.focused && current.dirty ? current.draft : value,
      external: value,
    }));
  }

  return (
    <input
      value={state.draft}
      onFocus={() => {
        setState((current) => ({ ...current, focused: true, dirty: false }));
        onFocus();
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setState((current) => ({ ...current, draft: nextValue, dirty: true }));
        onDraftChange(nextValue);
      }}
      onBlur={(event) => {
        setState((current) => ({ ...current, focused: false, dirty: false }));
        onCommit(event.currentTarget.value);
      }}
      className={className}
    />
  );
}

interface DraftTextareaProps extends DraftInputProps {
  autoHeight?: boolean;
  placeholder?: string;
  spellCheck?: boolean;
}

function DraftTextarea({
  value,
  className,
  onFocus,
  onDraftChange,
  onCommit,
  autoHeight = false,
  placeholder,
  spellCheck,
}: DraftTextareaProps) {
  const [state, setState] = useState({ draft: value, external: value, focused: false, dirty: false });

  if (value !== state.external) {
    setState((current) => ({
      ...current,
      draft: current.focused && current.dirty ? current.draft : value,
      external: value,
    }));
  }

  return (
    <textarea
      value={state.draft}
      rows={autoHeight ? Math.min(12, Math.max(1, Math.ceil(state.draft.length / 24))) : undefined}
      onFocus={() => {
        setState((current) => ({ ...current, focused: true, dirty: false }));
        onFocus();
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setState((current) => ({ ...current, draft: nextValue, dirty: true }));
        onDraftChange(nextValue);
      }}
      onBlur={(event) => {
        setState((current) => ({ ...current, focused: false, dirty: false }));
        onCommit(event.currentTarget.value);
      }}
      spellCheck={spellCheck}
      className={className}
      placeholder={placeholder}
    />
  );
}

type ActiveEditor =
  | { kind: 'header'; columnIndex: number; dirty: boolean }
  | { kind: 'cell'; rowIndex: number; columnIndex: number; dirty: boolean }
  | { kind: 'markdown'; dirty: boolean };

type ActiveEditorTarget =
  | { kind: 'header'; columnIndex: number }
  | { kind: 'cell'; rowIndex: number; columnIndex: number }
  | { kind: 'markdown' };

export function TableEditorNode({
  connectedContent,
  columns,
  rows,
  view,
  autoHeight,
  markdown,
  onConfigChange,
}: TableEditorNodeProps) {
  const initialColumns = columns.length > 0 ? columns : ['#'];
  const activeEditorRef = useRef<ActiveEditor | null>(null);
  const draftColumnsRef = useRef<string[]>([...initialColumns]);
  const draftRowsRef = useRef<string[][]>(rows.map((row) => [...row]));
  const draftMarkdownRef = useRef(markdown);

  useEffect(() => {
    const nextColumns = columns.length > 0 ? [...columns] : ['#'];
    const nextRows = rows.map((row) => [...row]);
    const activeEditor = activeEditorRef.current;

    if (activeEditor?.dirty && activeEditor.kind === 'header' && activeEditor.columnIndex < nextColumns.length) {
      nextColumns[activeEditor.columnIndex] = draftColumnsRef.current[activeEditor.columnIndex] ?? '';
    } else if (
      activeEditor?.dirty
      && activeEditor.kind === 'cell'
      && activeEditor.rowIndex < nextRows.length
      && activeEditor.columnIndex < nextColumns.length
    ) {
      const nextRow = Array.from(
        { length: nextColumns.length },
        (_, columnIndex) => nextRows[activeEditor.rowIndex]?.[columnIndex] ?? '',
      );
      nextRow[activeEditor.columnIndex] = draftRowsRef.current[activeEditor.rowIndex]?.[activeEditor.columnIndex] ?? '';
      nextRows[activeEditor.rowIndex] = nextRow;
    }

    draftColumnsRef.current = nextColumns;
    draftRowsRef.current = nextRows;
  }, [columns, rows]);

  useEffect(() => {
    if (!(activeEditorRef.current?.kind === 'markdown' && activeEditorRef.current.dirty)) {
      draftMarkdownRef.current = markdown;
    }
  }, [markdown]);

  const resolvedColumns = columns.length > 0 ? columns : ['#'];
  const resolvedRows = rows;

  const startEditing = (editor: ActiveEditorTarget) => {
    activeEditorRef.current = { ...editor, dirty: false };
  };

  const markActiveEditorDirty = () => {
    if (activeEditorRef.current) activeEditorRef.current.dirty = true;
  };

  const saveTable = (nextColumns: string[], nextRows: string[][]) => {
    const nextMarkdown = tableToMarkdown(nextColumns, nextRows);
    draftColumnsRef.current = nextColumns.map((column) => column);
    draftRowsRef.current = nextRows.map((row) => [...row]);
    draftMarkdownRef.current = nextMarkdown;
    onConfigChange({ tableColumns: nextColumns, tableRows: nextRows, tableMarkdown: nextMarkdown, content: nextMarkdown });
  };

  const refresh = () => {
    activeEditorRef.current = null;
    const source = connectedContent?.trim()
      || draftMarkdownRef.current.trim()
      || tableToMarkdown(draftColumnsRef.current, draftRowsRef.current);
    const parsed = parseTableContent(source);
    saveTable(parsed.columns, parsed.rows);
  };

  const setView = (nextView: 'table' | 'markdown') => {
    if (nextView === view) return;
    activeEditorRef.current = null;
    if (nextView === 'table' && view === 'markdown') {
      const parsed = parseTableContent(draftMarkdownRef.current);
      draftColumnsRef.current = [...parsed.columns];
      draftRowsRef.current = parsed.rows.map((row) => [...row]);
      onConfigChange({ tableView: nextView, tableColumns: parsed.columns, tableRows: parsed.rows, content: tableToMarkdown(parsed.columns, parsed.rows) });
      return;
    }
    const nextMarkdown = tableToMarkdown(draftColumnsRef.current, draftRowsRef.current);
    draftMarkdownRef.current = nextMarkdown;
    onConfigChange({ tableView: nextView, tableMarkdown: nextMarkdown, content: nextMarkdown });
  };

  const downloadCsv = () => {
    const blob = new Blob(['\uFEFF', tableToCsv(draftColumnsRef.current, draftRowsRef.current)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `doodleverse-table-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/12 bg-[#1d1d20] text-white shadow-2xl"
      onMouseDown={(event) => { if ((event.target as HTMLElement).closest('button,input,textarea,select')) event.stopPropagation(); }}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div>
          <div className="text-xs font-semibold">表格编辑器</div>
          <div className="mt-0.5 text-[10px] text-white/40">连接文本节点后可刷新解析</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/65">智能解析</span>
          <button type="button" onClick={refresh} title="刷新解析" className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-white/60 hover:bg-white/8 hover:text-white"><RefreshCw size={13} /></button>
          <button type="button" onClick={downloadCsv} title="下载 CSV" className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-white/60 hover:bg-white/8 hover:text-white"><Download size={13} /></button>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setView('table')} className={`rounded-md px-2.5 py-1 text-[10px] ${view === 'table' ? 'bg-white/12 text-white' : 'text-white/45 hover:text-white'}`}>表格</button>
          <button type="button" onClick={() => setView('markdown')} className={`rounded-md px-2.5 py-1 text-[10px] ${view === 'markdown' ? 'bg-white/12 text-white' : 'text-white/45 hover:text-white'}`}>Markdown</button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onConfigChange({ tableAutoHeight: !autoHeight })} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] ${autoHeight ? 'border-sky-300/25 bg-sky-400/12 text-sky-200' : 'border-white/10 text-white/55'}`}><Rows3 size={11} />行高自适应</button>
          <button type="button" onClick={() => saveTable(draftColumnsRef.current, [...draftRowsRef.current, draftColumnsRef.current.map(() => '')])} className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/65 hover:bg-white/8">+ 行</button>
          <button type="button" onClick={() => saveTable([...draftColumnsRef.current, `#${draftColumnsRef.current.length + 1}`], draftRowsRef.current.map((row) => [...row, '']))} className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/65 hover:bg-white/8">+ 列</button>
        </div>
      </div>

      {view === 'markdown' ? (
        <DraftTextarea
          value={markdown}
          onFocus={() => startEditing({ kind: 'markdown' })}
          onDraftChange={(value) => {
            draftMarkdownRef.current = value;
            markActiveEditorDirty();
          }}
          onCommit={(value) => {
            activeEditorRef.current = null;
            draftMarkdownRef.current = value;
            onConfigChange({ tableMarkdown: value, content: value });
          }}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-black/20 p-3 font-mono text-[11px] leading-5 text-slate-200 outline-none"
          placeholder="| 镜头 | 画面 |\n| --- | --- |"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto bg-black/15">
          {resolvedRows.length === 0 && !connectedContent ? (
            <div className="grid h-full place-items-center px-8 text-center text-[11px] text-white/35">连接文本 / Agent 节点后，点击刷新解析</div>
          ) : (
            <table className="min-w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-[#34353c]">
                <tr>{resolvedColumns.map((column, columnIndex) => (
                  <th key={columnIndex} className="min-w-28 border border-white/10 p-0">
                    <DraftInput
                      value={column}
                      onFocus={() => startEditing({ kind: 'header', columnIndex })}
                      onDraftChange={(value) => {
                        const nextColumns = [...draftColumnsRef.current];
                        nextColumns[columnIndex] = value;
                        draftColumnsRef.current = nextColumns;
                        markActiveEditorDirty();
                      }}
                      onCommit={(value) => {
                        const nextColumns = [...draftColumnsRef.current];
                        nextColumns[columnIndex] = value;
                        activeEditorRef.current = null;
                        saveTable(nextColumns, draftRowsRef.current);
                      }}
                      className="w-full bg-transparent px-2 py-2 text-center font-semibold text-white outline-none"
                    />
                  </th>
                ))}</tr>
              </thead>
              <tbody>{resolvedRows.map((row, rowIndex) => (
                <tr key={rowIndex}>{resolvedColumns.map((_, columnIndex) => (
                  <td key={columnIndex} className="border border-white/10 p-0 align-top">
                    <DraftTextarea
                      value={row[columnIndex] || ''}
                      autoHeight={autoHeight}
                      onFocus={() => startEditing({ kind: 'cell', rowIndex, columnIndex })}
                      onDraftChange={(value) => {
                        const nextRows = draftRowsRef.current.map((item, index) => {
                          if (index !== rowIndex) return item;
                          const nextRow = Array.from({ length: draftColumnsRef.current.length }, (_, cellIndex) => item[cellIndex] || '');
                          nextRow[columnIndex] = value;
                          return nextRow;
                        });
                        draftRowsRef.current = nextRows;
                        markActiveEditorDirty();
                      }}
                      onCommit={(value) => {
                        const nextRows = draftRowsRef.current.map((item, index) => {
                          if (index !== rowIndex) return item;
                          const nextRow = Array.from({ length: draftColumnsRef.current.length }, (_, cellIndex) => item[cellIndex] || '');
                          nextRow[columnIndex] = value;
                          return nextRow;
                        });
                        activeEditorRef.current = null;
                        saveTable(draftColumnsRef.current, nextRows);
                      }}
                      className="block w-full resize-none bg-transparent px-2 py-2 leading-4 text-white/80 outline-none focus:bg-white/5"
                    />
                  </td>
                ))}</tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
