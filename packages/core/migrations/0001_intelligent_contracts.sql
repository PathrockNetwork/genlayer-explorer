CREATE TABLE gen_contracts (
 address text PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('intelligent','evm')),
 creator text, deployment_id text, deployment_tx text, deployment_block bigint, deployed_at timestamptz,
 first_seen_block bigint NOT NULL, name text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gen_contracts_kind_idx ON gen_contracts(kind, first_seen_block DESC, address);
CREATE TABLE gen_transactions (
 id text PRIMARY KEY, recipient text NOT NULL, submission_hash text NOT NULL,
 block_number bigint NOT NULL, sender text, created_at timestamptz,
 status text NOT NULL DEFAULT 'Unknown', kind text, method text,
 receipt jsonb, checked_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gen_transactions_block_idx ON gen_transactions(block_number DESC, id);
CREATE INDEX gen_transactions_contract_idx ON gen_transactions(recipient, block_number DESC);
CREATE INDEX gen_transactions_pending_idx ON gen_transactions(checked_at NULLS FIRST) WHERE status NOT IN ('Finalized','Canceled');
CREATE INDEX gen_transactions_time_idx ON gen_transactions(created_at);
CREATE TABLE gen_sync (
 id integer PRIMARY KEY CHECK (id=1), head bigint NOT NULL, history_next bigint NOT NULL,
 start_block bigint NOT NULL, target bigint, updated_at timestamptz NOT NULL DEFAULT now(), last_error text
);
CREATE INDEX txs_contract_creation_idx ON transactions(contract_address) WHERE contract_address IS NOT NULL;
