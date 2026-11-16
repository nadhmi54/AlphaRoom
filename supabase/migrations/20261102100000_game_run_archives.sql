-- Game Room : passages archivés avant un rollback.
--
-- Le rollback supprime les exécutions et ordres postérieurs à la minute cible.
-- On garde donc une photo (JSON) du passage en cours juste avant, pour que le
-- module IA puisse comparer « avant » et « après » (Replay Analyzer).
-- Table accessible uniquement par le backend, comme les autres tables de salle.

create table if not exists public.game_run_archives (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid        not null references public.game_rooms (id) on delete cascade,
  run        integer     not null check (run >= 1),
  snapshot   jsonb       not null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_game_run_archives_room_run
  on public.game_run_archives (room_id, run);
