-- White-list + daily usage limits
-- Run this in Supabase SQL Editor

create extension if not exists "uuid-ossp";

create table if not exists user_access_control (
  user_id text primary key,
  is_whitelisted boolean not null default false,
  daily_image_limit integer not null default 15,
  daily_video_limit integer not null default 0,
  daily_remove_bg_limit integer not null default 15,
  daily_upscale_limit integer not null default 15,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists user_daily_usage (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null,
  usage_date date not null,
  image_count integer not null default 0,
  video_count integer not null default 0,
  remove_bg_count integer not null default 0,
  upscale_count integer not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, usage_date)
);

alter table user_access_control enable row level security;
alter table user_daily_usage enable row level security;

create policy "Users can view their own access control"
  on user_access_control
  for select
  using (auth.jwt()->>'sub' = user_id);

create policy "Users can view their own daily usage"
  on user_daily_usage
  for select
  using (auth.jwt()->>'sub' = user_id);

create policy "Users can insert their own daily usage"
  on user_daily_usage
  for insert
  with check (auth.jwt()->>'sub' = user_id);

create policy "Users can update their own daily usage"
  on user_daily_usage
  for update
  using (auth.jwt()->>'sub' = user_id)
  with check (auth.jwt()->>'sub' = user_id);

create index if not exists idx_user_daily_usage_user_date
  on user_daily_usage(user_id, usage_date desc);
