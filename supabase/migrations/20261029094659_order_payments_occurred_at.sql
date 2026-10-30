-- When Stripe moved the money, by Stripe's clock (ADR 0036).
--
-- `created_at` is when our webhook or Accept wrote the row. A webhook Stripe had
-- to retry, or an Accept that ran long after the customer paid, writes it later
-- than the payment, and a sale near a month end lands in the wrong month.
-- `occurred_at` is Stripe's own time for the money: the event that reported the
-- payment, refund or dispute, or the balance transaction a capture created.
-- Analytics dates a sale by its charges' `occurred_at`.
--
-- Additive, and applied before the code that writes it is deployed: the
-- default keeps any writer that omits it working.

alter table order_payments add column if not exists occurred_at timestamptz;

update order_payments set occurred_at = created_at where occurred_at is null;

alter table order_payments alter column occurred_at set default now();
alter table order_payments alter column occurred_at set not null;

-- Analytics reads Stripe charges by when they happened.
create index if not exists idx_order_payments_charge_occurred
  on order_payments(occurred_at) where type = 'charge';
