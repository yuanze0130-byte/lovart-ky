-- Public beta signup-credit protection. App code must claim bonuses through
-- the service-role-only function below; simply creating an account starts at 0.

alter table public.user_credits alter column credits set default 0;

create table if not exists public.signup_bonus_claims (
  user_id text primary key,
  email_hash text not null unique,
  ip_hash text not null,
  credits integer not null check (credits > 0),
  claimed_at timestamptz not null default now()
);

create index if not exists signup_bonus_claims_ip_claimed_idx
  on public.signup_bonus_claims (ip_hash, claimed_at desc);

alter table public.signup_bonus_claims enable row level security;
revoke all on table public.signup_bonus_claims from public, anon, authenticated;
grant all on table public.signup_bonus_claims to service_role;

create or replace function public.claim_signup_bonus_atomic(
  p_user_id text,
  p_email_hash text,
  p_ip_hash text,
  p_amount integer,
  p_daily_ip_limit integer
)
returns table (
  success boolean,
  error_code text,
  credits_added integer,
  current_credits integer,
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_ip_claims integer;
  v_existing public.signup_bonus_claims%rowtype;
begin
  if p_user_id is null or p_user_id = ''
    or p_email_hash is null or length(p_email_hash) <> 64
    or p_ip_hash is null or length(p_ip_hash) <> 64
    or p_amount <= 0 or p_daily_ip_limit <= 0 then
    raise exception 'INVALID_SIGNUP_BONUS_CLAIM';
  end if;

  perform pg_advisory_xact_lock(hashtext('signup-bonus:' || p_ip_hash));

  select * into v_existing
  from public.signup_bonus_claims
  where user_id = p_user_id;
  if found then
    select credits into v_balance from public.user_credits where user_id = p_user_id;
    return query select true, null::text, 0, coalesce(v_balance, 0), true;
    return;
  end if;

  if exists (select 1 from public.signup_bonus_claims where email_hash = p_email_hash) then
    insert into public.user_credits (user_id, credits) values (p_user_id, 0) on conflict (user_id) do nothing;
    select credits into v_balance from public.user_credits where user_id = p_user_id;
    return query select false, 'EMAIL_ALREADY_CLAIMED'::text, 0, coalesce(v_balance, 0), false;
    return;
  end if;

  if exists (
    select 1 from public.credit_transactions
    where user_id = p_user_id and type = 'signup_bonus'
  ) then
    select credits into v_balance from public.user_credits where user_id = p_user_id;
    return query select true, null::text, 0, coalesce(v_balance, 0), true;
    return;
  end if;

  select count(*)::integer into v_ip_claims
  from public.signup_bonus_claims
  where ip_hash = p_ip_hash and claimed_at >= now() - interval '24 hours';
  if v_ip_claims >= p_daily_ip_limit then
    insert into public.user_credits (user_id, credits) values (p_user_id, 0) on conflict (user_id) do nothing;
    select credits into v_balance from public.user_credits where user_id = p_user_id;
    return query select false, 'IP_DAILY_LIMIT'::text, 0, coalesce(v_balance, 0), false;
    return;
  end if;

  insert into public.user_credits (user_id, credits)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select credits into v_balance
  from public.user_credits
  where user_id = p_user_id
  for update;

  if v_balance > 0 then
    return query select true, null::text, 0, v_balance, true;
    return;
  end if;

  insert into public.signup_bonus_claims (user_id, email_hash, ip_hash, credits)
  values (p_user_id, p_email_hash, p_ip_hash, p_amount);

  v_balance := v_balance + p_amount;
  update public.user_credits set credits = v_balance, updated_at = now() where user_id = p_user_id;

  insert into public.credit_transactions (
    user_id, amount, type, description, reference_id, reference_type, balance_after,
    action, credits, direction, status, meta
  ) values (
    p_user_id, p_amount, 'signup_bonus', '公测新用户赠送积分', 'signup:' || p_user_id,
    'signup_bonus', v_balance, 'signup_bonus', p_amount, 'in', 'completed',
    jsonb_build_object('protected', true)
  );

  return query select true, null::text, p_amount, v_balance, false;
end;
$$;

revoke all on function public.claim_signup_bonus_atomic(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_signup_bonus_atomic(text, text, text, integer, integer)
  to service_role;

-- Credit debits must never create a funded account implicitly.
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
    if v_transaction.amount <> -p_amount then raise exception 'CREDIT_REFERENCE_CONFLICT'; end if;
    return query select true, null::text, coalesce(v_transaction.balance_after, 0), p_amount, v_transaction.id, true;
    return;
  end if;

  insert into public.user_credits (user_id, credits) values (p_user_id, 0) on conflict (user_id) do nothing;
  select credits into v_balance from public.user_credits where user_id = p_user_id for update;

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

revoke all on function public.consume_credits_atomic(text, integer, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.consume_credits_atomic(text, integer, text, text, text, text, jsonb)
  to service_role;
