ALTER TABLE gen_transactions ADD COLUMN confirmation text NOT NULL DEFAULT 'confirmed' CHECK (confirmation IN ('confirmed','provisional','orphaned'));
ALTER TABLE gen_transactions ADD COLUMN submission_block_hash text;
ALTER TABLE gen_transactions ADD COLUMN observed_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE gen_transactions ADD COLUMN execution_result text NOT NULL DEFAULT 'unknown';
ALTER TABLE gen_transactions ADD COLUMN analysis_version integer NOT NULL DEFAULT 0;
UPDATE gen_transactions SET execution_result=CASE (receipt->>'txExecutionResult')::integer WHEN 1 THEN 'returned' WHEN 2 THEN 'error' WHEN 3 THEN 'timeout' WHEN 4 THEN 'disagreement' WHEN 5 THEN 'violation' ELSE 'unknown' END WHERE receipt IS NOT NULL;
CREATE INDEX gen_transactions_outcome_idx ON gen_transactions(execution_result,created_at DESC) WHERE confirmation<>'orphaned';
CREATE INDEX gen_transactions_analysis_idx ON gen_transactions(analysis_version,block_number DESC);
ALTER TABLE gen_sync ADD COLUMN live_head bigint;
ALTER TABLE gen_sync ADD COLUMN live_from bigint;
ALTER TABLE gen_sync ADD COLUMN live_updated_at timestamptz;
ALTER TABLE gen_sync ADD COLUMN live_error text;
ALTER TABLE gen_contracts ADD COLUMN profile jsonb;
ALTER TABLE gen_contracts ADD COLUMN source_hash text;
ALTER TABLE gen_contracts ADD COLUMN profile_checked_at timestamptz;
CREATE INDEX gen_contracts_source_idx ON gen_contracts(source_hash);
CREATE TABLE gen_contract_sources (
 address text NOT NULL, sha256 text NOT NULL, source text NOT NULL, profile jsonb NOT NULL,
 first_observed_at timestamptz NOT NULL DEFAULT now(), last_observed_at timestamptz NOT NULL DEFAULT now(),
 observed_block bigint, PRIMARY KEY(address,sha256)
);
CREATE TABLE gen_validator_votes (
 tx_id text NOT NULL, round integer NOT NULL, position integer NOT NULL, address text NOT NULL,
 leader boolean NOT NULL, active boolean NOT NULL DEFAULT true, vote integer, result_hash text, consensus_result integer,
 PRIMARY KEY(tx_id,round,position)
);
CREATE INDEX gen_validator_votes_address_idx ON gen_validator_votes(address,tx_id);
CREATE TABLE gen_receipt_observations (
 id bigserial PRIMARY KEY, tx_id text NOT NULL, status text NOT NULL, execution_result text NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gen_receipt_observations_tx_idx ON gen_receipt_observations(tx_id,observed_at);
