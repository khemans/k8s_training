-- ─────────────────────────────────────────────────────────────────
--  JobMatch AI — Initial Schema
--  Run this in the Supabase SQL Editor (Database → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users (mirrors auth.users but stores app-specific data)
create table if not exists public.users (
  id              uuid primary key default uuid_generate_v4(),
  supabase_id     text unique not null,
  email           text unique not null,
  full_name       text,
  created_at      timestamptz default now(),
  deleted_at      timestamptz
);

-- Resume profiles
create table if not exists public.resume_profiles (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid references public.users(id) on delete cascade,
  label            text default 'Default',
  raw_text         text not null,
  parsed_json      jsonb,
  parse_confidence float,
  storage_path     text,
  is_active        boolean default true,
  created_at       timestamptz default now()
);

-- Seeker preferences
create table if not exists public.seeker_profiles (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid references public.users(id) on delete cascade unique,
  status              text default 'active',
  desired_roles_json  jsonb default '[]',
  location_prefs_json jsonb default '{}',
  seniority_band      text,
  company_prefs_json  jsonb default '{}',
  constraints_json    jsonb default '{}',
  updated_at          timestamptz default now()
);

-- NOTE: RLS is intentionally skipped for local Docker development.
-- The local Postgres container does not have Supabase's auth schema,
-- so auth.uid()-based policies cannot run here.
--
-- Security is enforced at the API layer (FastAPI validates the Supabase
-- JWT and scopes all queries to the authenticated user's ID).
--
-- When you deploy to production using the hosted Supabase Postgres,
-- run the policies in supabase/migrations/001_rls_policies.prod.sql instead.
