-- Partner commission on the Referral Partner Agreement's Schedule (ADR 0034).
--
-- The agreement pays a flat Commission Pool (S$50) once per Qualifying Sale: a
-- paid order holding at least one customised premium pillow, after its refund
-- period, with no eligible pillow refunded. The partner takes the pool or any
-- lower amount they pick in the Partner Hub (clause 7.2). What they leave is
-- Mpillow's, and Staff decide per partner whether it goes to the referred
-- customer as money off the order.
--
--   partners.commission_pool             Staff-set pool per Qualifying Sale
--   partners.commission_choice           the partner's pick; null = the whole pool
--   partners.commission_choice_next      a pick waiting to start (null = whole pool)
--   partners.commission_choice_next_from the day it starts: the day after the
--                                        next Payout Date. Null = nothing waiting.
--   partners.customer_discount_enabled   Staff toggle: the unused pool comes off a
--                                        referred customer's eligible order
--
--   mp_config_responses.partner_commission  the attributed partner's commission
--                                        fixed at hold, the day the customer pays
--                                        (clause 7.2); the hold's discount is the
--                                        pool less this, so they always add up
--
--   commissions.basis                    'unit' for the rows the old per-unit
--                                        schemes wrote, 'order' for one row per
--                                        Qualifying Sale; one 'order' row per order
--
-- DEPLOY ORDER: apply BEFORE the code that ships with it. That code selects these
-- columns on every referral lookup, hold and capture. Old code never reads them,
-- and the defaults keep every existing partner on the Schedule's S$50 with no
-- customer discount.

alter table partners
  add column if not exists commission_pool numeric(12,2) not null default 50
    check (commission_pool >= 0),
  add column if not exists commission_choice numeric(12,2)
    check (commission_choice is null or commission_choice >= 0),
  add column if not exists commission_choice_next numeric(12,2)
    check (commission_choice_next is null or commission_choice_next >= 0),
  add column if not exists commission_choice_next_from date,
  add column if not exists customer_discount_enabled boolean not null default false;

comment on column partners.commission_pool is
  'Commission Pool per Qualifying Sale (Referral Partner Agreement Schedule). Staff-set; the partner takes it or less.';
comment on column partners.commission_choice is
  'The partner''s chosen commission per Qualifying Sale (clause 7.2). Null = the whole pool; never above it in effect.';
comment on column partners.commission_choice_next is
  'A changed choice waiting for commission_choice_next_from. Null = the whole pool.';
comment on column partners.commission_choice_next_from is
  'The day the waiting choice starts: the day after the next Payout Date. Null = no change waiting.';
comment on column partners.customer_discount_enabled is
  'Staff toggle: the pool the partner leaves comes off a referred customer''s order with a customised premium pillow.';

alter table mp_config_responses
  add column if not exists partner_commission numeric(12,2)
    check (partner_commission is null or partner_commission >= 0);

comment on column mp_config_responses.partner_commission is
  'The attributed partner''s commission if this Result becomes a Qualifying Sale, fixed at hold (clause 7.2). Null = worked out at Accept.';

alter table commissions
  add column if not exists basis text not null default 'unit'
    check (basis in ('unit', 'order'));

-- One commission per Qualifying Sale: makes capture idempotent on redelivery.
create unique index if not exists idx_commissions_one_per_order
  on commissions (order_id)
  where basis = 'order';

comment on column commissions.basis is
  '''order'' = one flat commission per Qualifying Sale (ADR 0034); ''unit'' = a row the retired per-unit schemes wrote.';
