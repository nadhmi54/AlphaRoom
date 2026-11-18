-- Module Academy : nouvelles tentatives de quiz.
--
-- Chaque passage d'un quiz par un joueur est enregistré ici : joueur, cours,
-- quiz tiré, score calculé côté serveur, réussite et date. C'est cette table qui
-- matérialise « un cours est validé quand son quiz est réussi » et qui alimente
-- l'exclusion du dernier quiz tenté lors du tirage aléatoire suivant.
--
-- Aucune migration existante n'est modifiée : ajout d'une table uniquement,
-- préfixée academy_ comme le reste du module. Même politique RLS que le projet :
-- activé sans policy et droits PostgREST (anon, authenticated) retirés — seul le
-- backend NestJS (connexion Postgres directe) accède à ces lignes.

create table if not exists public.academy_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  quiz_id uuid not null references public.academy_quizzes(id) on delete cascade,
  score numeric(5,2) not null,
  passed boolean not null default false,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint academy_quiz_attempts_score_check check (score >= 0 and score <= 100)
);

create index if not exists idx_academy_quiz_attempts_user_course
  on public.academy_quiz_attempts (user_id, course_id, created_at desc);

alter table public.academy_quiz_attempts enable row level security;

revoke all on public.academy_quiz_attempts from anon, authenticated;
