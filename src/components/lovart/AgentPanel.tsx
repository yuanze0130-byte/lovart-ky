'use client';

import React, { useState } from 'react';
import { Bot, Send, X } from 'lucide-react';
import type { AgentActionResult } from '@/lib/agent/actions';

interface AgentPanelProps {
  isRunning: boolean;
  result: AgentActionResult | null;
  error: string | null;
  onRun: (message: string) => Promise<void>;
  onClose?: () => void;
}

export function AgentPanel({ isRunning, result, error, onRun, onClose }: AgentPanelProps) {
  const [message, setMessage] = useState('');

  async function handleSubmit() {
    const next = message.trim();
    if (!next || isRunning) return;
    setMessage('');
    await onRun(next);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white">
            <Bot size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Agent</div>
            <div className="text-xs text-gray-500">执行分镜、生成、画布动作</div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
          试试：帮我做一个 6 镜分镜 / 帮我生成 4 张封面候选 / 把这张改成黄昏暖色
        </div>

        {result && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="font-medium">{result.message}</div>
            {'count' in result && typeof result.count === 'number' && (
              <div className="mt-2 text-xs text-emerald-700">数量：{result.count}</div>
            )}
            {result.kind === 'video_started' && result.taskId && (
              <div className="mt-2 break-all text-xs text-emerald-700">Task ID: {result.taskId}</div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 p-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm focus-within:border-gray-400">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="告诉 agent 你要它做什么…"
            className="h-24 w-full resize-none border-none bg-transparent text-sm text-gray-900 outline-none"
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="text-[11px] text-gray-400">Ctrl/Cmd + Enter 发送</div>
            <button
              onClick={() => void handleSubmit()}
              disabled={isRunning || !message.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={14} />
              {isRunning ? '执行中...' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
