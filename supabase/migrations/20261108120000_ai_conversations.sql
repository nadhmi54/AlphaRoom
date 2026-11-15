-- Coach IA : discussions multiples par utilisateur, avec historique conservé.
--
-- Une discussion appartient à une personne ; ses messages sont relus par le
-- serveur à chaque question (le coach « se souvient »). Quand une discussion
-- devient longue, les plus anciens messages sont résumés dans `summary`
-- (`summarized_count` = nombre de messages déjà couverts par ce résumé).
-- Tables accessibles uniquement par le backend (connexion Postgres directe),
-- comme les autres tables du module IA.

create table if not exists public.ai_conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles (id) on delete cascade,
  title            varchar(120) not null,
  -- séance dans laquelle la discussion a commencé (texte : la simulation est un autre module)
  session_id       text,
  summary          text,
  summarized_count integer     not null default 0 check (summarized_count >= 0),
  message_count    integer     not null default 0 check (message_count >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table if not exists public.ai_conversation_messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid        not null references public.ai_conversations (id) on delete cascade,
  role            varchar(10) not null check (role in ('user', 'assistant')),
  content         text        not null,
  -- outils consultés, source, chiffres non vérifiés… (affichage seulement)
  meta            jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists ai_conversation_messages_conv_idx on public.ai_conversation_messages (conversation_id, id);

alter table public.ai_conversations enable row level security;
alter table public.ai_conversation_messages enable row level security;
revoke all on public.ai_conversations from anon, authenticated;
revoke all on public.ai_conversation_messages from anon, authenticated;
