import { createServiceRoleSupabaseClient, type Json } from '@/lib/supabase';
import { getProxyTargets, getImageTaskPollTarget } from '@/lib/image-provider-routing.server';
import { isDoodleverseGateway } from '@/lib/image-gateway-routing';
import { isImageModelId } from '@/lib/image-models';
import { observeImageTask } from '@/lib/image-task-result';
import { saveCanvasAsset } from '@/lib/canvas-asset-server';
import { importRemoteCanvasAsset } from '@/lib/canvas-asset-import-server';
import { refundCredits } from '@/lib/credits';
import { finalizeAiBudget } from '@/lib/ai-safety';

export type RecoverableImageRun = { request_id: string; status: string; meta: Json; created_at: string; updated_at: string };

export function canReconcileImageRun(run: RecoverableImageRun, now = Date.now()) {
  const meta = run.meta && typeof run.meta === 'object' && !Array.isArray(run.meta) ? run.meta : {};
  const age = now - Date.parse(run.created_at);
  return Boolean(meta.upstreamTask) && !['refunded','not_charged'].includes(String(meta.billingState)) && age >= 0 && age < 24 * 60 * 60_000
    && (run.status === 'outcome_unknown' || (run.status === 'running' && age > 15 * 60_000))
    && now - Number(meta.lastRecoveryAt || 0) >= 30_000;
}

// Reads an existing upstream task only. This path never submits a generation or
// debits credits. The immutable binding must still match current trusted config.
export async function reconcileImageRun(userId: string, run: RecoverableImageRun) {
  if (!canReconcileImageRun(run)) return;
  const meta = { ...(run.meta as Record<string, Json | undefined>) };
  const binding = meta.upstreamTask;
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return;
  const group = meta.priceGroup;
  if (!['default','gemini-premium','domestic-special'].includes(String(group)) || !isImageModelId(meta.modelVariant)) return;
  if (typeof binding.taskId !== 'string' || !binding.taskId || binding.taskId.length > 256 || typeof binding.upstreamModel !== 'string') return;
  const target = getProxyTargets(group as 'default'|'gemini-premium'|'domestic-special', meta.modelVariant)
    .find(item => item.label === binding.targetLabel && item.routeGroup === binding.routeGroup);
  if (!target) return;
  const poll = getImageTaskPollTarget(target);
  if (poll.baseURL !== binding.pollBaseURL) return;
  const db = createServiceRoleSupabaseClient();
  // Claim this query with compare-and-swap; simultaneous tabs don't poll/import twice.
  const stamp = new Date().toISOString();
  const nextMeta = { ...meta, lastRecoveryAt: Date.now() };
  const { data: claim, error: claimError } = await db.from('canvas_image_runs')
    .update({ meta: nextMeta, updated_at: stamp }).eq('request_id',run.request_id).eq('user_id',userId)
    .eq('status',run.status).eq('updated_at',run.updated_at).select('request_id').maybeSingle();
  if (claimError || !claim) return;
  const update = async (status: string, patch: Record<string, Json | undefined>, result?: Json) => {
    const {error} = await db.from('canvas_image_runs').update({status,meta:{...nextMeta,...patch},
      ...(result ? {result} : {}),updated_at:new Date().toISOString()})
      .eq('request_id',run.request_id).eq('user_id',userId).eq('updated_at',stamp).eq('status',run.status);
    if(error) throw error;
  };
  try {
    const url = `${poll.baseURL.replace(/\/+$/,'')}/images/tasks/${encodeURIComponent(binding.taskId)}`
      + (isDoodleverseGateway(poll.baseURL) ? `?model=${encodeURIComponent(binding.upstreamModel)}` : '');
    const recoverySignal = AbortSignal.timeout(10_000);
    const response = await fetch(url,{headers:{Authorization:`Bearer ${poll.apiKey}`},cache:'no-store',signal:recoverySignal});
    if (!response.ok) return;
    const text = await response.text();
    if (text.length > 32 * 1024 * 1024) return;
    const observation = observeImageTask(JSON.parse(text));
    if (observation.state === 'pending' || observation.state === 'result_pending') {
      await update('outcome_unknown',{phase:observation.state === 'result_pending'?'result_pending':'submitted'});
      return;
    }
    if (observation.state === 'failed') {
      const credits = Number(meta.quotedCredits);
      let billingState = String(meta.billingState || 'needs_review');
      if (Number.isSafeInteger(credits) && credits > 0 && ['charged','charged_pending_review','refund_pending'].includes(billingState)) {
        const refunded = await refundCredits({userId,amount:credits,type:'refund',originalType:'generate_image',
          referenceId:run.request_id,description:'核对上游确认图片任务失败，退回积分',meta:{reconciled:true}});
        billingState = refunded.ok ? 'refunded' : 'refund_pending';
      }
      await update('failed',{billingState,phase:'failed',failureReason:observation.reason});
      await finalizeAiBudget(run.request_id,'completed').catch(()=>{});
      return;
    }
    let imageData: string | undefined;
    for (const candidate of observation.candidates.slice(0,3)) {
      recoverySignal.throwIfAborted();
      try {
        if (candidate.kind === 'url') {
          const asset = await importRemoteCanvasAsset(userId,candidate.value,'image',recoverySignal);
          imageData=asset.url;
        } else {
          const base64=candidate.kind === 'base64'?candidate.value:candidate.value.slice(candidate.value.indexOf(',')+1);
          if (base64.length > 28 * 1024 * 1024) continue;
          imageData=(await saveCanvasAsset(userId,Uint8Array.from(Buffer.from(base64,'base64')))).url;
        }
        if(imageData)break;
      } catch { /* Keep original identity and retry result import on a later query. */ }
    }
    if(!imageData) { await update('outcome_unknown',{phase:'result_pending'}); return; }
    await update('succeeded',{phase:'completed',billingState:'charged'}, {imageData,taskId:binding.taskId,
      model:binding.upstreamModel,modelVariant:meta.modelVariant,requestedResolution:meta.resolution,
      requestedAspectRatio:meta.aspectRatio,billing:{requestId:run.request_id,chargedCredits:meta.quotedCredits,
        priceGroup:meta.priceGroup,priceVersion:meta.priceVersion},recovered:true});
    await finalizeAiBudget(run.request_id,'completed').catch(()=>{});
  } catch { /* Network/parse/storage uncertainty never causes resubmission or refund. */ }
}
