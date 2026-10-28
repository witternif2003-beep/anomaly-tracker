/** Idempotent schema. Applied on first database access in each runtime. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ops_batch (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  trigger TEXT NOT NULL,
  actor TEXT,
  catalog_version TEXT,
  catalog_released TIMESTAMPTZ,
  catalog_count INTEGER,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  new_findings INTEGER NOT NULL DEFAULT 0,
  changed_findings INTEGER NOT NULL DEFAULT 0,
  opened_incidents INTEGER NOT NULL DEFAULT 0,
  cost_units NUMERIC(14,4) NOT NULL DEFAULT 0,
  narrative TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS ops_stage (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES ops_batch(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  depends_on TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  rows_in INTEGER,
  rows_out INTEGER,
  bytes BIGINT,
  heap_used_mb NUMERIC(10,2),
  requests INTEGER,
  rss_mb NUMERIC(10,2),
  error TEXT
);
CREATE INDEX IF NOT EXISTS ops_stage_batch ON ops_stage (batch_id);

CREATE SEQUENCE IF NOT EXISTS ops_anomaly_no START 1;

CREATE TABLE IF NOT EXISTS ops_finding (
  cve_id TEXT PRIMARY KEY,
  vendor TEXT,
  product TEXT,
  title TEXT,
  summary TEXT,
  date_added DATE,
  due_date DATE,
  ransomware TEXT,
  cwes TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL,
  source_url TEXT,
  epss NUMERIC(10,8),
  epss_percentile NUMERIC(10,8),
  epss_date DATE,
  cvss NUMERIC(4,1),
  cvss_vector TEXT,
  cvss_severity TEXT,
  cvss_version TEXT,
  cvss_exploitability NUMERIC(4,1),
  cvss_impact NUMERIC(4,1),
  vuln_status TEXT,
  reference_count INTEGER,
  nvd_published TIMESTAMPTZ,
  nvd_last_modified TIMESTAMPTZ,
  exposure_score NUMERIC(6,2),
  kev_listed BOOLEAN NOT NULL DEFAULT false,
  kev_raw JSONB,
  nvd_raw JSONB,
  epss_raw JSONB,
  record_hash TEXT,
  anomaly_no BIGINT,
  first_seen_batch BIGINT,
  last_seen_batch BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_finding_exposure ON ops_finding (exposure_score DESC NULLS LAST);
CREATE UNIQUE INDEX IF NOT EXISTS ops_finding_anomaly_no ON ops_finding (anomaly_no);
CREATE INDEX IF NOT EXISTS ops_finding_added ON ops_finding (date_added DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS ops_asset (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  class TEXT NOT NULL DEFAULT 'service',
  vendor TEXT,
  product TEXT,
  criticality TEXT NOT NULL DEFAULT 'standard',
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

ALTER TABLE ops_asset ADD COLUMN IF NOT EXISTS asset_group TEXT;
CREATE INDEX IF NOT EXISTS ops_asset_group ON ops_asset (lower(asset_group));

CREATE TABLE IF NOT EXISTS ops_reference (
  source TEXT PRIMARY KEY,
  version TEXT,
  modified TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  link_count INTEGER NOT NULL DEFAULT 0,
  bytes BIGINT
);

CREATE TABLE IF NOT EXISTS ops_attribution (
  cve_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_url TEXT NOT NULL,
  espionage_note TEXT NOT NULL,
  statement TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]',
  attack_version TEXT,
  PRIMARY KEY (cve_id, actor_id)
);

CREATE TABLE IF NOT EXISTS ops_incident (
  id BIGSERIAL PRIMARY KEY,
  cve_id TEXT NOT NULL REFERENCES ops_finding(cve_id) ON DELETE CASCADE,
  asset_id BIGINT REFERENCES ops_asset(id) ON DELETE SET NULL,
  opened_batch BIGINT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  state TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'p3',
  assignee TEXT,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (cve_id, asset_id)
);
CREATE INDEX IF NOT EXISTS ops_incident_state ON ops_incident (state, priority);

CREATE TABLE IF NOT EXISTS ops_treasury (
  seq BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  batch_id BIGINT,
  kind TEXT NOT NULL,
  units NUMERIC(14,4) NOT NULL,
  memo TEXT,
  actor TEXT
);

CREATE TABLE IF NOT EXISTS ops_limit (
  key TEXT PRIMARY KEY,
  units NUMERIC(14,4) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS ops_api_key (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ops_audit (
  seq BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  role TEXT,
  action TEXT NOT NULL,
  subject TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ops_audit_at ON ops_audit (at DESC);

INSERT INTO ops_limit (key, units, updated_by) VALUES ('batch_max', 50, 'system')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO ops_limit (key, units, updated_by) VALUES ('daily_max', 400, 'system')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO ops_treasury (kind, units, memo, actor) SELECT 'allocation', 10000, 'Opening simulated allocation', 'system'
  WHERE NOT EXISTS (SELECT 1 FROM ops_treasury);
`;
