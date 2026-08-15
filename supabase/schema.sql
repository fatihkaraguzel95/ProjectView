-- ProjectView — Supabase schema (single shared workspace, no auth)
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- Data model: projects → sub_projects → positions (monthly demand), plus the
-- capacity list, per-position monthly head-count, workgroup capacity and app
-- settings. `months`/`periods` are stored as JSONB.
--
-- Security: this prototype uses the single-shared-workspace model you chose —
-- the anon (publishable) key gets full read/write via RLS. There is no login,
-- so anyone with the key can edit. Do NOT put private data here.

-- ---------------------------------------------------------------------------
-- Clean slate — these tables are prototype-owned; drop any prior version so
-- the columns below are guaranteed correct. (Safe: no production data here.)
-- ---------------------------------------------------------------------------

drop table if exists public.positions cascade;
drop table if exists public.sub_projects cascade;
drop table if exists public.projects cascade;
drop table if exists public.capacity_positions cascade;
drop table if exists public.headcount cascade;
drop table if exists public.app_capacity cascade;
drop table if exists public.settings cascade;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id          text primary key,
  name        text not null default 'Neues Projekt',
  client      text default '',
  status      text not null default 'planned',   -- 'awarded' | 'planned'
  color       text default '#1e40af',
  collapsed   boolean not null default false,
  sort_index  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.sub_projects (
  id          text primary key,
  project_id  text not null references public.projects (id) on delete cascade,
  name        text not null default 'Neues Teilprojekt',
  source      text default '',
  periods     jsonb not null default '[]'::jsonb, -- e.g. ["2023","2024"]
  sort_index  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists sub_projects_project_id_idx on public.sub_projects (project_id);

create table if not exists public.positions (
  id              text primary key,
  sub_project_id  text not null references public.sub_projects (id) on delete cascade,
  work_group      text default 'Sonstige',
  position        text not null,
  months          jsonb not null default '{}'::jsonb, -- { "2024": [12 numbers], ... }
  sort_index      integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists positions_sub_project_id_idx on public.positions (sub_project_id);

-- editable "Personalkapazität" standard list
create table if not exists public.capacity_positions (
  position    text primary key,
  work_group  text default 'Sonstige',
  sort_index  integer not null default 0
);

-- monthly head-count per position per year: headcount[position][year] = [12]
create table if not exists public.headcount (
  position  text not null,
  year      integer not null,
  months    jsonb not null default '[]'::jsonb,
  primary key (position, year)
);

-- legacy workgroup-level capacity: capacity[workGroup] = people
create table if not exists public.app_capacity (
  work_group  text primary key,
  people      numeric not null default 0
);

-- app settings: settings[key] = value (e.g. hoursPerFTEPerYear)
create table if not exists public.settings (
  key    text primary key,
  value  jsonb
);

-- ---------------------------------------------------------------------------
-- Row Level Security — open to the anon/publishable key (shared workspace)
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'projects','sub_projects','positions','capacity_positions',
    'headcount','app_capacity','settings'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "anon_all" on public.%I;', t);
    execute format(
      'create policy "anon_all" on public.%I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime — broadcast changes to all connected clients
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  -- make sure the realtime publication exists (some projects don't ship it)
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'projects','sub_projects','positions','capacity_positions',
    'headcount','app_capacity','settings'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when others then null; -- already added / no rights: never abort the script
    end;
  end loop;
exception when others then null; -- realtime is optional; keep the schema even if it fails
end $$;
