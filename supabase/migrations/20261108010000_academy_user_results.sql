-- Module Academy : progression du joueur, déblocages, badges, XP,
-- résultats de partie ingérés (copie normalisée) et journal d'application
-- des règles (idempotence).
--
-- Même politique RLS que le reste du projet : activé sans policy + droits
-- PostgREST retirés. Un utilisateur ne « voit » que ses propres données parce que
-- le backend NestJS filtre sur l'identifiant du profil authentifié ; le contenu
-- avancé n'est servi que s'il est débloqué.
--
-- academy_game_results.room_id n'a volontairement PAS de clé étrangère vers
-- public.game_rooms : on ne touche pas au schéma des autres modules et
-- l'ingestion doit rester robuste même si une salle est supprimée.

-- ---------------------------------------------------------------------------
-- Progression, XP et déblocages
-- ---------------------------------------------------------------------------

create table if not exists public.academy_user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  status varchar(16) not null default 'not_started',
  score numeric(5,2),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_user_progress_status_check check (status in ('not_started', 'in_progress', 'completed')),
  constraint academy_user_progress_score_check check (score is null or (score >= 0 and score <= 100)),
  constraint academy_user_progress_lesson_unique unique (user_id, lesson_id)
);

create table if not exists public.academy_user_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.academy_courses(id) on delete cascade,
  badge_id uuid references public.academy_badges(id) on delete cascade,
  source varchar(16) not null,
  rule_id uuid references public.academy_unlock_rules(id) on delete set null,
  room_id uuid,
  created_at timestamptz not null default now(),
  constraint academy_user_unlocks_source_check check (source in ('progression', 'reward'))
);

-- Un déblocage de cours et un déblocage de badge sont chacun uniques par joueur ;
-- les index partiels ignorent la colonne nulle de l'autre type.
create unique index if not exists uq_academy_user_unlocks_course
  on public.academy_user_unlocks (user_id, course_id)
  where course_id is not null;
create unique index if not exists uq_academy_user_unlocks_badge
  on public.academy_user_unlocks (user_id, badge_id)
  where badge_id is not null;

create table if not exists public.academy_user_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp int not null default 0,
  level int not null default 1,
  updated_at timestamptz not null default now(),
  constraint academy_user_stats_xp_check check (xp >= 0),
  constraint academy_user_stats_level_check check (level >= 1)
);

create table if not exists public.academy_user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.academy_badges(id) on delete cascade,
  rule_id uuid references public.academy_unlock_rules(id) on delete set null,
  awarded_at timestamptz not null default now(),
  constraint academy_user_badges_unique unique (user_id, badge_id)
);

-- ---------------------------------------------------------------------------
-- Résultats de partie ingérés (copie normalisée, lue en lecture seule depuis
-- la Game Room via l'adaptateur de results/).
-- Une partie a plusieurs participants : unicité sur (room_id, user_id).
-- ---------------------------------------------------------------------------

create table if not exists public.academy_game_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id varchar(64),
  score numeric(10,4),
  return_percent numeric(18,4),
  max_drawdown numeric(10,6),
  sharpe numeric(18,6),
  orders_count int,
  duration_seconds int,
  raw jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint academy_game_results_room_user_unique unique (room_id, user_id),
  constraint academy_game_results_counts_check check (
    (orders_count is null or orders_count >= 0) and
    (duration_seconds is null or duration_seconds >= 0)
  )
);

-- ---------------------------------------------------------------------------
-- Journal d'application des règles : garantit qu'une règle ne s'applique
-- qu'une fois par partie et par joueur. `COALESCE(room_id, uuid nil)` couvre les
-- règles hors partie (quiz, série de jours) où room_id est nul.
-- ---------------------------------------------------------------------------

create table if not exists public.academy_rule_applications (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.academy_unlock_rules(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid,
  result_id uuid references public.academy_game_results(id) on delete cascade,
  reward jsonb not null default '{}'::jsonb,
  xp_awarded int not null default 0,
  created_at timestamptz not null default now(),
  constraint academy_rule_applications_xp_check check (xp_awarded >= 0)
);

create unique index if not exists uq_academy_rule_applications_scope
  on public.academy_rule_applications (
    rule_id,
    user_id,
    coalesce(room_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------

create index if not exists idx_academy_user_progress_user on public.academy_user_progress (user_id, course_id);
create index if not exists idx_academy_user_unlocks_user on public.academy_user_unlocks (user_id);
create index if not exists idx_academy_user_badges_user on public.academy_user_badges (user_id);
create index if not exists idx_academy_game_results_user on public.academy_game_results (user_id);
create index if not exists idx_academy_rule_applications_user on public.academy_rule_applications (user_id);

-- ---------------------------------------------------------------------------
-- RLS : activé sans policy, droits PostgREST retirés
-- ---------------------------------------------------------------------------

alter table public.academy_user_progress enable row level security;
alter table public.academy_user_unlocks enable row level security;
alter table public.academy_user_stats enable row level security;
alter table public.academy_user_badges enable row level security;
alter table public.academy_game_results enable row level security;
alter table public.academy_rule_applications enable row level security;

revoke all on public.academy_user_progress from anon, authenticated;
revoke all on public.academy_user_unlocks from anon, authenticated;
revoke all on public.academy_user_stats from anon, authenticated;
revoke all on public.academy_user_badges from anon, authenticated;
revoke all on public.academy_game_results from anon, authenticated;
revoke all on public.academy_rule_applications from anon, authenticated;
