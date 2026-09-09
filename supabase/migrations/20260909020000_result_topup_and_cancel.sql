-- Results → Orders bridge.
--
-- 1. Persist the top-up PaymentIntent. When the final total outgrows the hold we
--    charge a SECOND intent via Checkout. Nothing recorded it, so a customer who
--    paid and closed the tab before the redirect left money charged with no Order
--    and no way to find it. The webhook now stamps these columns, and accept
--    settles with the stored intent instead of charging again.
--    Amount is deliberately NOT stored — accept reads amount_received from Stripe,
--    so there is one source of truth for how much was actually taken.
--
-- 2. Add 'cancelled' to the Result status check. Staff had no way to void a
--    Result: the SLA cron only expires 'held', so an 'assigned' Result whose
--    customer goes quiet was unreachable by any human.

alter table mp_config_responses
  add column if not exists topup_payment_intent_id text,
  add column if not exists topup_paid_at timestamptz;

comment on column mp_config_responses.topup_payment_intent_id is
  'Second Stripe PaymentIntent when the final total exceeded the authorization hold. Stamped by the Stripe webhook so an unreturned top-up is recoverable.';

-- Find top-ups paid but not yet settled into an Order (the stuck bucket).
create index if not exists idx_mp_config_responses_topup_paid
  on mp_config_responses (topup_paid_at)
  where topup_paid_at is not null;

alter table mp_config_responses drop constraint if exists mp_config_responses_status_check;
alter table mp_config_responses
  add constraint mp_config_responses_status_check
  check (
    status is null
    or status in ('held', 'assigned', 'accepted', 'declined', 'expired', 'captured', 'cancelled')
  );
