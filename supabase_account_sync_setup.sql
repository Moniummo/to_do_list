-- Lightweight account sync. Run after supabase_app_to_app_setup.sql.
-- This is intentionally friend-app identity rather than production Supabase Auth.

create extension if not exists pgcrypto;

alter table public.app_accounts add column if not exists display_name text;

alter table public.app_accounts drop constraint if exists app_accounts_display_name_length;
alter table public.app_accounts add constraint app_accounts_display_name_length check (
  display_name is null or char_length(btrim(display_name)) between 1 and 64
);

drop trigger if exists app_accounts_set_updated_at on public.app_accounts;
create trigger app_accounts_set_updated_at before update on public.app_accounts
for each row execute function public.set_updated_at();

create table if not exists public.app_friend_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.app_accounts(id) on delete cascade,
  friend_account_id uuid references public.app_accounts(id) on delete cascade,
  nickname text not null,
  task_permission text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_resolved_at timestamptz,
  constraint app_friend_contacts_nickname_length check (char_length(btrim(nickname)) between 1 and 60)
);
alter table public.app_friend_contacts add column if not exists friend_account_id uuid
references public.app_accounts(id) on delete cascade;
alter table public.app_friend_contacts add column if not exists task_permission text not null default 'none';
alter table public.app_friend_contacts drop constraint if exists app_friend_contacts_task_permission_check;
alter table public.app_friend_contacts add constraint app_friend_contacts_task_permission_check
check (task_permission in ('none', 'public', 'all'));
alter table public.app_friend_contacts drop column if exists friend_device_key;
-- Remove former route-cache columns. Contacts route by friend_account_id after username lookup.
alter table public.app_friend_contacts drop column if exists friend_code cascade;
drop index if exists public.app_friend_contacts_account_friend_code_key;
drop index if exists public.app_friend_contacts_account_friend_device_key;
create unique index if not exists app_friend_contacts_account_friend_account_key
on public.app_friend_contacts (account_id, friend_account_id) where friend_account_id is not null;
create unique index if not exists app_friend_contacts_account_nickname_key
on public.app_friend_contacts (account_id, lower(btrim(nickname)));
drop trigger if exists app_friend_contacts_set_updated_at on public.app_friend_contacts;
create trigger app_friend_contacts_set_updated_at before update on public.app_friend_contacts
for each row execute function public.set_updated_at();

alter table public.app_emergency_password_grants drop constraint if exists app_emergency_password_value_length;
alter table public.app_emergency_password_grants add constraint app_emergency_password_value_length
check (char_length(btrim(emergency_password)) between 1 and 128);
drop trigger if exists app_emergency_password_grants_set_updated_at on public.app_emergency_password_grants;
create trigger app_emergency_password_grants_set_updated_at
before update on public.app_emergency_password_grants for each row execute function public.set_updated_at();

drop function if exists public.create_app_account(text, text, jsonb);
drop function if exists public.login_app_account(text, text);
create or replace function public.create_app_account(
  p_username text, p_password_hash text, p_initial_planner_state jsonb default null
)
returns table (
  account_id uuid, username text, display_name text, planner_state jsonb,
  planner_state_updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare v_username text := btrim(p_username); v_account public.app_accounts;
begin
  if v_username is null or char_length(v_username) not between 2 and 40 then
    raise exception 'Username must be between 2 and 40 characters.';
  end if;
  if p_password_hash is null or char_length(p_password_hash) not between 32 and 256 then
    raise exception 'A password hash is required.';
  end if;
  insert into public.app_accounts (username, password_hash, planner_state, planner_state_updated_at)
  values (
    v_username, p_password_hash,
    coalesce(p_initial_planner_state, jsonb_build_object(
      'schemaVersion', 3, 'oneOffTasks', jsonb_build_array(), 'timeBlocks', jsonb_build_array(),
      'routineTemplates', jsonb_build_array(), 'routineOccurrences', jsonb_build_array(),
      'notifiedReminders', jsonb_build_object()
    )), now()
  ) returning * into v_account;
  return query select v_account.id, v_account.username, v_account.display_name,
    v_account.planner_state, v_account.planner_state_updated_at;
end;
$$;

create or replace function public.login_app_account(p_username text, p_password_hash text)
returns table (
  account_id uuid, username text, display_name text, planner_state jsonb,
  planner_state_updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  return query select id, app_accounts.username, app_accounts.display_name,
    app_accounts.planner_state, app_accounts.planner_state_updated_at
  from public.app_accounts where username_normalized = lower(btrim(p_username))
    and password_hash = p_password_hash limit 1;
  if not found then raise exception 'Invalid username or password.'; end if;
end;
$$;

create or replace function public.load_app_planner_state(p_account_id uuid, p_password_hash text)
returns table (planner_state jsonb, planner_state_updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_account public.app_accounts;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);
  return query select v_account.planner_state, v_account.planner_state_updated_at;
end;
$$;

create or replace function public.save_app_planner_state(
  p_account_id uuid, p_password_hash text, p_planner_state jsonb
)
returns table (planner_state_updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_account public.app_accounts; v_updated_at timestamptz := now();
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);
  update public.app_accounts set planner_state = coalesce(p_planner_state, planner_state),
    planner_state_updated_at = v_updated_at where id = v_account.id;
  return query select v_updated_at;
end;
$$;

create or replace function public.set_app_display_name(
  p_account_id uuid, p_password_hash text, p_display_name text
)
returns table (
  account_id uuid, username text, display_name text, planner_state jsonb,
  planner_state_updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare v_account public.app_accounts;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);
  update public.app_accounts set display_name = nullif(btrim(p_display_name), '')
  where id = v_account.id returning * into v_account;
  return query select v_account.id, v_account.username, v_account.display_name,
    v_account.planner_state, v_account.planner_state_updated_at;
end;
$$;

drop function if exists public.list_app_friend_contacts(uuid, text);
drop function if exists public.upsert_app_friend_contact(uuid, text, text, text, text);
drop function if exists public.upsert_app_friend_contact(uuid, text, text, text);
drop function if exists public.delete_app_friend_contact(uuid, text, uuid);
create or replace function public.list_app_friend_contacts(p_account_id uuid, p_password_hash text)
returns table (
  contact_id uuid, contact_account_id uuid, contact_friend_account_id uuid,
  contact_friend_username text, contact_friend_display_name text, contact_nickname text,
  contact_task_permission text,
  contact_created_at timestamptz, contact_updated_at timestamptz,
  contact_last_resolved_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare v_account public.app_accounts;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);
  delete from public.app_friend_contacts where account_id = v_account.id and friend_account_id is null;
  return query select contacts.id, contacts.account_id, friends.id, friends.username,
    friends.display_name, contacts.nickname, contacts.task_permission,
    contacts.created_at, contacts.updated_at,
    contacts.last_resolved_at
  from public.app_friend_contacts contacts join public.app_accounts friends
    on friends.id = contacts.friend_account_id
  where contacts.account_id = v_account.id order by contacts.updated_at desc;
end;
$$;

create or replace function public.upsert_app_friend_contact(
  p_account_id uuid, p_password_hash text, p_friend_username text, p_nickname text,
  p_task_permission text default 'none'
)
returns table (
  contact_id uuid, contact_account_id uuid, contact_friend_account_id uuid,
  contact_friend_username text, contact_friend_display_name text, contact_nickname text,
  contact_task_permission text,
  contact_created_at timestamptz, contact_updated_at timestamptz,
  contact_last_resolved_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_account public.app_accounts;
  v_friend public.app_accounts;
  v_contact public.app_friend_contacts;
  v_nickname text;
  v_task_permission text := coalesce(nullif(btrim(p_task_permission), ''), 'none');
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);
  select * into v_friend from public.app_accounts
  where username_normalized = lower(btrim(p_friend_username)) limit 1;
  if v_friend.id is null then raise exception 'That username does not exist.'; end if;
  if v_friend.id = v_account.id then raise exception 'Save another account as a friend.'; end if;
  v_nickname := coalesce(nullif(btrim(p_nickname), ''), v_friend.username);
  if char_length(v_nickname) > 60 then
    raise exception 'Friend nickname must be 60 characters or fewer.';
  end if;
  if v_task_permission not in ('none', 'public', 'all') then
    raise exception 'Task access must be none, public, or all.';
  end if;
  insert into public.app_friend_contacts (
    account_id, friend_account_id, nickname, task_permission, last_resolved_at
  )
  values (v_account.id, v_friend.id, v_nickname, v_task_permission, now())
  on conflict (account_id, friend_account_id) where friend_account_id is not null
  do update set nickname = excluded.nickname,
    task_permission = excluded.task_permission,
    last_resolved_at = now()
  returning * into v_contact;
  return query select v_contact.id, v_contact.account_id, v_friend.id, v_friend.username,
    v_friend.display_name, v_contact.nickname, v_contact.task_permission,
    v_contact.created_at, v_contact.updated_at,
    v_contact.last_resolved_at;
end;
$$;

create or replace function public.delete_app_friend_contact(
  p_account_id uuid, p_password_hash text, p_contact_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_account public.app_accounts;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);
  delete from public.app_friend_contacts where account_id = v_account.id and id = p_contact_id;
end;
$$;

drop function if exists public.list_shared_tasks_for_viewer(uuid, text, uuid);
create or replace function public.list_shared_tasks_for_viewer(
  p_viewer_account_id uuid, p_password_hash text, p_owner_account_id uuid
)
returns table (
  owner_account_id uuid,
  task_id text,
  kind text,
  source_id text,
  title text,
  status text,
  due_at timestamptz,
  reminder_at timestamptz,
  scheduled_date date,
  priority text,
  rule_summary text,
  visibility text,
  updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_viewer public.app_accounts;
  v_permission text := 'none';
begin
  v_viewer := public.require_app_account(p_viewer_account_id, p_password_hash);

  if v_viewer.id = p_owner_account_id then
    v_permission := 'all';
  else
    select contacts.task_permission into v_permission
    from public.app_friend_contacts contacts
    where contacts.account_id = p_owner_account_id
      and contacts.friend_account_id = v_viewer.id
    limit 1;

    v_permission := coalesce(v_permission, 'none');
  end if;

  return query
  select
    tasks.owner_account_id::uuid,
    tasks.task_id::text,
    tasks.kind::text,
    tasks.source_id::text,
    tasks.title::text,
    tasks.status::text,
    tasks.due_at::timestamptz,
    tasks.reminder_at::timestamptz,
    tasks.scheduled_date::date,
    tasks.priority::text,
    tasks.rule_summary::text,
    tasks.visibility::text,
    tasks.updated_at::timestamptz
  from public.shared_tasks tasks
  where tasks.owner_account_id = p_owner_account_id
    and tasks.status = 'pending'
    and (
      v_permission = 'all'
      or (v_permission = 'public' and tasks.visibility = 'public')
    )
  order by tasks.due_at asc nulls last, tasks.updated_at desc
  limit 100;
end;
$$;

-- Passwords are intentionally readable to the friend receiving the grant.
drop function if exists public.list_app_emergency_passwords(uuid, text);
drop function if exists public.list_app_emergency_passwords_for_me(uuid, text);
drop function if exists public.upsert_app_emergency_password(uuid, text, uuid, text);
create or replace function public.list_app_emergency_passwords(p_account_id uuid, p_password_hash text)
returns table (
  grant_id uuid, grant_owner_account_id uuid, grant_friend_account_id uuid,
  grant_friend_username text, grant_friend_display_name text, grant_friend_nickname text,
  grant_password text, grant_created_at timestamptz, grant_updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare v_account public.app_accounts;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);
  return query select grants.id, grants.owner_account_id, grants.friend_account_id,
    friends.username, friends.display_name, contacts.nickname, grants.emergency_password,
    grants.created_at, grants.updated_at
  from public.app_emergency_password_grants grants join public.app_accounts friends
    on friends.id = grants.friend_account_id
  left join public.app_friend_contacts contacts on contacts.account_id = grants.owner_account_id
    and contacts.friend_account_id = grants.friend_account_id
  where grants.owner_account_id = v_account.id order by grants.updated_at desc;
end;
$$;

create or replace function public.list_app_emergency_passwords_for_me(p_account_id uuid, p_password_hash text)
returns table (
  grant_id uuid, grant_owner_account_id uuid, grant_friend_account_id uuid,
  grant_friend_username text, grant_friend_display_name text, grant_friend_nickname text,
  grant_password text, grant_created_at timestamptz, grant_updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare v_account public.app_accounts;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);
  return query select grants.id, grants.owner_account_id, grants.friend_account_id,
    owners.username, owners.display_name, contacts.nickname, grants.emergency_password,
    grants.created_at, grants.updated_at
  from public.app_emergency_password_grants grants join public.app_accounts owners
    on owners.id = grants.owner_account_id
  left join public.app_friend_contacts contacts on contacts.account_id = v_account.id
    and contacts.friend_account_id = grants.owner_account_id
  where grants.friend_account_id = v_account.id order by grants.updated_at desc;
end;
$$;

create or replace function public.upsert_app_emergency_password(
  p_account_id uuid, p_password_hash text, p_friend_account_id uuid, p_password text
)
returns table (
  grant_id uuid, grant_owner_account_id uuid, grant_friend_account_id uuid,
  grant_friend_username text, grant_friend_display_name text, grant_friend_nickname text,
  grant_password text, grant_created_at timestamptz, grant_updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare v_account public.app_accounts; v_grant public.app_emergency_password_grants;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);
  if not exists (select 1 from public.app_friend_contacts
    where account_id = v_account.id and friend_account_id = p_friend_account_id) then
    raise exception 'Save that friend before granting an emergency password.';
  end if;
  insert into public.app_emergency_password_grants (owner_account_id, friend_account_id, emergency_password)
  values (v_account.id, p_friend_account_id, btrim(p_password))
  on conflict (owner_account_id, friend_account_id)
  do update set emergency_password = excluded.emergency_password returning * into v_grant;
  return query select grants.*
  from public.list_app_emergency_passwords(p_account_id, p_password_hash) grants
  where grants.grant_id = v_grant.id;
end;
$$;

create or replace function public.delete_app_emergency_password(
  p_account_id uuid, p_password_hash text, p_grant_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_account public.app_accounts;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);
  delete from public.app_emergency_password_grants where id = p_grant_id and owner_account_id = v_account.id;
end;
$$;

alter table public.app_accounts enable row level security;
alter table public.app_friend_contacts enable row level security;
alter table public.app_emergency_password_grants enable row level security;
grant execute on function public.create_app_account(text, text, jsonb) to anon, authenticated;
grant execute on function public.login_app_account(text, text) to anon, authenticated;
grant execute on function public.load_app_planner_state(uuid, text) to anon, authenticated;
grant execute on function public.save_app_planner_state(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.set_app_display_name(uuid, text, text) to anon, authenticated;
grant execute on function public.list_app_friend_contacts(uuid, text) to anon, authenticated;
grant execute on function public.upsert_app_friend_contact(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.delete_app_friend_contact(uuid, text, uuid) to anon, authenticated;
grant execute on function public.list_shared_tasks_for_viewer(uuid, text, uuid) to anon, authenticated;
grant execute on function public.list_app_emergency_passwords(uuid, text) to anon, authenticated;
grant execute on function public.list_app_emergency_passwords_for_me(uuid, text) to anon, authenticated;
grant execute on function public.upsert_app_emergency_password(uuid, text, uuid, text) to anon, authenticated;
grant execute on function public.delete_app_emergency_password(uuid, text, uuid) to anon, authenticated;

-- The RPC argument names changed with the username/display-name friend model.
-- Refresh the API schema cache so PostgREST sees the new functions immediately.
notify pgrst, 'reload schema';
