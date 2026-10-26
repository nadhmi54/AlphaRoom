alter table public.trading_positions
  add column if not exists stop_loss numeric(18,4),
  add column if not exists take_profit numeric(18,4);

alter table public.trading_positions
  drop constraint if exists trading_positions_stop_loss_check,
  add constraint trading_positions_stop_loss_check
    check (stop_loss is null or stop_loss > 0),
  drop constraint if exists trading_positions_take_profit_check,
  add constraint trading_positions_take_profit_check
    check (take_profit is null or take_profit > 0);
