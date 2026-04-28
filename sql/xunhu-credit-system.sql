-- XunhuPay + credit recharge schema for lovart-ky
-- Designed for: fixed credit packages, Alipay only, server-side order processing

create extension if not exists "uuid-ossp";

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.credit_packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price numeric(10,2) not null check (price > 0),
  credits integer not null check (credits > 0),
  bonus_credits integer not null default 0 check (bonus_credits >= 0),
  currency text not null default 'CNY',
  payment_provider text not null default 'xunhu',
  payment_channel text not null default 'alipay',
  enabled boolean not null default true,
  is_recommended boolean not null default false,
  sort_order integer not null default 0,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_packages_enabled_sort_idx
  on public.credit_packages (enabled, sort_order asc, created_at desc);

drop trigger if exists update_credit_packages_updated_at on public.credit_packages;
create trigger update_credit_packages_updated_at
before update on public.credit_packages
for each row
execute function update_updated_at_column();

create table if not exists public.credit_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  user_id text not null,
  package_id uuid references public.credit_packages(id) on delete set null,
  package_code text,
  title text,
  amount numeric(10,2) not null check (amount > 0),
  credits integer not null check (credits > 0),
  bonus_credits integer not null default 0 check (bonus_credits >= 0),
  currency text not null default 'CNY',
  status text not null default 'pending' check (
    status in ('pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded')
  ),
  payment_provider text not null default 'xunhu',
  payment_channel text not null default 'alipay',
  provider_order_id text,
  provider_trade_no text,
  provider_status text,
  notify_verified boolean not null default false,
  paid_at timestamptz,
  credits_granted_at timestamptz,
  refunded_at timestamptz,
  client_ip text,
  user_agent text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_orders_user_id_created_at_idx
  on public.credit_orders (user_id, created_at desc);
create index if not exists credit_orders_status_created_at_idx
  on public.credit_orders (status, created_at desc);
create index if not exists credit_orders_provider_order_id_idx
  on public.credit_orders (provider_order_id);

drop trigger if exists update_credit_orders_updated_at on public.credit_orders;
create trigger update_credit_orders_updated_at
before update on public.credit_orders
for each row
execute function update_updated_at_column();

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'xunhu',
  event_type text,
  order_no text,
  provider_order_id text,
  provider_trade_no text,
  verified boolean not null default false,
  processed boolean not null default false,
  payload jsonb not null,
  processing_result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_events_order_no_idx
  on public.payment_events (order_no, created_at desc);
create index if not exists payment_events_provider_order_id_idx
  on public.payment_events (provider_order_id, created_at desc);

alter table public.credit_transactions
  alter column user_id type text using user_id::text;

alter table public.credit_transactions
  add column if not exists order_no text,
  add column if not exists meta jsonb not null default '{}'::jsonb;

create index if not exists credit_transactions_order_no_idx
  on public.credit_transactions (order_no);

insert into public.credit_packages
  (code, name, price, credits, bonus_credits, currency, payment_provider, payment_channel, enabled, is_recommended, sort_order, description)
values
  ('pack_15',  '入门包',  15.00, 100,   0, 'CNY', 'xunhu', 'alipay', true, false, 10, '适合轻度体验'),
  ('pack_30',  '常用包',  30.00, 200,  10, 'CNY', 'xunhu', 'alipay', true, true,  20, '推荐，大多数用户适合'),
  ('pack_75',  '进阶包',  75.00, 500,  50, 'CNY', 'xunhu', 'alipay', true, false, 30, '适合高频创作'),
  ('pack_150', '专业包', 150.00, 1000, 150, 'CNY', 'xunhu', 'alipay', true, false, 40, '最划算，适合重度使用')
on conflict (code) do update set
  name = excluded.name,
  price = excluded.price,
  credits = excluded.credits,
  bonus_credits = excluded.bonus_credits,
  currency = excluded.currency,
  payment_provider = excluded.payment_provider,
  payment_channel = excluded.payment_channel,
  enabled = excluded.enabled,
  is_recommended = excluded.is_recommended,
  sort_order = excluded.sort_order,
  description = excluded.description,
  updated_at = now();
