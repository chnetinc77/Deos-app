CREATE TABLE user_facts (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('goal','value','pattern','constraint','preference')),
  content TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  source_event_id INTEGER,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_confirmed TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_by INTEGER REFERENCES user_facts(id)
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('chat','decision','outcome','checkin')),
  raw_content TEXT NOT NULL,
  extracted_fact_ids INTEGER[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE decisions (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  chosen TEXT,
  decided_at TIMESTAMPTZ,
  outcome_reported_at TIMESTAMPTZ,
  outcome_notes TEXT,
  linked_fact_ids INTEGER[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_facts_active ON user_facts (category) WHERE superseded_by IS NULL;
CREATE INDEX idx_events_created ON events (created_at DESC);
