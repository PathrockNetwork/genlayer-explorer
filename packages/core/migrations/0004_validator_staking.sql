CREATE TABLE gen_staking_validators (
 address text PRIMARY KEY, status text NOT NULL, is_active boolean NOT NULL DEFAULT false,
 self_stake numeric NOT NULL DEFAULT 0, delegated_stake numeric NOT NULL DEFAULT 0, total_shares numeric NOT NULL DEFAULT 0,
 apy numeric, validator_weight numeric, banned_until_epoch integer,
 operator_address text, owner_address text, metadata jsonb,
 pending_deposits jsonb NOT NULL DEFAULT '[]'::jsonb, pending_withdrawals jsonb NOT NULL DEFAULT '[]'::jsonb,
 total_votes_7d integer, minority_votes_7d integer, rotation_pct_7d numeric, idle_pct_7d numeric,
 successful_appeals_7d integer, transaction_count integer, live boolean,
 fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gen_staking_validators_stake_idx ON gen_staking_validators(delegated_stake DESC, self_stake DESC);
CREATE INDEX gen_staking_validators_active_idx ON gen_staking_validators(is_active) WHERE is_active;
