-- Slice 11: customer post-delivery refund request on customised Orders.
-- Operator approves only after acknowledging in-person return; Stripe refund
-- still flows through existing refundPayment + money-ledger webhook.

alter table orders
  add column if not exists refund_request_status text
    check (
      refund_request_status is null
      or refund_request_status in ('requested', 'approved', 'rejected')
    ),
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refund_request_note text,
  add column if not exists refund_return_acknowledged_at timestamptz;

comment on column orders.refund_request_status is
  'Customer refund request lifecycle for Result (customised) orders.';
