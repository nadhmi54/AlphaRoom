-- Module Academy (Formation, Pédagogie & Engagement) : contenu pédagogique.
-- Nouvelles tables uniquement, préfixées academy_ pour éviter toute collision.
-- Contenu de base et contenu avancé/premium ; la restriction d'accès au contenu
-- premium est appliquée côté backend NestJS (le contenu verrouillé reste lisible
-- dans le catalogue avec sa condition de déblocage).
--
-- RLS activé SANS policy et droits PostgREST retirés (anon, authenticated),
-- comme les autres tables du projet : la clé anon ne peut ni lire ni écrire.
-- Seul le backend NestJS (connexion Postgres directe) accède à ces tables.

-- ---------------------------------------------------------------------------
-- Cours, leçons, quiz
-- ---------------------------------------------------------------------------

create table if not exists public.academy_courses (
  id uuid primary key default gen_random_uuid(),
  code varchar(64) not null unique,
  title varchar(160) not null,
  summary text,
  level int not null default 1,
  is_premium boolean not null default false,
  unlock_hint text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_courses_level_check check (level >= 1)
);

create table if not exists public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  code varchar(64),
  title varchar(160) not null,
  kind varchar(16) not null default 'text',
  content text,
  video_url varchar(500),
  duration_minutes int not null default 0,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_lessons_kind_check check (kind in ('text', 'video', 'link')),
  constraint academy_lessons_duration_check check (duration_minutes >= 0),
  constraint academy_lessons_course_position_unique unique (course_id, position)
);

create table if not exists public.academy_quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.academy_courses(id) on delete cascade,
  lesson_id uuid references public.academy_lessons(id) on delete cascade,
  code varchar(64),
  title varchar(160) not null,
  pass_threshold numeric(5,2) not null default 70.00,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_quizzes_scope_check check (course_id is not null or lesson_id is not null),
  constraint academy_quizzes_threshold_check check (pass_threshold > 0 and pass_threshold <= 100)
);

create table if not exists public.academy_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.academy_quizzes(id) on delete cascade,
  position int not null default 0,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_index int not null,
  explanation text,
  created_at timestamptz not null default now(),
  constraint academy_quiz_questions_correct_check check (correct_index >= 0),
  constraint academy_quiz_questions_quiz_position_unique unique (quiz_id, position)
);

-- ---------------------------------------------------------------------------
-- Missions et défis (un défi = une mission rattachée à un scenario_id)
-- ---------------------------------------------------------------------------

create table if not exists public.academy_missions (
  id uuid primary key default gen_random_uuid(),
  code varchar(64) not null unique,
  level int not null default 1,
  title varchar(160) not null,
  description text,
  scenario_id varchar(64),
  criteria jsonb not null default '{}'::jsonb,
  is_placement boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_missions_level_check check (level >= 1),
  constraint academy_missions_window_check check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

-- ---------------------------------------------------------------------------
-- Packs de cours avancés
-- ---------------------------------------------------------------------------

create table if not exists public.academy_packs (
  id uuid primary key default gen_random_uuid(),
  code varchar(64) not null unique,
  title varchar(160) not null,
  description text,
  is_premium boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_pack_items (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.academy_packs(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  constraint academy_pack_items_unique unique (pack_id, course_id)
);

-- ---------------------------------------------------------------------------
-- Badges (niveau, compétence, réussite)
-- ---------------------------------------------------------------------------

create table if not exists public.academy_badges (
  id uuid primary key default gen_random_uuid(),
  code varchar(64) not null unique,
  kind varchar(16) not null,
  title varchar(160) not null,
  description text,
  icon varchar(64),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_badges_kind_check check (kind in ('level', 'skill', 'achievement'))
);

-- ---------------------------------------------------------------------------
-- Règles de déblocage : relient un événement à une récompense.
-- `conditions` JSON porte le couple événement/conditions (score ajusté du risque,
-- minimum d'ordres et de durée, drawdown maximal...). `choice_options` réserve la
-- possibilité d'une récompense « au choix parmi 2-3 cours » (non construite).
-- ---------------------------------------------------------------------------

create table if not exists public.academy_unlock_rules (
  id uuid primary key default gen_random_uuid(),
  code varchar(64) not null unique,
  trigger_event varchar(32) not null,
  mission_id uuid references public.academy_missions(id) on delete set null,
  conditions jsonb not null default '{}'::jsonb,
  reward_type varchar(16) not null,
  reward_course_id uuid references public.academy_courses(id) on delete set null,
  reward_badge_id uuid references public.academy_badges(id) on delete set null,
  xp_amount int not null default 0,
  choice_options jsonb,
  is_active boolean not null default true,
  priority int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_unlock_rules_trigger_check check (
    trigger_event in ('game_finished', 'quiz_passed', 'challenge_won', 'streak_days')
  ),
  constraint academy_unlock_rules_reward_check check (
    reward_type in ('course', 'badge', 'xp', 'course_choice')
  ),
  constraint academy_unlock_rules_xp_check check (xp_amount >= 0)
);

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------

create index if not exists idx_academy_lessons_course on public.academy_lessons (course_id);
create index if not exists idx_academy_quizzes_course on public.academy_quizzes (course_id);
create index if not exists idx_academy_quizzes_lesson on public.academy_quizzes (lesson_id);
create index if not exists idx_academy_quiz_questions_quiz on public.academy_quiz_questions (quiz_id);
create index if not exists idx_academy_missions_scenario on public.academy_missions (scenario_id);
create index if not exists idx_academy_pack_items_pack on public.academy_pack_items (pack_id);
create index if not exists idx_academy_unlock_rules_trigger on public.academy_unlock_rules (trigger_event, is_active);

-- ---------------------------------------------------------------------------
-- RLS : activé sans policy, droits PostgREST retirés
-- ---------------------------------------------------------------------------

alter table public.academy_courses enable row level security;
alter table public.academy_lessons enable row level security;
alter table public.academy_quizzes enable row level security;
alter table public.academy_quiz_questions enable row level security;
alter table public.academy_missions enable row level security;
alter table public.academy_packs enable row level security;
alter table public.academy_pack_items enable row level security;
alter table public.academy_badges enable row level security;
alter table public.academy_unlock_rules enable row level security;

revoke all on public.academy_courses from anon, authenticated;
revoke all on public.academy_lessons from anon, authenticated;
revoke all on public.academy_quizzes from anon, authenticated;
revoke all on public.academy_quiz_questions from anon, authenticated;
revoke all on public.academy_missions from anon, authenticated;
revoke all on public.academy_packs from anon, authenticated;
revoke all on public.academy_pack_items from anon, authenticated;
revoke all on public.academy_badges from anon, authenticated;
revoke all on public.academy_unlock_rules from anon, authenticated;
