-- Historique des prix en temps réel (module « Marché en direct »).
--
-- Une ligne par actif et par seconde, écrite uniquement par le backend
-- (service MarketDataService). `source` indique si le prix vient du flux réel
-- (Binance, Finnhub) ou de la simulation de repli quand le marché est fermé
-- ou que le flux est indisponible. Les lignes de plus de 24 h sont purgées par
-- le backend : la table reste petite.

create table if not exists public.market_ticks (
  id      bigint generated always as identity primary key,
  symbol  varchar(16)    not null,
  price   numeric(18, 6) not null check (price > 0),
  source  varchar(10)    not null check (source in ('live', 'simulated')),
  ts      timestamptz    not null default clock_timestamp()
);

create index if not exists market_ticks_symbol_ts_idx
  on public.market_ticks (symbol, ts desc);

-- Isolation : accès uniquement par le backend (connexion Postgres directe),
-- comme les tables `trading_*` et `order_book_marks`.
alter table public.market_ticks enable row level security;
revoke all on public.market_ticks from anon, authenticated;
