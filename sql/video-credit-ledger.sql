-- Atomic credit ledger and auditable video generation jobs.
-- Apply through the Supabase migration workflow before deploying the matching app code.

create extension if not exists pgcrypto;

alter table public.user_credits alter column credits set default 20;

alter table public.credit_transactions
  add column if not exists action text not null default 'manual_adjust',
  add column if not exists credits integer not null default 0,
  add column if not exists direction text not null default 'in',
  add column if not exists status text not null default 'completed',
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists reference_type text,
  add column if not exists balance_after integer;

create unique index if not exists credit_transactions_idempotency_idx
  on public.credit_transactions (user_id, reference_id, type)
  where reference_id is not null;

create table if not exists public.video_generation_jobs (
  request_id text primary key,
  user_id text not null,
  task_id text unique,
  model_id text not null,
  upstream_model text not null,
  price_group text not null,
  price_version text not null,
  duration integer not null,
  resolution text,
  quality_mode text not null,
  generate_audio boolean not null default false,
  estimated_comfly_cost_micros integer not null check (estimated_comfly_cost_micros > 0),
  charged_credits integer not null check (charged_credits > 0),
  refunded_credits integer not null default 0 check (refunded_credits >= 0),
  status text not null default 'created',
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_generation_jobs_user_created_idx
  on public.video_generation_jobs (user_id, created_at desc);
create index if not exists video_generation_jobs_task_user_idx
  on public.video_generation_jobs (task_id, user_id);

alter table public.video_generation_jobs enable row level security;
revoke all on table public.video_generation_jobs from anon, authenticated, public;
grant all on table public.video_generation_jobs to service_role;

create or replace function public.consume_credits_atomic(
  p_user_id text,
  p_amount integer,
  p_type text,
  p_description text,
  p_reference_id text,
  p_reference_type text default null,
  p_meta jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  error_code text,
  current_credits integer,
  required_credits integer,
  transaction_id uuid,
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_transaction public.credit_transactions%rowtype;
  v_transaction_id uuid;
begin
  if p_user_id is null or p_user_id = '' or p_amount <= 0 or p_reference_id is null or p_reference_id = '' then
    raise exception 'INVALID_CREDIT_OPERATION';
  end if;

  select * into v_transaction
  from public.credit_transactions
  where user_id = p_user_id and reference_id = p_reference_id and type = p_type
  limit 1;

  if found then
    if v_transaction.amount <> -p_amount then
      raise exception 'CREDIT_REFERENCE_CONFLICT';
    end if;
    return query select true, null::text, coalesce(v_transaction.balance_after, 0), p_amount, v_transaction.id, true;
    return;
  end if;

  insert into public.user_credits (user_id, credits)
  values (p_user_id, 20)
  on conflict (user_id) do nothing;

  select credits into v_balance
  from public.user_credits
  where user_id = p_user_id
  for update;

  if v_balance < p_amount then
    return query select false, 'INSUFFICIENT_CREDITS', v_balance, p_amount, null::uuid, false;
    return;
  end if;

  v_balance := v_balance - p_amount;
  update public.user_credits set credits = v_balance, updated_at = now() where user_id = p_user_id;

  insert into public.credit_transactions (
    user_id, amount, type, description, reference_id, reference_type, balance_after,
    action, credits, direction, status, meta
  ) values (
    p_user_id, -p_amount, p_type, p_description, p_reference_id, p_reference_type, v_balance,
    p_type, p_amount, 'out', 'completed', coalesce(p_meta, '{}'::jsonb)
  ) returning id into v_transaction_id;

  return query select true, null::text, v_balance, p_amount, v_transaction_id, false;
end;
$$;

create or replace function public.refund_credits_atomic(
  p_user_id text,
  p_reference_id text,
  p_original_type text,
  p_description text,
  p_meta jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  error_code text,
  current_credits integer,
  refunded_credits integer,
  transaction_id uuid,
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_debit public.credit_transactions%rowtype;
  v_refund public.credit_transactions%rowtype;
  v_amount integer;
  v_transaction_id uuid;
begin
  if p_user_id is null or p_user_id = '' or p_reference_id is null or p_reference_id = '' then
    raise exception 'INVALID_CREDIT_REFUND';
  end if;

  select * into v_debit
  from public.credit_transactions
  where user_id = p_user_id and reference_id = p_reference_id and type = p_original_type and amount < 0
  limit 1;
  if not found then
    return query select false, 'ORIGINAL_DEBIT_NOT_FOUND', 0, 0, null::uuid, false;
    return;
  end if;

  select * into v_refund
  from public.credit_transactions
  where user_id = p_user_id and reference_id = p_reference_id and type = 'refund'
  limit 1;
  if found then
    return query select true, null::text, coalesce(v_refund.balance_after, 0), v_refund.amount, v_refund.id, true;
    return;
  end if;

  v_amount := -v_debit.amount;
  select credits into v_balance
  from public.user_credits
  where user_id = p_user_id
  for update;
  if not found then
    raise exception 'CREDIT_ACCOUNT_NOT_FOUND';
  end if;

  v_balance := v_balance + v_amount;
  update public.user_credits set credits = v_balance, updated_at = now() where user_id = p_user_id;

  insert into public.credit_transactions (
    user_id, amount, type, description, reference_id, reference_type, balance_after,
    action, credits, direction, status, meta
  ) values (
    p_user_id, v_amount, 'refund', p_description, p_reference_id, v_debit.reference_type, v_balance,
    'refund', v_amount, 'in', 'completed', coalesce(p_meta, '{}'::jsonb)
  ) returning id into v_transaction_id;

  return query select true, null::text, v_balance, v_amount, v_transaction_id, false;
end;
$$;

create or replace function public.settle_video_generation_job_atomic(
  p_request_id text,
  p_user_id text,
  p_terminal_status text,
  p_task_id text default null,
  p_failure_reason text default null,
  p_meta jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  error_code text,
  job_status text,
  refunded_credits integer,
  task_id text,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.video_generation_jobs%rowtype;
  v_refund record;
  v_refunded integer := 0;
  v_task_id text;
begin
  if p_request_id is null or p_request_id = ''
    or p_user_id is null or p_user_id = ''
    or p_terminal_status not in ('succeeded', 'failed', 'cancelled', 'outcome_unknown') then
    raise exception 'INVALID_VIDEO_JOB_SETTLEMENT';
  end if;

  select * into v_job
  from public.video_generation_jobs
  where request_id = p_request_id
    and user_id = p_user_id
  for update;

  if not found then
    return query select false, 'VIDEO_JOB_NOT_FOUND'::text, null::text, 0, null::text, false;
    return;
  end if;

  if p_task_id is not null and p_task_id <> ''
    and v_job.task_id is not null and v_job.task_id <> p_task_id then
    return query select false, 'VIDEO_TASK_ID_CONFLICT'::text, v_job.status, v_job.refunded_credits, v_job.task_id, false;
    return;
  end if;
  v_task_id := coalesce(v_job.task_id, nullif(p_task_id, ''));

  -- outcome_unknown is deliberately recoverable: a later owned status check can
  -- move it to a definitive terminal state once an upstream task id is known.
  if v_job.status in ('succeeded', 'failed', 'cancelled', 'refunded') then
    if v_job.status = p_terminal_status
      or (v_job.status = 'refunded' and p_terminal_status in ('failed', 'cancelled')) then
      return query select true, null::text, v_job.status, v_job.refunded_credits, v_task_id, true;
    end if;
    return query select false, 'VIDEO_JOB_TERMINAL_CONFLICT'::text, v_job.status, v_job.refunded_credits, v_task_id, true;
    return;
  end if;

  if p_terminal_status in ('failed', 'cancelled') then
    select * into v_refund
    from public.refund_credits_atomic(
      p_user_id,
      p_request_id,
      'generate_video',
      'Video task failed; credits refunded automatically',
      coalesce(p_meta, '{}'::jsonb) || jsonb_build_object(
        'taskId', v_task_id,
        'providerStatus', p_terminal_status,
        'failureReason', left(coalesce(p_failure_reason, ''), 1000)
      )
    );

    if not coalesce(v_refund.success, false) then
      return query select false, coalesce(v_refund.error_code, 'VIDEO_JOB_REFUND_FAILED'), v_job.status, v_job.refunded_credits, v_task_id, false;
      return;
    end if;
    v_refunded := coalesce(v_refund.refunded_credits, 0);
  end if;

  update public.video_generation_jobs
  set task_id = v_task_id,
      status = p_terminal_status,
      refunded_credits = case
        when p_terminal_status in ('failed', 'cancelled') then v_refunded
        else refunded_credits
      end,
      failure_reason = case
        when p_terminal_status = 'succeeded' then null
        else left(p_failure_reason, 1000)
      end,
      updated_at = now()
  where request_id = p_request_id
    and user_id = p_user_id;

  return query select true, null::text, p_terminal_status, v_refunded, v_task_id, false;
end;
$$;

revoke all on function public.consume_credits_atomic(text, integer, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.refund_credits_atomic(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.settle_video_generation_job_atomic(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.consume_credits_atomic(text, integer, text, text, text, text, jsonb) to service_role;
grant execute on function public.refund_credits_atomic(text, text, text, text, jsonb) to service_role;
grant execute on function public.settle_video_generation_job_atomic(text, text, text, text, text, jsonb) to service_role;

revoke all on function public.redeem_credit_code(text, text, inet, text) from public, anon, authenticated;
grant execute on function public.redeem_credit_code(text, text, inet, text) to service_role;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- The browser may read its own balance, but every mutation must pass through
-- a service-role API/RPC.  RLS ownership checks alone do not prevent a user
-- from setting their own balance to an arbitrary value.
drop policy if exists "Users can insert their own credits" on public.user_credits;
drop policy if exists "Users can update their own credits" on public.user_credits;
revoke all privileges on table public.user_credits from public, anon, authenticated;
grant select on table public.user_credits to authenticated;
