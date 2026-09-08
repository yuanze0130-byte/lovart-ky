-- Apply after sql/async-generation-jobs.sql when upgrading an existing database.
alter table public.async_generation_jobs
  drop constraint if exists async_generation_jobs_kind_check;

alter table public.async_generation_jobs
  add constraint async_generation_jobs_kind_check
  check (kind in ('upscale', 'motion_transfer', 'music'));

-- Recreate the settlement function with music accepted and a music-specific refund note.
-- The canonical function body lives in sql/async-generation-jobs.sql; run that file after
-- this migration so existing installations receive the updated function definition.
