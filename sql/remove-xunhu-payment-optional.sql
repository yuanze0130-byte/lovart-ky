-- Optional cleanup after paid recharge has been disabled in the application.
-- Back up historical payment data before running this migration.

drop table if exists public.payment_events;
drop table if exists public.credit_orders;
drop table if exists public.credit_packages;

alter table if exists public.credit_transactions
  drop column if exists order_no;
