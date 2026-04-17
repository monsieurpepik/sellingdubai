-- Testimonials: agent-curated social proof shown on profile pages
CREATE TABLE IF NOT EXISTS testimonials (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id    UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  client_name TEXT NOT NULL CHECK (char_length(client_name) BETWEEN 2 AND 100),
  client_role TEXT CHECK (char_length(client_role) <= 100),
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 10 AND 500),
  rating      INTEGER DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_testimonials_agent_id ON testimonials(agent_id);

ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

-- Anyone can read testimonials (public profile pages)
CREATE POLICY "testimonials_public_read" ON testimonials
  FOR SELECT USING (true);

-- No direct client writes — manage-testimonials edge function uses service_role
