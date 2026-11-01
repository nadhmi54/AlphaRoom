-- Module 2: Game Room — Salle de simulation pédagogique
-- Tables totalement isolées du module /marche

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  join_code varchar(12) not null unique,
  master_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id varchar(64) not null default 'panic_tuesday',
  status varchar(20) not null default 'waiting',
  sim_elapsed_seconds int not null default 0,
  started_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nickname varchar(80) not null,
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_game_participants_room_user unique (room_id, user_id)
);

create table if not exists public.sim_portfolios (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cash numeric(18,2) not null default 100000.00 check (cash >= 0),
  initial_cash numeric(18,2) not null default 100000.00 check (initial_cash > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_sim_portfolios_room_user unique (room_id, user_id)
);

create table if not exists public.sim_positions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.sim_portfolios(id) on delete cascade,
  symbol varchar(16) not null default 'XAU/USD',
  quantity numeric(18,6) not null default 0 check (quantity >= 0),
  average_price numeric(18,4) not null default 0 check (average_price >= 0),
  stop_loss numeric(18,4),
  take_profit numeric(18,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_sim_positions_portfolio_symbol unique (portfolio_id, symbol)
);

create table if not exists public.sim_orders (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  portfolio_id uuid not null references public.sim_portfolios(id) on delete cascade,
  symbol varchar(16) not null default 'XAU/USD',
  side varchar(10) not null check (side in ('buy', 'sell')),
  type varchar(10) not null check (type in ('market', 'limit')),
  quantity numeric(18,6) not null check (quantity > 0),
  limit_price numeric(18,4),
  status varchar(20) not null default 'open',
  filled_quantity numeric(18,6) not null default 0,
  remaining_quantity numeric(18,6) not null,
  average_price numeric(18,4),
  stop_loss numeric(18,4),
  take_profit numeric(18,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sim_trades (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  portfolio_id uuid not null references public.sim_portfolios(id) on delete cascade,
  order_id uuid,
  symbol varchar(16) not null default 'XAU/USD',
  side varchar(10) not null check (side in ('buy', 'sell')),
  quantity numeric(18,6) not null check (quantity > 0),
  price numeric(18,4) not null check (price > 0),
  amount numeric(18,2) not null check (amount > 0),
  sim_minute numeric(6,2) not null default 0,
  executed_at timestamptz not null default now()
);

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  type varchar(30) not null,
  title varchar(255) not null,
  description text,
  payload jsonb default '{}'::jsonb,
  sim_elapsed_seconds int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.game_snapshots (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  sim_elapsed_seconds int not null,
  state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_game_orders_room on public.sim_orders(room_id, created_at desc);
create index if not exists idx_game_trades_room on public.sim_trades(room_id, executed_at desc);
create index if not exists idx_game_events_room on public.game_events(room_id, sim_elapsed_seconds);
create index if not exists idx_game_snapshots_room on public.game_snapshots(room_id, sim_elapsed_seconds);
