-- Ownership and settlement ledger for asynchronous tools that are not covered
-- by video_generation_jobs. Apply before deploying the matching API routes.
-- Requires sql/video-credit-ledger.sql to have been applied first.

create table if not exists public.async_generation_jobs (
  request_id text primary key,
  user_id text not null,
  kind text not null check (kind in ('upscale', 'motion_transfer')),
  task_id text,
  credit_type text not null,
  charged_credits integer not null check (charged_credits > 0),
  refunded_credits integer not null default 0
    check (refunded_credits >= 0 and refunded_credits <= charged_credits),
  status text not null default 'created'
    check (status in ('created', 'starting', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'outcome_unknown')),
  output_url text,
  failure_reason text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists async_generation_jobs_kind_task_idx
  on public.async_generation_jobs (kind, task_id)
  where task_id is not null;

create index if not exists async_generation_jobs_user_created_idx
  on public.async_generation_jobs (user_id, created_at desc);

create index if not exists async_generation_jobs_owner_task_idx
  on public.async_generation_jobs (user_id, kind, task_id)
  where task_id is not null;

alter table public.async_generation_jobs enable row level security;
revoke all on table public.async_generation_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.async_generation_jobs to service_role;

create or replace function public.settle_async_generation_job_atomic(
  p_request_id text,
  p_user_id text,
  p_kind text,
  p_terminal_status text,
  p_output_url text default null,
  p_failure_reason text default null,
  p_meta jsonb default '{}'::jsonb,
  p_refund boolean default true
)
returns table (
  success boolean,
  error_code text,
  status text,
  refunded_credits integer,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.async_generation_jobs%rowtype;
  v_refund record;
  v_refunded integer := 0;
begin
  if p_request_id is null or p_request_id = ''
    or p_user_id is null or p_user_id = ''
    or p_kind not in ('upscale', 'motion_transfer')
    or p_terminal_status not in ('succeeded', 'failed', 'cancelled', 'outcome_unknown') then
    raise exception 'INVALID_ASYNC_JOB_SETTLEMENT';
  end if;

  select * into v_job
  from public.async_generation_jobs
  where request_id = p_request_id
    and user_id = p_user_id
    and kind = p_kind
  for update;

  if not found then
    return query select false, 'ASYNC_JOB_NOT_FOUND'::text, null::text, 0, false;
    return;
  end if;

  -- outcome_unknown remains recoverable once a client presents the task id
  -- returned by the upstream submission response.
  if v_job.status in ('succeeded', 'failed', 'cancelled') then
    if v_job.status = p_terminal_status then
      return query select true, null::text, v_job.status, v_job.refunded_credits, true;
    else
      return query select false, 'ASYNC_JOB_TERMINAL_CONFLICT'::text, v_job.status, v_job.refunded_credits, true;
    end if;
    return;
  end if;

  if p_terminal_status = 'succeeded' then
    if p_output_url is null or btrim(p_output_url) = '' then
      return query select false, 'ASYNC_JOB_OUTPUT_REQUIRED'::text, v_job.status, v_job.refunded_credits, false;
      return;
    end if;
  elsif p_refund then
    select * into v_refund
    from public.refund_credits_atomic(
      p_user_id,
      p_request_id,
      v_job.credit_type,
      case when v_job.kind = 'upscale'
        then 'Upscale task failed; credits refunded automatically'
        else 'Motion transfer task failed; credits refunded automatically'
      end,
      coalesce(p_meta, '{}'::jsonb) || jsonb_build_object(
        'asyncJobKind', v_job.kind,
        'failureReason', left(coalesce(p_failure_reason, ''), 1000)
      )
    );

    if coalesce(v_refund.success, false) then
      v_refunded := coalesce(v_refund.refunded_credits, 0);
    elsif coalesce(v_refund.error_code, '') <> 'ORIGINAL_DEBIT_NOT_FOUND' then
      return query select false, coalesce(v_refund.error_code, 'ASYNC_JOB_REFUND_FAILED'), v_job.status, v_job.refunded_credits, false;
      return;
    end if;
  end if;

  update public.async_generation_jobs
  set status = p_terminal_status,
      output_url = case when p_terminal_status = 'succeeded' then p_output_url else output_url end,
      failure_reason = case when p_terminal_status = 'succeeded' then null else left(p_failure_reason, 1000) end,
      refunded_credits = case when p_terminal_status = 'succeeded' then refunded_credits else v_refunded end,
      meta = meta || coalesce(p_meta, '{}'::jsonb),
      updated_at = now()
  where request_id = p_request_id;

  return query select true, null::text, p_terminal_status, v_refunded, false;
end;
$$;

revoke all on function public.settle_async_generation_job_atomic(text, text, text, text, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.settle_async_generation_job_atomic(text, text, text, text, text, text, jsonb, boolean)
  to service_role;
