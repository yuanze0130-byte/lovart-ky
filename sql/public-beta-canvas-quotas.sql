-- Public beta guardrails for browser-writable canvas data.
-- Media belongs in /media/canvas; PostgreSQL stores only small metadata and URLs.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.projects
  add constraint projects_title_length_check
  check (char_length(title) between 1 and 200) not valid;

alter table public.projects
  add constraint projects_thumbnail_size_check
  check (
    thumbnail is null
    or (
      octet_length(thumbnail) <= 2048
      and thumbnail !~* '^data:'
    )
  ) not valid;

alter table public.canvas_elements
  add constraint canvas_elements_data_size_check
  check (octet_length(element_data::text) <= 131072) not valid;

alter table public.canvas_elements
  add constraint canvas_elements_no_inline_media_check
  check (element_data::text !~* 'data:(image|video)/') not valid;

alter table public.projects validate constraint projects_title_length_check;
alter table public.projects validate constraint projects_thumbnail_size_check;
alter table public.canvas_elements validate constraint canvas_elements_data_size_check;
alter table public.canvas_elements validate constraint canvas_elements_no_inline_media_check;

create or replace function private.enforce_project_write_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_project_count bigint;
begin
  for v_user_id in
    select distinct user_id from new_projects order by user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('doodleverse-projects:' || v_user_id, 0)
    );

    select count(*)
      into v_project_count
      from public.projects
      where user_id = v_user_id;

    if v_project_count > 50 then
      raise exception using
        errcode = '23514',
        message = 'PROJECT_LIMIT_EXCEEDED',
        detail = 'Each user can keep at most 50 projects during the public beta.';
    end if;
  end loop;

  return null;
end;
$$;

create or replace function private.enforce_canvas_write_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_user_id text;
  v_element_count bigint;
  v_element_bytes bigint;
begin
  for v_project_id in
    select distinct project_id from new_elements order by project_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('doodleverse-canvas-project:' || v_project_id::text, 0)
    );

    select count(*), coalesce(sum(pg_catalog.octet_length(element_data::text)), 0)
      into v_element_count, v_element_bytes
      from public.canvas_elements
      where project_id = v_project_id;

    if v_element_count > 2000 then
      raise exception using
        errcode = '23514',
        message = 'PROJECT_ELEMENT_LIMIT_EXCEEDED',
        detail = 'Each project can keep at most 2000 canvas elements.';
    end if;

    if v_element_bytes > 33554432 then
      raise exception using
        errcode = '23514',
        message = 'PROJECT_CANVAS_SIZE_LIMIT_EXCEEDED',
        detail = 'Canvas metadata for one project can use at most 32 MiB.';
    end if;
  end loop;

  for v_user_id in
    select distinct projects.user_id
      from new_elements
      join public.projects on projects.id = new_elements.project_id
      order by projects.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('doodleverse-canvas-user:' || v_user_id, 0)
    );

    select count(*), coalesce(sum(pg_catalog.octet_length(canvas_elements.element_data::text)), 0)
      into v_element_count, v_element_bytes
      from public.canvas_elements
      join public.projects on projects.id = canvas_elements.project_id
      where projects.user_id = v_user_id;

    if v_element_count > 5000 then
      raise exception using
        errcode = '23514',
        message = 'USER_ELEMENT_LIMIT_EXCEEDED',
        detail = 'Each user can keep at most 5000 canvas elements during the public beta.';
    end if;

    if v_element_bytes > 67108864 then
      raise exception using
        errcode = '23514',
        message = 'USER_CANVAS_SIZE_LIMIT_EXCEEDED',
        detail = 'Canvas metadata for one user can use at most 64 MiB.';
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function private.enforce_project_write_limits() from public, anon, authenticated;
revoke all on function private.enforce_canvas_write_limits() from public, anon, authenticated;

drop trigger if exists enforce_project_write_limits on public.projects;
create trigger enforce_project_write_limits
  after insert on public.projects
  referencing new table as new_projects
  for each statement
  execute function private.enforce_project_write_limits();

drop trigger if exists enforce_canvas_insert_limits on public.canvas_elements;
create trigger enforce_canvas_insert_limits
  after insert on public.canvas_elements
  referencing new table as new_elements
  for each statement
  execute function private.enforce_canvas_write_limits();

drop trigger if exists enforce_canvas_update_limits on public.canvas_elements;
create trigger enforce_canvas_update_limits
  after update on public.canvas_elements
  referencing new table as new_elements
  for each statement
  execute function private.enforce_canvas_write_limits();

alter policy "Users can view their own projects" on public.projects to authenticated;
alter policy "Users can insert their own projects" on public.projects to authenticated;
alter policy "Users can update their own projects" on public.projects to authenticated;
alter policy "Users can delete their own projects" on public.projects to authenticated;
alter policy "Users can view their own canvas elements" on public.canvas_elements to authenticated;
alter policy "Users can insert canvas elements to their projects" on public.canvas_elements to authenticated;
alter policy "Users can update their own canvas elements" on public.canvas_elements to authenticated;
alter policy "Users can delete their own canvas elements" on public.canvas_elements to authenticated;

revoke all on table public.projects, public.canvas_elements from anon, authenticated;
grant select, insert, update, delete on table public.projects, public.canvas_elements to authenticated;
grant all on table public.projects, public.canvas_elements to service_role;
