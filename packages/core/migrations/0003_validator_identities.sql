CREATE TABLE gen_validator_identities (
 address text PRIMARY KEY CHECK (address ~ '^0x[0-9a-f]{40}$'),
 moniker text CHECK (char_length(moniker) <= 128),
 checked_at timestamptz,
 fetched_at timestamptz,
 last_error text
);
CREATE INDEX gen_validator_identities_checked_idx ON gen_validator_identities(checked_at);
