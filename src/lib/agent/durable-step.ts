export type DurableStepRow<T> = {
  request_id: string; user_id: string; project_id: string; digest: string;
  status: 'running' | 'completed' | 'unknown' | 'failed'; result: T | null;
};
export type DurableStepRepository<T> = {
  insert: (row: DurableStepRow<T>) => Promise<boolean>;
  read: (requestId: string, userId: string, projectId: string) => Promise<DurableStepRow<T> | null>;
  finish: (row: DurableStepRow<T>) => Promise<void>;
};
export class DurableStepConflict extends Error {
  constructor(message: string, readonly state: 'running' | 'unknown' | 'failed' | 'conflict') { super(message); }
}

/** Atomic insert wins the right to call the provider. Existing results are read-only replays. */
export async function runDurableStep<T>(repo: DurableStepRepository<T>, identity: Omit<DurableStepRow<T>, 'status' | 'result'>,
  run: () => Promise<T>, confirmedNotSubmitted: (error:unknown)=>boolean = ()=>false): Promise<T> {
  const row: DurableStepRow<T> = { ...identity, status: 'running', result: null };
  const claimed = await repo.insert(row);
  if (!claimed) {
    const previous = await repo.read(identity.request_id, identity.user_id, identity.project_id);
    if (!previous || previous.digest !== identity.digest) throw new DurableStepConflict('任务编号已使用或输入已变化，请核对原任务', 'conflict');
    if (previous.status === 'completed' && previous.result !== null) return previous.result;
    throw new DurableStepConflict('原任务尚无可重用结果，请查询状态，未重新提交', previous.status === 'completed' ? 'unknown' : previous.status);
  }
  let result: T;
  try { result = await run(); }
  catch (error) {
    // Provider acceptance and refund completion cannot be inferred from a thrown network error.
    await repo.finish({ ...row, status: confirmedNotSubmitted(error) ? 'failed' : 'unknown' }).catch(() => {});
    throw error;
  }
  try { await repo.finish({ ...row, status: 'completed', result }); }
  catch { throw new DurableStepConflict('结果暂未保存成功，请核对原任务，未重新提交', 'unknown'); }
  return result;
}
