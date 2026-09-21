-- ==========================================================
-- LANSIA SMART RSUD WONOSARI
-- Jalankan SEKALI seluruh file ini di Supabase SQL Editor.
-- ==========================================================

create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  location text not null,
  open_at timestamptz not null,
  close_at timestamptz not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint events_time_check check (close_at > open_at)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  address text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (event_id, participant_id)
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists participants_active_name_unique
on public.participants (lower(regexp_replace(trim(full_name), '\\s+', ' ', 'g')))
where is_active = true;

create unique index if not exists events_one_active_unique
on public.events ((is_active))
where is_active = true;

alter table public.events enable row level security;
alter table public.participants enable row level security;
alter table public.attendance enable row level security;
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "public read active events" on public.events;
create policy "public read active events"
on public.events for select
to anon, authenticated
using (is_active = true);

drop policy if exists "admins manage events" on public.events;
create policy "admins manage events"
on public.events for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage participants" on public.participants;
create policy "admins manage participants"
on public.participants for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Publik hanya dapat mencari satu peserta berdasarkan NAMA LENGKAP yang tepat.
-- Alamat tidak dibuka sebagai daftar publik.
drop function if exists public.get_public_participant_by_name(text, uuid);
drop function if exists public.get_public_participant_by_name(text);
create or replace function public.get_public_participant_by_name(
  p_full_name text,
  p_event_id uuid
)
returns table (
  id uuid,
  full_name text,
  address text,
  already_present boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.address,
    exists (
      select 1
      from public.attendance a
      where a.event_id = p_event_id
        and a.participant_id = p.id
    ) as already_present
  from public.participants p
  where p.is_active = true
    and lower(regexp_replace(trim(p.full_name), '\\s+', ' ', 'g'))
      = lower(regexp_replace(trim(p_full_name), '\\s+', ' ', 'g'))
  limit 1;
$$;

revoke all on function public.get_public_participant_by_name(text, uuid) from public;
grant execute on function public.get_public_participant_by_name(text, uuid) to anon, authenticated;

-- Publik hanya boleh melakukan konfirmasi ketika kegiatan aktif dan masih terbuka.
drop policy if exists "public confirm while open" on public.attendance;
create policy "public confirm while open"
on public.attendance for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.events e
    join public.participants p on p.id = participant_id and p.is_active = true
    where e.id = event_id
      and e.is_active = true
      and now() >= e.open_at
      and now() < e.close_at
  )
);

drop policy if exists "admins manage attendance" on public.attendance;
create policy "admins manage attendance"
on public.attendance for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Hanya admin yang bisa membaca data attendance mentah.
drop policy if exists "no public raw attendance read" on public.attendance;

revoke all on table public.events from anon, authenticated;
revoke all on table public.participants from anon, authenticated;
revoke all on table public.attendance from anon, authenticated;
revoke all on table public.admin_users from anon, authenticated;

grant select on public.events to anon, authenticated;
grant insert on public.attendance to anon, authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.participants to authenticated;
grant select, insert, update, delete on public.attendance to authenticated;
grant select on public.admin_users to authenticated;

-- Pastikan hanya satu kegiatan aktif. Pengaturan di dashboard akan menonaktifkan kegiatan aktif lama lebih dulu.
