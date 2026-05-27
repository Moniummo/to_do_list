-- Installed app-to-app popup routing. Run before supabase_account_sync_setup.sql.
-- Friends are found by username. Display names are mutable account presentation only.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists public.app_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_normalized text generated always as (lower(btrim(username))) stored,
  display_name text,
  password_hash text not null,
  planner_state jsonb not null default jsonb_build_object(
    'schemaVersion', 3, 'oneOffTasks', jsonb_build_array(), 'timeBlocks', jsonb_build_array(),
    'routineTemplates', jsonb_build_array(), 'routineOccurrences', jsonb_build_array(),
    'notifiedReminders', jsonb_build_object()
  ),
  planner_state_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.app_accounts add column if not exists display_name text;
create unique index if not exists app_accounts_username_normalized_key
on public.app_accounts (username_normalized);
alter table public.app_accounts drop constraint if exists app_accounts_username_length;
alter table public.app_accounts add constraint app_accounts_username_length
check (char_length(btrim(username)) between 2 and 40);
alter table public.app_accounts drop constraint if exists app_accounts_password_hash_length;
alter table public.app_accounts add constraint app_accounts_password_hash_length
check (char_length(password_hash) between 32 and 256);

create table if not exists public.app_emergency_password_grants (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.app_accounts(id) on delete cascade,
  friend_account_id uuid not null references public.app_accounts(id) on delete cascade,
  emergency_password text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists app_emergency_password_owner_friend_key
on public.app_emergency_password_grants (owner_account_id, friend_account_id);

create table if not exists public.app_devices (
  device_key text primary key,
  account_id uuid references public.app_accounts(id) on delete cascade,
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  constraint app_devices_device_key_length check (char_length(btrim(device_key)) between 3 and 128)
);
alter table public.app_devices add column if not exists account_id uuid
references public.app_accounts(id) on delete cascade;
drop trigger if exists app_devices_set_updated_at on public.app_devices;
create trigger app_devices_set_updated_at before update on public.app_devices
for each row execute function public.set_updated_at();

create table if not exists public.app_popup_events (
  id uuid primary key default gen_random_uuid(),
  recipient_account_id uuid references public.app_accounts(id) on delete cascade,
  recipient_device_key text references public.app_devices(device_key) on delete set null,
  sender_account_id uuid references public.app_accounts(id) on delete set null,
  sender_device_key text references public.app_devices(device_key) on delete set null,
  sender_name text,
  sender_display_name text,
  source text not null default 'desktop',
  kind text not null default 'general_popup',
  priority text not null default 'normal',
  title text,
  message text not null,
  related_task_id text,
  related_task_title text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  reviewed_at timestamptz,
  constraint app_popup_events_kind_check check (
    kind in ('general_popup', 'task_popup', 'emergency_popup', 'task_submission', 'task_edit_suggestion')
  ),
  constraint app_popup_events_priority_check check (priority in ('normal', 'emergency')),
  constraint app_popup_events_status_check check (
    status in ('pending', 'delivered', 'dismissed', 'opened', 'accepted', 'denied')
  ),
  constraint app_popup_events_message_length check (char_length(btrim(message)) between 1 and 4000)
);
alter table public.app_popup_events add column if not exists recipient_account_id uuid
references public.app_accounts(id) on delete cascade;
alter table public.app_popup_events add column if not exists recipient_device_key text
references public.app_devices(device_key) on delete set null;
alter table public.app_popup_events add column if not exists sender_account_id uuid
references public.app_accounts(id) on delete set null;
alter table public.app_popup_events add column if not exists sender_display_name text;
alter table public.app_popup_events alter column recipient_device_key drop not null;
create index if not exists app_popup_events_recipient_account_status_created_idx
on public.app_popup_events (recipient_account_id, status, priority, created_at desc);

create table if not exists public.shared_tasks (
  task_id text not null,
  owner_account_id uuid references public.app_accounts(id) on delete cascade,
  kind text not null default 'task',
  source_id text not null,
  title text not null,
  status text not null default 'pending',
  due_at timestamptz,
  reminder_at timestamptz,
  completed_at timestamptz,
  scheduled_date date,
  priority text,
  rule_summary text,
  visibility text not null default 'public',
  updated_at timestamptz not null default now()
);
alter table public.shared_tasks add column if not exists owner_account_id uuid
references public.app_accounts(id) on delete cascade;
alter table public.shared_tasks add column if not exists visibility text not null default 'public';
alter table public.shared_tasks add column if not exists completed_at timestamptz;
alter table public.shared_tasks drop constraint if exists shared_tasks_status_check;
alter table public.shared_tasks add constraint shared_tasks_status_check
check (status in ('pending', 'completed'));
alter table public.shared_tasks drop constraint if exists shared_tasks_visibility_check;
alter table public.shared_tasks add constraint shared_tasks_visibility_check
check (visibility in ('public', 'private'));
-- Older installs used task_id as the primary key, but task IDs are local to each
-- account. App-to-app sharing needs the same local task ID to be valid for
-- different owners.
alter table public.shared_tasks replica identity full;
delete from public.shared_tasks
where owner_account_id is null
   or task_id is null;
delete from public.shared_tasks tasks
using (
  select
    ctid,
    row_number() over (
      partition by owner_account_id, task_id
      order by updated_at desc nulls last, completed_at desc nulls last
    ) as duplicate_rank
  from public.shared_tasks
) duplicates
where tasks.ctid = duplicates.ctid
  and duplicates.duplicate_rank > 1;
alter table public.shared_tasks alter column owner_account_id set not null;
alter table public.shared_tasks alter column task_id set not null;
alter table public.shared_tasks drop constraint if exists shared_tasks_pkey;
drop index if exists shared_tasks_owner_task_id_key;
alter table public.shared_tasks add constraint shared_tasks_pkey
primary key (owner_account_id, task_id);
alter table public.shared_tasks replica identity full;
create unique index if not exists shared_tasks_owner_task_id_key
on public.shared_tasks (owner_account_id, task_id);
create index if not exists shared_tasks_owner_status_due_idx
on public.shared_tasks (owner_account_id, status, due_at);

create or replace function public.require_app_account(p_account_id uuid, p_password_hash text)
returns public.app_accounts language plpgsql security definer set search_path = public as $$
declare v_account public.app_accounts;
begin
  select * into v_account from public.app_accounts
  where id = p_account_id and password_hash = p_password_hash limit 1;
  if not found then raise exception 'Invalid username or password.'; end if;
  return v_account;
end;
$$;

create or replace function public.register_app_device(
  p_account_id uuid, p_password_hash text, p_device_key text, p_device_name text default null
)
returns public.app_devices language plpgsql security definer set search_path = public as $$
declare v_account public.app_accounts; v_device public.app_devices;
begin
  v_account := public.require_app_account(p_account_id, p_password_hash);
  insert into public.app_devices (device_key, account_id, device_name, last_seen_at)
  values (btrim(p_device_key), v_account.id, nullif(btrim(p_device_name), ''), now())
  on conflict (device_key) do update set account_id = excluded.account_id,
    device_name = excluded.device_name, last_seen_at = excluded.last_seen_at
  returning * into v_device;
  return v_device;
end;
$$;

-- Drop popup senders before replacing the old recipient router they may call.
drop function if exists public.send_app_popup_event(
  uuid, text, text, text, text, text, text, text, text, text, text, jsonb, text
);
drop function if exists public.send_app_popup_event(
  uuid, text, text, text, uuid, text, text, text, text, text, text, text, jsonb, text
);
-- The old friend-code router used this same text signature with input name p_code.
-- PostgreSQL cannot rename input parameters through CREATE OR REPLACE.
drop function if exists public.resolve_app_popup_recipient(text);
create or replace function public.resolve_app_popup_recipient(p_username text)
returns public.app_accounts language plpgsql security definer set search_path = public as $$
declare v_recipient public.app_accounts;
begin
  select * into v_recipient from public.app_accounts
  where username_normalized = lower(btrim(p_username)) limit 1;
  if v_recipient.id is null then raise exception 'No account is using that username.'; end if;
  return v_recipient;
end;
$$;

create or replace function public.send_app_popup_event(
  p_account_id uuid, p_password_hash text, p_device_key text, p_recipient_username text,
  p_recipient_account_id uuid, p_sender_name text, p_kind text, p_priority text,
  p_title text, p_message text, p_related_task_id text default null,
  p_related_task_title text default null, p_payload jsonb default '{}'::jsonb,
  p_emergency_password text default null
)
returns public.app_popup_events language plpgsql security definer set search_path = public as $$
declare v_sender public.app_accounts; v_recipient public.app_accounts; v_event public.app_popup_events;
begin
  v_sender := public.require_app_account(p_account_id, p_password_hash);
  if p_recipient_account_id is not null then
    select * into v_recipient from public.app_accounts where id = p_recipient_account_id limit 1;
  else
    v_recipient := public.resolve_app_popup_recipient(p_recipient_username);
  end if;
  if v_recipient.id is null then raise exception 'No recipient account exists.'; end if;
  if p_kind = 'emergency_popup' or p_priority = 'emergency' then
    if not exists (select 1 from public.app_emergency_password_grants
      where owner_account_id = v_recipient.id and friend_account_id = v_sender.id
        and emergency_password = p_emergency_password) then
      raise exception 'Emergency password did not match this recipient grant.';
    end if;
  end if;
  insert into public.app_popup_events (
    recipient_account_id, sender_account_id, sender_device_key, sender_name,
    sender_display_name, source, kind, priority, title, message, related_task_id,
    related_task_title, payload
  ) values (
    v_recipient.id, v_sender.id, p_device_key, nullif(btrim(p_sender_name), ''),
    nullif(btrim(v_sender.display_name), ''), 'desktop', p_kind, p_priority,
    nullif(btrim(p_title), ''), btrim(p_message), nullif(btrim(p_related_task_id), ''),
    nullif(btrim(p_related_task_title), ''), coalesce(p_payload, '{}'::jsonb)
  ) returning * into v_event;
  return v_event;
end;
$$;

alter table public.app_devices enable row level security;
alter table public.app_popup_events enable row level security;
alter table public.shared_tasks enable row level security;
drop policy if exists "Public can view app devices" on public.app_devices;
create policy "Public can view app devices" on public.app_devices
for select to anon, authenticated using (true);
drop policy if exists "Public can view popup events" on public.app_popup_events;
create policy "Public can view popup events" on public.app_popup_events
for select to anon, authenticated using (true);
drop policy if exists "Public can update popup events" on public.app_popup_events;
create policy "Public can update popup events" on public.app_popup_events
for update to anon, authenticated using (true) with check (true);
drop policy if exists "Public can view shared tasks" on public.shared_tasks;
create policy "Public can view shared tasks" on public.shared_tasks
for select to anon, authenticated using (true);
drop policy if exists "Public can write shared tasks" on public.shared_tasks;
create policy "Public can write shared tasks" on public.shared_tasks
for all to anon, authenticated using (true) with check (true);
grant execute on function public.register_app_device(uuid, text, text, text) to anon, authenticated;
grant execute on function public.resolve_app_popup_recipient(text) to anon, authenticated;
grant execute on function public.send_app_popup_event(
  uuid, text, text, text, uuid, text, text, text, text, text, text, text, jsonb, text
) to anon, authenticated;

-- Recipient routing now uses usernames. Refresh RPC metadata for the public API.
notify pgrst, 'reload schema';
