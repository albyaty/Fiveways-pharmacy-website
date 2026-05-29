-- ============================================================================
-- Five Ways Pharmacy -- Supabase database setup
-- Run this ONCE in your Supabase project: Dashboard -> SQL Editor -> New query
-- -> paste this -> Run. Safe to re-run (uses "if not exists" / "or replace").
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ORDERS (payment history)
-- Written by the server (the Stripe webhook, using the service role key).
-- Customers can READ only their own orders, matched by their account email.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  email                 text not null,
  amount_pence          integer not null,
  currency              text not null default 'gbp',
  summary               text,
  payment_type          text,
  patient_name          text,
  stripe_payment_intent text unique
);

alter table public.orders enable row level security;

-- A signed-in user can read orders whose email matches their account email.
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
  on public.orders for select
  to authenticated
  using ((auth.jwt() ->> 'email') = email);

-- No client insert/update/delete policies -> only the service role (server)
-- can write orders. That's intentional.

-- ---------------------------------------------------------------------------
-- ADDRESSES (saved delivery addresses)
-- Fully customer-managed: each user can read/insert/delete only their own.
-- ---------------------------------------------------------------------------
create table if not exists public.addresses (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text,
  line1       text not null,
  line2       text,
  city        text not null,
  postcode    text not null
);

alter table public.addresses enable row level security;

drop policy if exists "addresses_select_own" on public.addresses;
create policy "addresses_select_own"
  on public.addresses for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "addresses_insert_own" on public.addresses;
create policy "addresses_insert_own"
  on public.addresses for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "addresses_delete_own" on public.addresses;
create policy "addresses_delete_own"
  on public.addresses for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- PROFILES (editable personal details: name, phone, date of birth)
-- One row per user, keyed to their auth id. Each user manages only their own.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  phone         text,
  date_of_birth date,
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- On signup, copy the name + phone (captured on the register form and stored
-- in the new user's metadata) into a profiles row automatically. Runs as the
-- definer so it can insert regardless of the (not-yet-confirmed) session.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
