CREATE TABLE assist_rate_limits (
    account_id TEXT PRIMARY KEY,
    window INTEGER NOT NULL,
    count INTEGER NOT NULL CHECK (count >= 1)
);
