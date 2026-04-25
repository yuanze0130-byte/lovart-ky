import type { NextRequest } from 'next/server';
import type { AgentContext } from '@/lib/agent/actions';

export async function callInternalJson<T>(request: NextRequest, path: string, body: unknown) {
  const origin = request.nextUrl.origin;
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error((data && (data.details || data.error)) || `Request failed: ${path}`);
  }

  return data as T;
}

export function ensureProjectContext(context: AgentContext) {
  if (!context.projectId) {
    throw new Error('当前没有 project，无法执行这个 agent 动作');
  }
}
