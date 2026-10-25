-- First vertical slice of M1: personal virtual portfolios, gold positions and executions.
create table if not exists public.trading_portfolios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  cash numeric(18,2) not null default 100000.00 check (cash >= 0),
  initial_cash numeric(18,2) not null default 100000.00 check (initial_cash > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trading_positions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.trading_portfolios(id) on delete cascade,
  symbol varchar(16) not null,
  quantity numeric(18,6) not null default 0 check (quantity >= 0),
  average_price numeric(18,4) not null default 0 check (average_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_trading_positions_portfolio_symbol unique (portfolio_id, symbol)
);

create table if not exists public.trade_executions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  portfolio_id uuid not null references public.trading_portfolios(id) on delete cascade,
  request_id uuid not null,
  symbol varchar(16) not null,
  side varchar(4) not null check (side in ('buy', 'sell')),
  quantity numeric(18,6) not null check (quantity > 0),
  price numeric(18,4) not null check (price > 0),
  amount numeric(18,2) not null check (amount > 0),
  executed_at timestamptz not null default now(),
  constraint uq_trade_executions_owner_request unique (owner_id, request_id)
);

create index if not exists idx_trade_executions_portfolio_date
  on public.trade_executions (portfolio_id, executed_at desc);

alter table public.trading_portfolios enable row level security;
alter table public.trading_positions enable row level security;
alter table public.trade_executions enable row level security;
revoke all on public.trading_portfolios, public.trading_positions, public.trade_executions from anon, authenticated;
