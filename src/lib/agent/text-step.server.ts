import { createServiceRoleSupabaseClient, type Json } from '@/lib/supabase';
import type { AgentChatResult } from './actions';
import { isAiSafetyError } from '@/lib/ai-safety';
import { type DurableStepRepository, type DurableStepRow, runDurableStep } from './durable-step';

export type StoredTextResult = { chat: AgentChatResult; billing: { requestId: string; chargedCredits: number } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ownedRepository(userId: string, projectId: string): Promise<DurableStepRepository<StoredTextResult>> {
  const db = createServiceRoleSupabaseClient();
  const project = await db.from('projects').select('id').eq('id', projectId).eq('user_id', userId).maybeSingle();
  if (project.error) throw project.error;
  if (!project.data) throw new Error('无法访问此项目');
  return {
    insert: async row => {
      const { error } = await db.from('canvas_agent_text_runs').insert({ ...row, result: null });
      if (error?.code === '23505') return false;
      if (error) throw error;
      return true;
    },
    read: async requestId => {
      const { data, error } = await db.from('canvas_agent_text_runs').select('*')
        .eq('request_id', requestId).eq('user_id', userId).eq('project_id', projectId).maybeSingle();
      if (error) throw error;
      return data as DurableStepRow<StoredTextResult> | null;
    },
    finish: async row => {
      const { data, error } = await db.from('canvas_agent_text_runs').update({ status: row.status,
        result: row.result as unknown as Json, updated_at: new Date().toISOString() })
        .eq('request_id', row.request_id).eq('user_id', userId).eq('project_id', projectId)
        .eq('digest', row.digest).eq('status', 'running').select('request_id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('原任务记录已变化');
    },
  };
}
export async function executeTextStep(userId: string, projectId: string, requestId: string, digest: string, run: () => Promise<StoredTextResult>) {
  if (!uuid.test(requestId) || !/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error('工作流或项目编号无效');
  const repo = await ownedRepository(userId, projectId);
  return runDurableStep(repo, { request_id: requestId, user_id: userId, project_id: projectId, digest }, run,
    error=>isAiSafetyError(error) && ['AI_KILL_SWITCH','AI_COST_CONFIG_INVALID','DAILY_AI_BUDGET_EXCEEDED','AI_ADMISSION_UNAVAILABLE','AI_NOT_SUBMITTED','INSUFFICIENT_CREDITS'].includes(error.code));
}
export async function readTextStep(userId: string, projectId: string, requestId: string) {
  if (!uuid.test(requestId) || !/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error('工作流或项目编号无效');
  return (await ownedRepository(userId, projectId)).read(requestId, userId, projectId);
}
