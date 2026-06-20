-- ============================================================
-- Extend order_status enum: payment_failed + disputed
-- ============================================================
-- Adds handling for failed payments (payment_intent.payment_failed) and
-- chargebacks (charge.dispute.created). Each ADD VALUE is its own statement;
-- Postgres requires new enum values to be committed before use, and Supabase
-- runs migrations such that these take effect without an explicit transaction
-- wrapper around the enum extension.

alter type order_status add value if not exists 'payment_failed';
alter type order_status add value if not exists 'disputed';
