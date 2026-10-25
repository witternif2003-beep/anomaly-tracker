// Idempotent PostgreSQL schema applied by ensureSchema().
export const SCHEMA_SQL = `
-- Omega control plane schema (PostgreSQL). Idempotent; applied by ensureSchema().
CREATE TABLE IF NOT EXISTS users (
  eth_address TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agents (
  address TEXT PRIMARY KEY,
  name TEXT,
  creator_address TEXT,
  sandbox_id TEXT,
  added_by TEXT REFERENCES users(eth_address),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_snapshot_at TIMESTAMPTZ,
  last_snapshot_id BIGINT
);

CREATE TABLE IF NOT EXISTS snapshots (
  id BIGSERIAL PRIMARY KEY,
  agent_address TEXT NOT NULL REFERENCES agents(address) ON DELETE CASCADE,
  payload_sha256 TEXT NOT NULL UNIQUE,
  signature TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  survival_tier TEXT,
  credits_cents BIGINT,
  turn_count BIGINT,
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_agent ON snapshots(agent_address, id DESC);

CREATE TABLE IF NOT EXISTS treasury_policies (
  agent_address TEXT PRIMARY KEY REFERENCES agents(address) ON DELETE CASCADE,
  max_topup_usd INTEGER NOT NULL DEFAULT 25,
  daily_topup_cap_usd INTEGER NOT NULL DEFAULT 50,
  surplus_threshold_usd INTEGER NOT NULL DEFAULT 100,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_commands (
  id BIGSERIAL PRIMARY KEY,
  agent_address TEXT NOT NULL REFERENCES agents(address) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup','soul_update','payout')),
  payload JSONB NOT NULL,
  message TEXT NOT NULL,
  creator_signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','applied','failed','rejected')),
  result JSONB,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commands_agent ON agent_commands(agent_address, status);
ALTER TABLE agent_commands DROP CONSTRAINT IF EXISTS agent_commands_type_check;
ALTER TABLE agent_commands ADD CONSTRAINT agent_commands_type_check CHECK (type IN ('topup','soul_update','payout'));

CREATE TABLE IF NOT EXISTS login_handoffs (
  token_hash TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creator_totp (
  address TEXT PRIMARY KEY,
  secret_enc TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  last_step BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_log (
  seq BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  agent_address TEXT,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
);

CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
`;
