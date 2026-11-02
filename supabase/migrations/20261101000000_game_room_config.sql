-- Module Game Master : configuration complète d'une salle de simulation
-- (source de données marché, modèle de temps, paramètres de salle et de risque)

alter table public.game_rooms
  add column if not exists description text,
  add column if not exists assets jsonb not null default '["XAU/USD"]'::jsonb,
  add column if not exists max_participants int not null default 30
    check (max_participants > 0),
  add column if not exists initial_capital numeric(18,2) not null default 100000.00
    check (initial_capital > 0),
  add column if not exists currency varchar(8) not null default 'USD',
  add column if not exists spread_multiplier numeric(8,4) not null default 1.0
    check (spread_multiplier > 0),
  add column if not exists commission_percent numeric(8,4) not null default 0
    check (commission_percent >= 0),
  add column if not exists leverage numeric(6,2) not null default 1
    check (leverage >= 1),
  add column if not exists allow_short_selling boolean not null default false,
  add column if not exists max_exposure numeric(18,2)
    check (max_exposure is null or max_exposure > 0),
  add column if not exists risk_limit_percent numeric(5,2)
    check (risk_limit_percent is null or (risk_limit_percent > 0 and risk_limit_percent <= 100)),
  add column if not exists source_mode varchar(16) not null default 'scenario'
    check (source_mode in ('scenario', 'synthetic', 'historical', 'csv', 'live')),
  add column if not exists source_config jsonb not null default '{}'::jsonb,
  add column if not exists duration_minutes int not null default 30
    check (duration_minutes > 0),
  add column if not exists timeframe varchar(5) not null default '1m'
    check (timeframe in ('1m', '5m', '15m', '30m', '1h')),
  add column if not exists playback_speed numeric(10,4) not null default 1
    check (playback_speed > 0),
  add column if not exists total_sim_seconds int not null default 1800
    check (total_sim_seconds > 0),
  add column if not exists history_start_at timestamptz,
  add column if not exists history_end_at timestamptz;

create index if not exists idx_game_rooms_master on public.game_rooms(master_id, created_at desc);

-- Vente à découvert : une position courte porte une quantité négative.
alter table public.sim_positions drop constraint if exists sim_positions_quantity_check;

-- Mode live : un seul prix de référence par (salle, seconde de simulation, actif).
-- Toutes les salles lisent cette valeur : les étudiants voient strictement le même prix.
create unique index if not exists uq_game_snapshots_live_price
  on public.game_snapshots(room_id, sim_elapsed_seconds, (state->>'symbol'))
  where (state->>'kind') = 'live_price';
