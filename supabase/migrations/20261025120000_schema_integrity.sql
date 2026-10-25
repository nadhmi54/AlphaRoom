-- Remise en cohérence du schéma réellement présent sur le projet Supabase Cloud.
--
-- Les tables `profiles`, `admin_audit_logs` et `trading_*` ont été créées par la
-- synchronisation automatique de TypeORM (`synchronize: true` en développement)
-- et non par ces migrations. Les colonnes existent donc, mais les clés
-- étrangères, les contraintes CHECK et les index d'historique déclarés dans
-- `20261012000000_users_module.sql` et `20261024000000_trading_module.sql`
-- n'ont jamais été posés.
--
-- Cette migration est idempotente : sur une base créée proprement par les
-- migrations précédentes, chaque bloc est ignoré. Les index déjà créés par
-- TypeORM sur `profiles.email`, `profiles.username` et
-- `admin_audit_logs.actor_id/target_id` ne sont pas dupliqués : ils remplissent
-- le même rôle que `idx_profiles_email`, `profiles_username_key`,
-- `idx_admin_audit_logs_actor` et `idx_admin_audit_logs_target`.

-- 1. Clés étrangères manquantes ---------------------------------------------
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('profiles', 'id', 'auth.users', 'id', 'profiles_id_fkey', 'cascade'),
      ('trading_portfolios', 'owner_id', 'public.profiles', 'id', 'trading_portfolios_owner_id_fkey', 'cascade'),
      ('trading_positions', 'portfolio_id', 'public.trading_portfolios', 'id', 'trading_positions_portfolio_id_fkey', 'cascade'),
      ('trade_executions', 'owner_id', 'public.profiles', 'id', 'trade_executions_owner_id_fkey', 'cascade'),
      ('trade_executions', 'portfolio_id', 'public.trading_portfolios', 'id', 'trade_executions_portfolio_id_fkey', 'cascade')
    ) as t(tbl, col, ref_tbl, ref_col, cname, on_delete)
  loop
    if not exists (
      select 1
      from pg_constraint
      where conrelid = ('public.' || item.tbl)::regclass
        and contype = 'f'
        and confrelid = item.ref_tbl::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references %s (%I) on delete %s',
        item.tbl,
        item.cname,
        item.col,
        item.ref_tbl,
        item.ref_col,
        item.on_delete
      );
    end if;
  end loop;
end $$;

-- 2. Contraintes CHECK manquantes -------------------------------------------
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('profiles', 'role', 'role in (''trader'', ''analyst'', ''trainer'', ''game_master'', ''risk_manager'', ''admin'')', 'profiles_role_check'),
      ('trading_portfolios', 'cash', 'cash >= 0', 'trading_portfolios_cash_check'),
      ('trading_portfolios', 'initial_cash', 'initial_cash > 0', 'trading_portfolios_initial_cash_check'),
      ('trading_positions', 'quantity', 'quantity >= 0', 'trading_positions_quantity_check'),
      ('trading_positions', 'average_price', 'average_price >= 0', 'trading_positions_average_price_check'),
      ('trade_executions', 'side', 'side in (''buy'', ''sell'')', 'trade_executions_side_check'),
      ('trade_executions', 'quantity', 'quantity > 0', 'trade_executions_quantity_check'),
      ('trade_executions', 'price', 'price > 0', 'trade_executions_price_check'),
      ('trade_executions', 'amount', 'amount > 0', 'trade_executions_amount_check')
    ) as t(tbl, col, expr, cname)
  loop
    if not exists (
      select 1
      from pg_constraint c
      where c.conrelid = ('public.' || item.tbl)::regclass
        and c.contype = 'c'
        and c.conkey = array[
          (
            select a.attnum
            from pg_attribute a
            where a.attrelid = c.conrelid
              and a.attname = item.col
          )
        ]::smallint[]
    ) then
      execute format(
        'alter table public.%I add constraint %I check (%s)',
        item.tbl,
        item.cname,
        item.expr
      );
    end if;
  end loop;
end $$;

-- 3. Index d'historique déclarés par 20261024130000 -------------------------
create index if not exists idx_trade_executions_portfolio_date
  on public.trade_executions (portfolio_id, executed_at desc);

create index if not exists idx_trade_executions_portfolio_symbol_date
  on public.trade_executions (portfolio_id, symbol, executed_at desc);

create index if not exists idx_trade_executions_portfolio_side_date
  on public.trade_executions (portfolio_id, side, executed_at desc);
