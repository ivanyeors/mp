-- A customisation's live shipping rate (ADR 0032).
--
-- A Result's shipping is re-priced at hold, assign, finish and accept, days
-- apart. A live (Easyship) method's courier price moves in that time, so the
-- rate the customer was shown is quoted once, when the shipping is chosen, and
-- kept here: the method's marked-up, rounded price for this Result's address,
-- before free_above. Every later repricing charges it. Null means the method's
-- base_rate, as before — a flat method, Self-collect, a Paired build's
-- companion, or a Result held before this column existed.
--
-- DEPLOY ORDER: apply BEFORE the code that ships with it. That code selects and
-- writes this column on every hold and every repricing, so against the old
-- schema each of them fails. The column on its own changes nothing: old code
-- never reads it.

alter table mp_config_responses
  add column if not exists shipping_rate numeric(12,2)
    check (shipping_rate is null or shipping_rate >= 0);

comment on column mp_config_responses.shipping_rate is
  'Live shipping method''s price for this Result''s address, quoted when the shipping was chosen (before free_above). Null: the method''s base_rate.';
