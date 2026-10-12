-- Module User : profils applicatifs + journal d'audit de l'administration.
-- L'identité (email, mot de passe, Google...) reste dans Supabase Auth
-- (auth.users) ; `profiles` porte le rôle, le statut et les préférences.
--
-- Ces tables sont uniquement lues/écrites par le backend NestJS (connexion
-- Postgres directe). RLS est activé SANS policy et les droits de l'API Data de
-- Supabase sont retirés : la clé anon ne peut donc ni lire ni modifier ces
-- données via PostgREST.

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         varchar(255) not null,
  full_name     varchar(80),
  username      varchar(30),
  avatar_url    varchar(500),
  country       char(2),
  role          varchar(20) not null default 'trader',
  is_active     boolean not null default true,
  preferences   jsonb not null default '{"language":"fr","theme":"dark"}',
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_role_check
    check (role in ('trader', 'analyst', 'trainer', 'game_master', 'risk_manager', 'admin')),
  constraint profiles_username_key unique (username)
);

create index if not exists idx_profiles_email on public.profiles (email);

create table if not exists public.admin_audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid not null,
  target_id  uuid not null,
  action     varchar(40) not null,
  details    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_actor on public.admin_audit_logs (actor_id);
create index if not exists idx_admin_audit_logs_target on public.admin_audit_logs (target_id);

alter table public.profiles enable row level security;
alter table public.admin_audit_logs enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.admin_audit_logs from anon, authenticated;

-- Premier administrateur : à lancer une fois, avec l'email du compte concerné
-- (le profil existe après sa première connexion à l'application) :
--   update public.profiles set role = 'admin' where email = 'toi@exemple.com';
