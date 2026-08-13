-- Public beta RLS and advisor hardening.

drop policy if exists "Users can view their own access control" on public.user_access_control;
create policy "Users can view their own access control"
  on public.user_access_control for select to authenticated
  using ((select auth.uid())::text = user_id);

drop policy if exists "Users can view their own daily usage" on public.user_daily_usage;
drop policy if exists "Users can insert their own daily usage" on public.user_daily_usage;
drop policy if exists "Users can update their own daily usage" on public.user_daily_usage;
create policy "Users can view their own daily usage"
  on public.user_daily_usage for select to authenticated
  using ((select auth.uid())::text = user_id);

drop policy if exists "Users can view their own credits" on public.user_credits;
create policy "Users can view their own credits"
  on public.user_credits for select to authenticated
  using ((select auth.uid())::text = user_id);

drop policy if exists "Users can view their own credit transactions" on public.credit_transactions;
create policy "Users can view their own credit transactions"
  on public.credit_transactions for select to authenticated
  using ((select auth.uid())::text = user_id);

drop policy if exists "Users can view their own redeem code redemptions" on public.redeem_code_redemptions;
create policy "Users can view their own redeem code redemptions"
  on public.redeem_code_redemptions for select to authenticated
  using ((select auth.uid())::text = user_id);

revoke all on table public.user_access_control from public, anon, authenticated;
revoke all on table public.user_daily_usage from public, anon, authenticated;
revoke all on table public.user_credits from public, anon, authenticated;
revoke all on table public.credit_transactions from public, anon, authenticated;
revoke all on table public.redeem_code_redemptions from public, anon, authenticated;
grant select on table public.user_access_control to authenticated;
grant select on table public.user_daily_usage to authenticated;
grant select on table public.user_credits to authenticated;
grant select on table public.credit_transactions to authenticated;
grant select on table public.redeem_code_redemptions to authenticated;

alter function public.update_updated_at_column() set search_path = '';

create index if not exists credit_orders_package_id_idx
  on public.credit_orders (package_id);
create index if not exists redeem_code_redemptions_batch_id_idx
  on public.redeem_code_redemptions (batch_id);

drop index if exists public.idx_credit_transactions_user_id_created_at;

update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif']::text[]
where id = 'video-references';
