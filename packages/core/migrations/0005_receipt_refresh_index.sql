-- The receipt refresher polls every few seconds for rows that still need a
-- receipt. Its predicate (non-terminal status OR missing receipt) could not use
-- gen_transactions_pending_idx, so every poll read the whole table.
CREATE INDEX gen_transactions_refresh_idx ON gen_transactions(checked_at NULLS FIRST)
 WHERE confirmation<>'orphaned' AND (status NOT IN ('Finalized','Canceled') OR receipt IS NULL);
