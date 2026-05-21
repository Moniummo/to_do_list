-- Lightweight app account + planner sync setup.
-- Run after supabase_app_to_app_setup.sql so friend_codes exists.
-- This is intentionally simple "friends app" identity, not production-grade auth.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_normalized text generated always as (lower(btrim(username))) stored,
  password_hash text not null,
  planner_state jsonb not null default jsonb_build_object(
    'schemaVersion', 2,
    'oneOffTasks', jsonb_build_array(),
    'routineTemplates', jsonb_build_array(),
    'routineOccurrences', jsonb_build_array(),
    'notifiedReminders', jsonb_build_object()
  ),
  planner_state_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_accounts_username_length check (
    char_length(btrim(username)) between 2 and 40
  ),
  constraint app_accounts_password_hash_length check (
    char_length(password_hash) between 32 and 256
  )
);

create unique index if not exists app_accounts_username_normalized_key
on public.app_accounts (username_normalized);

drop trigger if exists app_accounts_set_updated_at on public.app_accounts;
create trigger app_accounts_set_updated_at
before update on public.app_accounts
for each row
execute function public.set_updated_at();

create table if not exists public.app_friend_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.app_accounts(id) on delete cascade,
  nickname text not null,
  friend_code text not null,
  friend_code_normalized text generated always as (lower(btrim(friend_code))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_resolved_at timestamptz,
  constraint app_friend_contacts_nickname_length check (
    char_length(btrim(nickname)) between 1 and 60
  ),
  constraint app_friend_contacts_friend_code_length check (
    char_length(btrim(friend_code)) between 1 and 64
  )
);

create unique index if not exists app_friend_contacts_account_friend_code_key
on public.app_friend_contacts (account_id, friend_code_normalized);

create index if not exists app_friend_contacts_account_updated_idx
on public.app_friend_contacts (account_id, updated_at desc);

drop trigger if exists app_friend_contacts_set_updated_at on public.app_friend_contacts;
create trigger app_friend_contacts_set_updated_at
before update on public.app_friend_contacts
for each row
execute function public.set_updated_at();

create or replace function public.require_app_account(
  p_account_id uuid,
  p_password_hash text
)
returns public.app_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.app_accounts;
begin
  select *
  into v_account
  from public.app_accounts
  where id = p_account_id
    and password_hash = p_password_hash
  limit 1;

  if not found then
    raise exception 'Invalid username or password.';
  end if;

  return v_account;
end;
$$;

create or replace function public.create_app_account(
  p_username text,
  p_password_hash text,
  p_initial_planner_state jsonb default null
)
returns table (
  account_id uuid,
  username text,
  planner_state jsonb,
  planner_state_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := btrim(p_username);
  v_account public.app_accounts;
begin
  if v_username is null or char_length(v_username) not between 2 and 40 then
    raise exception 'Username must be between 2 and 40 characters.';
  end if;

  if p_password_hash is null or char_length(p_password_hash) not between 32 and 256 then
    raise exception 'A password hash is required.';
  end if;

  insert into public.app_accounts (
    username,
    password_hash,
    planner_state,
    planner_state_updated_at
  )
  values (
    v_username,
    p_password_hash,
    coalesce(
      p_initial_planner_state,
      jsonb_build_object(
        'schemaVersion', 2,
        'oneOffTasks', jsonb_build_array(),
        'routineTemplates', jsonb_build_array(),
        'routineOccurrences', jsonb_build_array(),
        'notifiedReminders', jsonb_build_object()
      )
    ),
    now()
  )
  returning * into v_account;

  return query
  select
    v_account.id,
    v_account.username,
    v_account.planner_state,
    v_account.planner_state_updated_at;
end;
$$;

create or replace function public.login_app_account(
  p_username text,
  p_password_hash text
)
returns table (
  account_id uuid,
  username text,
  planner_state jsonb,
  planner_state_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    accounts.id,
    accounts.username,
    accounts.planner_state,
    accounts.planner_state_updated_at
  from public.app_accounts accounts
  where accounts.username_normalized = lower(btrim(p_username))
    and accounts.password_hash = p_password_hash
  limit 1;

  if not found then
    raise exception 'Invalid username or password.';
  end if;
end;
$$;

create or replace function public.load_app_planner_state(
  p_account_id uuid,
  p_password_hash text
)
returns table (
  planner_state jsonb,
  planner_state_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.app_accounts;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);

  return query
  select v_account.planner_state, v_account.planner_state_updated_at;
end;
$$;

create or replace function public.save_app_planner_state(
  p_account_id uuid,
  p_password_hash text,
  p_planner_state jsonb
)
returns table (
  planner_state_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.app_accounts;
  v_updated_at timestamptz := now();
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);

  update public.app_accounts
  set
    planner_state = coalesce(p_planner_state, planner_state),
    planner_state_updated_at = v_updated_at
  where id = v_account.id;

  return query select v_updated_at;
end;
$$;

drop function if exists public.list_app_friend_contacts(uuid, text);
drop function if exists public.upsert_app_friend_contact(uuid, text, text, text);
drop function if exists public.delete_app_friend_contact(uuid, text, uuid);

create or replace function public.list_app_friend_contacts(
  p_account_id uuid,
  p_password_hash text
)
returns table (
  contact_id uuid,
  contact_account_id uuid,
  contact_nickname text,
  contact_friend_code text,
  contact_friend_code_normalized text,
  contact_created_at timestamptz,
  contact_updated_at timestamptz,
  contact_last_resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.app_accounts;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);

  delete from public.app_friend_contacts contacts
  where contacts.account_id = v_account.id
    and not exists (
      select 1
      from public.friend_codes codes
      where codes.code_normalized = contacts.friend_code_normalized
    );

  update public.app_friend_contacts contacts
  set last_resolved_at = now()
  where contacts.account_id = v_account.id;

  return query
  select
    contacts.id,
    contacts.account_id,
    contacts.nickname,
    contacts.friend_code,
    contacts.friend_code_normalized,
    contacts.created_at,
    contacts.updated_at,
    contacts.last_resolved_at
  from public.app_friend_contacts contacts
  where contacts.account_id = v_account.id
  order by contacts.updated_at desc;
end;
$$;

create or replace function public.upsert_app_friend_contact(
  p_account_id uuid,
  p_password_hash text,
  p_friend_code text,
  p_nickname text
)
returns table (
  contact_id uuid,
  contact_account_id uuid,
  contact_nickname text,
  contact_friend_code text,
  contact_friend_code_normalized text,
  contact_created_at timestamptz,
  contact_updated_at timestamptz,
  contact_last_resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.app_accounts;
  v_friend_code text := btrim(p_friend_code);
  v_nickname text := btrim(p_nickname);
  v_contact public.app_friend_contacts;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);

  if v_friend_code is null or char_length(v_friend_code) not between 1 and 64 then
    raise exception 'Friend code must be between 1 and 64 characters.';
  end if;

  if v_nickname is null or char_length(v_nickname) not between 1 and 60 then
    raise exception 'Nickname must be between 1 and 60 characters.';
  end if;

  if not exists (
    select 1
    from public.friend_codes codes
    where codes.code_normalized = lower(v_friend_code)
  ) then
    raise exception 'That friend code does not exist.';
  end if;

  insert into public.app_friend_contacts (
    account_id,
    nickname,
    friend_code,
    last_resolved_at
  )
  values (
    v_account.id,
    v_nickname,
    v_friend_code,
    now()
  )
  on conflict (account_id, friend_code_normalized)
  do update set
    nickname = excluded.nickname,
    friend_code = excluded.friend_code,
    last_resolved_at = now()
  returning * into v_contact;

  return query
  select
    v_contact.id,
    v_contact.account_id,
    v_contact.nickname,
    v_contact.friend_code,
    v_contact.friend_code_normalized,
    v_contact.created_at,
    v_contact.updated_at,
    v_contact.last_resolved_at;
end;
$$;

create or replace function public.delete_app_friend_contact(
  p_account_id uuid,
  p_password_hash text,
  p_contact_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.app_accounts;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);

  delete from public.app_friend_contacts contacts
  where contacts.account_id = v_account.id
    and contacts.id = p_contact_id;
end;
$$;

alter table public.app_accounts enable row level security;
alter table public.app_friend_contacts enable row level security;

grant execute on function public.create_app_account(text, text, jsonb) to anon, authenticated;
grant execute on function public.login_app_account(text, text) to anon, authenticated;
grant execute on function public.load_app_planner_state(uuid, text) to anon, authenticated;
grant execute on function public.save_app_planner_state(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.list_app_friend_contacts(uuid, text) to anon, authenticated;
grant execute on function public.upsert_app_friend_contact(uuid, text, text, text) to anon, authenticated;
grant execute on function public.delete_app_friend_contact(uuid, text, uuid) to anon, authenticated;
