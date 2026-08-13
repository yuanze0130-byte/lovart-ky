-- Service-role-only daily AI budget reservation and circuit breaker ledger.

create table if not exists public.ai_cost_reservations (
  request_id text primary key,
  user_id text not null,
  scope text not null,
  estimated_cost_micros integer not null check (estimated_cost_micros > 0),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_cost_reservations_status_created_idx
  on public.ai_cost_reservations (status, created_at desc);
create index if not exists ai_cost_reservations_user_created_idx
  on public.ai_cost_reservations (user_id, created_at desc);

alter table public.ai_cost_reservations enable row level security;
revoke all on table public.ai_cost_reservations from public, anon, authenticated;
grant all on table public.ai_cost_reservations to service_role;

create or replace function public.reserve_ai_cost_atomic(
  p_request_id text,
  p_user_id text,
  p_scope text,
  p_estimated_cost_micros integer,
  p_daily_limit_micros integer
)
returns table (
  success boolean,
  error_code text,
  used_cost_micros bigint,
  remaining_cost_micros bigint,
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.ai_cost_reservations%rowtype;
  v_used bigint;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if p_request_id is null or p_request_id = '' or p_user_id is null or p_user_id = ''
    or p_scope is null or p_scope = '' or p_estimated_cost_micros <= 0 or p_daily_limit_micros <= 0 then
    raise exception 'INVALID_AI_COST_RESERVATION';
  end if;

  perform pg_advisory_xact_lock(hashtext('doodleverse-ai-daily-budget'));
  select * into v_existing from public.ai_cost_reservations where request_id = p_request_id;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.scope <> p_scope
      or v_existing.estimated_cost_micros <> p_estimated_cost_micros then
      raise exception 'AI_COST_REFERENCE_CONFLICT';
    end if;
    select coalesce(sum(estimated_cost_micros), 0)::bigint into v_used
      from public.ai_cost_reservations
      where created_at >= v_day_start and status in ('reserved', 'completed');
    return query select true, null::text, v_used,
      greatest(0::bigint, p_daily_limit_micros::bigint - v_used), true;
    return;
  end if;

  select coalesce(sum(estimated_cost_micros), 0)::bigint into v_used
    from public.ai_cost_reservations
    where created_at >= v_day_start and status in ('reserved', 'completed');

  if v_used + p_estimated_cost_micros > p_daily_limit_micros then
    return query select false, 'DAILY_AI_BUDGET_EXCEEDED'::text, v_used,
      greatest(0::bigint, p_daily_limit_micros::bigint - v_used), false;
    return;
  end if;

  insert into public.ai_cost_reservations (request_id, user_id, scope, estimated_cost_micros)
  values (p_request_id, p_user_id, p_scope, p_estimated_cost_micros);
  v_used := v_used + p_estimated_cost_micros;
  return query select true, null::text, v_used,
    greatest(0::bigint, p_daily_limit_micros::bigint - v_used), false;
end;
$$;

create or replace function public.finalize_ai_cost_reservation(
  p_request_id text,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('completed', 'released') then raise exception 'INVALID_AI_COST_STATUS'; end if;
  update public.ai_cost_reservations
    set status = p_status, updated_at = now()
    where request_id = p_request_id and status = 'reserved';
  return found;
end;
$$;

revoke all on function public.reserve_ai_cost_atomic(text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.finalize_ai_cost_reservation(text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_cost_atomic(text, text, text, integer, integer)
  to service_role;
grant execute on function public.finalize_ai_cost_reservation(text, text)
  to service_role;
