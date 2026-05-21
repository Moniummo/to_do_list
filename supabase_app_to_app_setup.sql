-- App-to-app popup network setup.
-- Run this in Supabase SQL Editor after the existing website/task tables are working.
-- This keeps the website-to-you flow intact while adding installed-app-to-installed-app routing.

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

create table if not exists public.app_devices (
  device_key text primary key,
  device_name text,
  current_friend_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  constraint app_devices_device_key_length check (
    char_length(btrim(device_key)) between 3 and 128
  ),
  constraint app_devices_current_friend_code_length check (
    current_friend_code is null
    or char_length(btrim(current_friend_code)) between 1 and 64
  )
);

drop trigger if exists app_devices_set_updated_at on public.app_devices;
create trigger app_devices_set_updated_at
before update on public.app_devices
for each row
execute function public.set_updated_at();

create table if not exists public.friend_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  code_normalized text generated always as (lower(btrim(code))) stored,
  device_key text not null references public.app_devices(device_key) on delete cascade,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  constraint friend_codes_code_length check (
    char_length(btrim(code)) between 1 and 64
  )
);

create unique index if not exists friend_codes_code_normalized_key
on public.friend_codes (code_normalized);

create index if not exists friend_codes_device_key_idx
on public.friend_codes (device_key, created_at desc);

create table if not exists public.app_popup_events (
  id uuid primary key default gen_random_uuid(),
  recipient_device_key text not null references public.app_devices(device_key) on delete cascade,
  sender_device_key text references public.app_devices(device_key) on delete set null,
  sender_name text,
  sender_friend_code text,
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
    kind in (
      'general_popup',
      'task_popup',
      'emergency_popup',
      'task_submission',
      'task_edit_suggestion'
    )
  ),
  constraint app_popup_events_priority_check check (
    priority in ('normal', 'emergency')
  ),
  constraint app_popup_events_status_check check (
    status in ('pending', 'delivered', 'dismissed', 'opened', 'accepted', 'denied')
  ),
  constraint app_popup_events_message_length check (
    char_length(btrim(message)) between 1 and 4000
  )
);

create index if not exists app_popup_events_recipient_status_created_idx
on public.app_popup_events (recipient_device_key, status, priority, created_at desc);

create index if not exists app_popup_events_sender_created_idx
on public.app_popup_events (sender_device_key, created_at desc);

create or replace function public.register_friend_code(
  p_device_key text,
  p_code text
)
returns public.friend_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := btrim(p_code);
  v_code_normalized text := lower(btrim(p_code));
  v_existing public.friend_codes;
  v_result public.friend_codes;
begin
  if p_device_key is null or char_length(btrim(p_device_key)) not between 3 and 128 then
    raise exception 'A valid device key is required.';
  end if;

  if v_code is null or char_length(v_code) not between 1 and 64 then
    raise exception 'Friend code must be between 1 and 64 characters.';
  end if;

  select *
  into v_existing
  from public.friend_codes
  where code_normalized = v_code_normalized
  limit 1;

  if found then
    if v_existing.device_key <> p_device_key then
      raise exception 'Friend code "%" is already in use.', v_code;
    end if;

    update public.app_devices
    set current_friend_code = v_existing.code
    where device_key = p_device_key;

    return v_existing;
  end if;

  insert into public.friend_codes (code, device_key)
  values (v_code, p_device_key)
  returning * into v_result;

  update public.app_devices
  set current_friend_code = v_result.code
  where device_key = p_device_key;

  return v_result;
end;
$$;

grant execute on function public.register_friend_code(text, text) to anon, authenticated;

alter table public.app_devices enable row level security;
alter table public.friend_codes enable row level security;
alter table public.app_popup_events enable row level security;

drop policy if exists "Public can view app devices" on public.app_devices;
create policy "Public can view app devices"
on public.app_devices
for select
to anon, authenticated
using (true);

drop policy if exists "Public can register app devices" on public.app_devices;
create policy "Public can register app devices"
on public.app_devices
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public can update app devices" on public.app_devices;
create policy "Public can update app devices"
on public.app_devices
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public can view friend codes" on public.friend_codes;
create policy "Public can view friend codes"
on public.friend_codes
for select
to anon, authenticated
using (true);

drop policy if exists "Public can create friend codes" on public.friend_codes;
create policy "Public can create friend codes"
on public.friend_codes
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public can view popup events" on public.app_popup_events;
create policy "Public can view popup events"
on public.app_popup_events
for select
to anon, authenticated
using (true);

drop policy if exists "Public can create popup events" on public.app_popup_events;
create policy "Public can create popup events"
on public.app_popup_events
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public can update popup events" on public.app_popup_events;
create policy "Public can update popup events"
on public.app_popup_events
for update
to anon, authenticated
using (true)
with check (true);
