'use client';

import { GitMerge, Replace, X } from 'lucide-react';
import type { QdmyImportResult } from '@/lib/qdmy-project';

interface ProjectImportPreviewDialogProps {
  project: QdmyImportResult;
  onCancel: () => void;
  onMerge: () => void;
  onReplace: () => void;
}

export function ProjectImportPreviewDialog({ project, onCancel, onMerge, onReplace }: ProjectImportPreviewDialogProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="project-import-title">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">
          <div>
            <h2 id="project-import-title" className="text-base font-semibold text-gray-900 dark:text-white">导入项目</h2>
            <p className="mt-1 line-clamp-1 text-sm text-gray-500 dark:text-slate-400">{project.title}</p>
          </div>
          <button type="button" onClick={onCancel} className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white" title="关闭">
            <X size={17} />
          </button>
        </div>

        <div className="grid grid-cols-3 border-b border-gray-200 dark:border-white/10">
          <div className="px-4 py-3 text-center"><div className="text-lg font-semibold text-gray-900 dark:text-white">{project.stats.nodes}</div><div className="text-xs text-gray-500">节点</div></div>
          <div className="border-x border-gray-200 px-4 py-3 text-center dark:border-white/10"><div className="text-lg font-semibold text-gray-900 dark:text-white">{project.stats.connections}</div><div className="text-xs text-gray-500">连线</div></div>
          <div className="px-4 py-3 text-center"><div className="text-lg font-semibold text-gray-900 dark:text-white">{project.stats.groups}</div><div className="text-xs text-gray-500">分组</div></div>
        </div>

        {project.warnings.length > 0 && (
          <div className="max-h-28 overflow-auto border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
            {project.warnings.slice(0, 4).map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-4">
          <button type="button" onClick={onMerge} className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10">
            <GitMerge size={16} />合并到当前画布
          </button>
          <button type="button" onClick={onReplace} className="inline-flex h-9 items-center gap-2 rounded-md bg-gray-900 px-3 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
            <Replace size={16} />替换当前画布
          </button>
        </div>
      </div>
    </div>
  );
}
