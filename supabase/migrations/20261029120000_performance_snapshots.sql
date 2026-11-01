-- Module M3 — performance & risque : historique quotidien des performances.
-- Un seul enregistrement par portefeuille et par jour ; le job quotidien met à
-- jour la ligne du jour (voir backend/src/portefeuille/performance/
-- performance-snapshot.cron.ts).
create table if not exists public.performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.trading_portfolios(id) on delete cascade,
  date date not null,
  total_value numeric(18,2) not null,
  daily_return numeric(18,8),
  volatility_annualized numeric(18,8),
  max_drawdown numeric(18,8),
  var95 numeric(18,8),
  sharpe_ratio numeric(18,8),
  created_at timestamptz not null default now(),
  constraint uq_performance_snapshots_portfolio_date unique (portfolio_id, date),
  constraint performance_snapshots_max_drawdown_check
    check (max_drawdown is null or max_drawdown >= 0)
);

-- Lecture de l'historique d'un portefeuille, du plus récent au plus ancien.
create index if not exists idx_performance_snapshots_portfolio_date
  on public.performance_snapshots (portfolio_id, date desc);

alter table public.performance_snapshots enable row level security;
revoke all on public.performance_snapshots from anon, authenticated;
