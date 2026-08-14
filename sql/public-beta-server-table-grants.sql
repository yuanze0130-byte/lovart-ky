-- Server-only billing, payment and job tables must never be reachable through
-- the public Data API. RLS remains enabled as defense in depth.
revoke all privileges on table public.ai_cost_reservations from public, anon, authenticated;
revoke all privileges on table public.async_generation_jobs from public, anon, authenticated;
revoke all privileges on table public.credit_orders from public, anon, authenticated;
revoke all privileges on table public.credit_packages from public, anon, authenticated;
revoke all privileges on table public.payment_events from public, anon, authenticated;
revoke all privileges on table public.redeem_code_batches from public, anon, authenticated;
revoke all privileges on table public.redeem_codes from public, anon, authenticated;
revoke all privileges on table public.signup_bonus_claims from public, anon, authenticated;
revoke all privileges on table public.video_generation_jobs from public, anon, authenticated;

grant all privileges on table public.ai_cost_reservations to service_role;
grant all privileges on table public.async_generation_jobs to service_role;
grant all privileges on table public.credit_orders to service_role;
grant all privileges on table public.credit_packages to service_role;
grant all privileges on table public.payment_events to service_role;
grant all privileges on table public.redeem_code_batches to service_role;
grant all privileges on table public.redeem_codes to service_role;
grant all privileges on table public.signup_bonus_claims to service_role;
grant all privileges on table public.video_generation_jobs to service_role;
