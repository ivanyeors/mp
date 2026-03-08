-- site_settings: key/value store for site-wide configuration
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Public read (landing page is server-rendered, no auth needed)
CREATE POLICY "public_read" ON site_settings FOR SELECT USING (true);
