-- Landing page section configuration for the page builder
CREATE TABLE IF NOT EXISTS landing_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_type TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  position     INTEGER NOT NULL,
  visible      BOOLEAN NOT NULL DEFAULT true,
  content      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_landing_sections_position ON landing_sections (position);

-- Seed the 12 default sections (idempotent)
INSERT INTO landing_sections (slug, section_type, position, visible, content) VALUES
  ('hero',              'hero',                  0,  true, '{}'),
  ('size-matters',      'text_image',            1,  true, '{}'),
  ('marquee',           'marquee',               2,  true, '{}'),
  ('ambassadors',       'text_image',            3,  true, '{}'),
  ('stories',           'stories',               4,  true, '{}'),
  ('pick-your-mpillow', 'pick_your_mpillow',     5,  true, '{}'),
  ('neck-pains',        'neck_pains',            6,  true, '{}'),
  ('why-choose',        'why_choose_highlights', 7,  true, '{}'),
  ('mbolster',          'product_card',          8,  true, '{}'),
  ('credibility',       'credibility',           9,  true, '{}'),
  ('review',            'video_embed',          10,  true, '{}'),
  ('founder',           'founder_note',         11,  true, '{}')
ON CONFLICT (slug) DO NOTHING;
