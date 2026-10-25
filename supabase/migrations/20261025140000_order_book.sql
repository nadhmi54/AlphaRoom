-- Moteur du carnet d'ordres (rôle « moteur du carnet d'ordres » de M1).
--
-- Un ordre envoyé par un utilisateur devient une ligne `orders`. Le carnet est
-- global par actif : tous les comptes s'apparient contre le même carnet, avec
-- interdiction de s'auto-apparier. Chaque exécution produit une ligne
-- `trade_executions` par partie (acheteur et vendeur), ce qui alimente M1
-- (cash), M2 (positions) et M5 (historique).
--
-- `seq` (identity) sert d'ordre de priorité FIFO : `created_at` ne suffit pas
-- car `now()` renvoie l'heure de début de transaction, identique pour deux
-- ordres insérés dans la même transaction.
--
-- `owner_id` NULL désigne la liquidité système (marché simulé) : ces ordres
-- n'ont pas de contrepartie comptable.

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  seq                bigint generated always as identity,
  owner_id           uuid references public.profiles (id) on delete cascade,
  symbol             varchar(16) not null,
  side               varchar(4)  not null,
  type               varchar(6)  not null,
  status             varchar(20) not null default 'open',
  quantity           numeric(18,6) not null,
  filled_quantity    numeric(18,6) not null default 0,
  remaining_quantity numeric(18,6) not null,
  limit_price        numeric(18,4),
  filled_amount      numeric(18,2) not null default 0,
  request_id         uuid,
  created_at         timestamptz not null default clock_timestamp(),
  updated_at         timestamptz not null default clock_timestamp(),
  closed_at          timestamptz,
  constraint orders_side_check check (side in ('buy', 'sell')),
  constraint orders_type_check check (type in ('market', 'limit')),
  constraint orders_status_check
    check (status in ('open', 'partially_filled', 'filled', 'cancelled')),
  constraint orders_quantity_check check (quantity > 0),
  constraint orders_remaining_check
    check (remaining_quantity >= 0 and remaining_quantity <= quantity),
  constraint orders_filled_check check (filled_quantity = quantity - remaining_quantity),
  constraint orders_amount_check check (filled_amount >= 0),
  constraint orders_limit_price_check check (limit_price is null or limit_price > 0),
  -- Un ordre au marché ne peut pas porter de prix limite, et un ordre limite
  -- doit en porter un : c'est ce prix qui fixe sa priorité dans le carnet.
  constraint orders_limit_price_required check (type <> 'limit' or limit_price is not null),
  constraint orders_market_price_absent check (type <> 'market' or limit_price is null)
);

-- Clé d'idempotence de l'ordre (et non de l'exécution : un ordre partiellement
-- exécuté produit plusieurs exécutions, cf. plus bas).
create unique index if not exists uq_orders_owner_request
  on public.orders (owner_id, request_id)
  where request_id is not null;

-- Parcours du carnet : asks du prix le plus bas au plus haut, bids du plus haut
-- au plus bas, à prix égal par ordre d'arrivée (`seq`).
create index if not exists idx_orders_book_asks
  on public.orders (symbol, limit_price, seq)
  where side = 'sell' and status in ('open', 'partially_filled');

create index if not exists idx_orders_book_bids
  on public.orders (symbol, limit_price desc, seq)
  where side = 'buy' and status in ('open', 'partially_filled');

create index if not exists idx_orders_owner_created
  on public.orders (owner_id, created_at desc);

-- 2. Rattachement des exécutions à l'ordre qui les a produites ---------------
alter table public.trade_executions
  add column if not exists order_id uuid;

-- L'ancienne contrainte supposait une exécution = un ordre. Un ordre au marché
-- de 15 oz contre 8 @ 2001 + 7 @ 2002 produit deux exécutions pour un même
-- `request_id`, elles violeraient donc `uq_trade_executions_owner_request`.
-- L'idempotence est désormais portée par `orders (owner_id, request_id)`.
--
-- Sur le projet Cloud, cette unicité a été créée par la synchronisation
-- TypeORM sous forme d'INDEX unique (et non de contrainte de table) : les deux
-- formes doivent être retirées, d'où le `drop index` en plus du
-- `drop constraint`.
alter table public.trade_executions
  drop constraint if exists uq_trade_executions_owner_request;

drop index if exists public.uq_trade_executions_owner_request;

create index if not exists idx_trade_executions_owner_request
  on public.trade_executions (owner_id, request_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trade_executions_order_id_fkey'
      and conrelid = 'public.trade_executions'::regclass
  ) then
    alter table public.trade_executions
      add constraint trade_executions_order_id_fkey
      foreign key (order_id) references public.orders (id) on delete set null;
  end if;
end $$;

create index if not exists idx_trade_executions_order
  on public.trade_executions (order_id)
  where order_id is not null;

-- 3. Dernier prix exécuté par actif -----------------------------------------
-- Sert à valoriser les positions (M1) et à afficher le cours du carnet. En
-- l'absence de ligne, le prix de référence de `market-assets.ts` s'applique.
create table if not exists public.order_book_marks (
  symbol        varchar(16) primary key,
  last_price    numeric(18,4) not null check (last_price > 0),
  last_trade_at timestamptz not null default clock_timestamp(),
  updated_at    timestamptz not null default clock_timestamp()
);

-- 4. Isolation : accès uniquement par le backend (connexion Postgres directe).
-- RLS activé sans policy + droits retirés aux rôles PostgREST, comme pour les
-- tables `trading_*` de 20261024000000_trading_module.sql.
alter table public.orders enable row level security;
alter table public.order_book_marks enable row level security;
revoke all on public.orders, public.order_book_marks from anon, authenticated;
