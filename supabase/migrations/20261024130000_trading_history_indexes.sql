-- Keep filtered personal execution history responsive as accounts grow.
create index if not exists idx_trade_executions_portfolio_symbol_date
  on public.trade_executions (portfolio_id, symbol, executed_at desc);

create index if not exists idx_trade_executions_portfolio_side_date
  on public.trade_executions (portfolio_id, side, executed_at desc);
