-- Module IA : bilans pédagogiques individuels, historique des corrections et
-- suivi de la consommation du modèle de langage.
--
-- `session_id` et `participant_id` sont du texte, sans clé étrangère : les
-- séances de simulation appartiennent à un autre module. Toutes les tables
-- sont accessibles uniquement par le backend (connexion Postgres directe),
-- comme les tables `trading_*`.

create table if not exists public.ai_reports (
  id             uuid primary key default gen_random_uuid(),
  session_id     text        not null,
  run            integer     not null check (run >= 1),
  participant_id text        not null,
  alias          varchar(16) not null,
  status         varchar(12) not null default 'draft' check (status in ('draft', 'validated')),
  -- visible par l'étudiant seulement si validé ET publié
  published      boolean     not null default false,
  content        jsonb       not null,
  trace          jsonb       not null,
  created_by     uuid references public.profiles (id) on delete set null,
  validated_by   uuid references public.profiles (id) on delete set null,
  validated_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- un bilan par participant, séance et passage
  unique (session_id, run, participant_id),
  -- un bilan publié est forcément validé
  check (not published or status = 'validated')
);

create index if not exists ai_reports_session_idx on public.ai_reports (session_id, run);
create index if not exists ai_reports_participant_idx on public.ai_reports (participant_id);

create table if not exists public.ai_report_revisions (
  id         bigint generated always as identity primary key,
  report_id  uuid        not null references public.ai_reports (id) on delete cascade,
  editor_id  uuid references public.profiles (id) on delete set null,
  kind       varchar(12) not null check (kind in ('generated', 'edited', 'validated', 'unpublished')),
  before     jsonb,
  after      jsonb       not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_report_revisions_report_idx on public.ai_report_revisions (report_id, created_at);

create table if not exists public.ai_usage (
  id            bigint generated always as identity primary key,
  report_id     uuid references public.ai_reports (id) on delete set null,
  session_id    text,
  run           integer,
  user_id       uuid references public.profiles (id) on delete set null,
  purpose       varchar(20) not null check (purpose in ('evaluation', 'coach', 'market_analysis', 'replay')),
  provider      varchar(20) not null,
  model         varchar(80) not null,
  input_tokens  integer     not null default 0 check (input_tokens >= 0),
  output_tokens integer     not null default 0 check (output_tokens >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists ai_usage_session_idx on public.ai_usage (session_id, created_at);

alter table public.ai_reports enable row level security;
alter table public.ai_report_revisions enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.ai_reports from anon, authenticated;
revoke all on public.ai_report_revisions from anon, authenticated;
revoke all on public.ai_usage from anon, authenticated;
