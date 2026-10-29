-- AI writing settings (PRD-campaign-email-editor decision 10, slice 16).
--
-- `site_settings` rows the owner edits on Admin Panel → General → AI writing:
-- on or off, the model, the effort for whole drafts (✨ Generate, ✨ Translate)
-- and for quick actions (subject ideas, preview lines, rewriting a block), and
-- the per-Staff limits. Every AI writing call reads them on the server
-- (lib/ai/settings.ts); a value that is missing or no longer parses reads as
-- its default there. None is a secret: the Anthropic credentials stay in Vercel.
--
-- Seeded with the defaults; an owner's saved value is never overwritten.
-- `ai_writing_model` is not seeded: the model ids live in one list in code
-- (lib/ai/models.ts), and a missing row reads as that list's default until the
-- owner saves a model.
--
-- Idempotent.

insert into public.site_settings (key, value) values
  ('ai_writing_enabled', 'true'),
  ('ai_writing_effort_draft', 'medium'),
  ('ai_writing_effort_quick', 'low'),
  ('ai_writing_limit_10min', '10'),
  ('ai_writing_limit_day', '60')
on conflict (key) do nothing;
