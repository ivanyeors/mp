-- Convert shopify_sales_queue status from cancelled -> archived
-- Safe to run whether or not rows exist.

do $$
begin
  -- Drop existing check constraint if it exists (name may differ depending on migration order),
  -- then recreate with archived.
  begin
    alter table shopify_sales_queue drop constraint if exists shopify_sales_queue_status_check;
  exception when undefined_table then
    -- table not created yet; nothing to do
    return;
  end;

  -- Update any existing cancelled rows to archived
  update shopify_sales_queue set status = 'archived' where status = 'cancelled';

  -- Re-add constraint
  alter table shopify_sales_queue
    add constraint shopify_sales_queue_status_check
    check (status in ('pending','committed','archived'));
end $$;


