-- 积分流水表（可在 Supabase SQL Editor 执行）
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount integer not null,
  type text not null,
  description text,
  reference_id text,
  created_at timestamptz not null default now()
);

create index if not exists credit_transactions_user_id_idx
  on public.credit_transactions (user_id, created_at desc);
