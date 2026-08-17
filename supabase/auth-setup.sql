-- ProjectView — Login/Auth setup
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL → New query).
-- It is safe to run on an existing database: it does NOT touch your data,
-- it only (1) tightens Row Level Security to logged-in users and (2) creates
-- the admin login account.
--
-- Admin credentials created here:
--   E-Mail:   admin@projectview.local
--   Passwort: Tappenbeck2006!

-- ---------------------------------------------------------------------------
-- 1) Lock the tables down to authenticated (logged-in) users only.
--    After this the anon/publishable key alone can no longer read or write.
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
    execute format('drop policy if exists "authenticated_all" on public.%I;', t);
    execute format(
      'create policy "authenticated_all" on public.%I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Create the admin user (email confirmed, ready to log in immediately).
--    Idempotent: if the account already exists this block does nothing.
-- ---------------------------------------------------------------------------

do $$
declare
  new_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users where email = 'admin@projectview.local') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      new_id,
      'authenticated', 'authenticated',
      'admin@projectview.local',
      crypt('Tappenbeck2006!', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      '', '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      new_id::text,
      new_id,
      jsonb_build_object('sub', new_id::text, 'email', 'admin@projectview.local', 'email_verified', true),
      'email',
      now(), now(), now()
    );
  end if;
end $$;
