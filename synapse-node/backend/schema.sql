CREATE TABLE IF NOT EXISTS synapse_master_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_text TEXT NOT NULL,
  instruction TEXT NOT NULL DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','COMPLETED')),
  created_by TEXT NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synapse_output_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq BIGSERIAL UNIQUE,
  master_prompt_id UUID NOT NULL REFERENCES synapse_master_prompts(id) ON DELETE CASCADE,
  batch_number INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('OK','ERROR')),
  target_codename VARCHAR(100),
  raw_output JSONB,
  anomaly_score NUMERIC(5,2),
  error TEXT,
  model TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (master_prompt_id, batch_number)
);
CREATE INDEX IF NOT EXISTS synapse_output_batches_prompt_seq ON synapse_output_batches (master_prompt_id, seq);

CREATE TABLE IF NOT EXISTS synapse_system_telemetry (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID REFERENCES synapse_output_batches(id) ON DELETE CASCADE,
  metric_key VARCHAR(50) NOT NULL,
  metric_value VARCHAR(255) NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS synapse_system_telemetry_batch ON synapse_system_telemetry (batch_id);

CREATE TABLE IF NOT EXISTS synapse_engine_lease (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  holder TEXT,
  lease_until TIMESTAMPTZ NOT NULL DEFAULT 'epoch'
);
INSERT INTO synapse_engine_lease (id) VALUES (1) ON CONFLICT DO NOTHING;
