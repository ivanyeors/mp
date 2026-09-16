-- Lineage for a reordered customisation.
--
-- Applied to the live project on 2026-09-16; the filename carries the version
-- the remote ledger recorded, so `supabase db push` sees it as already done.
--
-- A reorder clones an expired or declined Result into a fresh one rather than
-- reopening the original: those statuses are terminal, and rewriting them would
-- destroy the record of what actually happened. Without this column the clone
-- arrives in the staff queue as an assigned Result from nowhere, with no way to
-- see it is the same build a customer already lost once.

alter table mp_config_responses
  add column if not exists reordered_from uuid
    references mp_config_responses(id) on delete set null;

comment on column mp_config_responses.reordered_from is
  'The expired/declined Result this one was reordered from. Null for an original submission.';

-- Staff look this up from the source row ("was this reordered?"), so index the
-- referenced side; it also covers the FK, which is otherwise unindexed.
create index if not exists mp_config_responses_reordered_from_idx
  on mp_config_responses (reordered_from)
  where reordered_from is not null;
