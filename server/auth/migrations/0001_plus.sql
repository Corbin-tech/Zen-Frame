CREATE TABLE plus_accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    stripe_customer TEXT UNIQUE,
    plus_until INTEGER NOT NULL DEFAULT 0,
    billing_sync_version INTEGER NOT NULL DEFAULT 0,
    billing_applied_version INTEGER NOT NULL DEFAULT 0,
    checkout_id TEXT,
    checkout_session TEXT,
    checkout_url TEXT,
    checkout_plan TEXT CHECK (checkout_plan IN ('monthly', 'annual')),
    checkout_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE plus_codes (
    email TEXT PRIMARY KEY,
    challenge TEXT NOT NULL,
    digest TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL CHECK (attempts >= 0)
);

CREATE TABLE plus_auth_limits (
    bucket TEXT PRIMARY KEY,
    window INTEGER NOT NULL,
    hits INTEGER NOT NULL
);

CREATE TABLE plus_sessions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES plus_accounts(id) ON DELETE CASCADE,
    cookie_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL
);
CREATE INDEX plus_sessions_by_expiry ON plus_sessions(expires_at);

CREATE TABLE plus_usage (
    account_id TEXT NOT NULL REFERENCES plus_accounts(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    used INTEGER NOT NULL,
    PRIMARY KEY (account_id, period)
);

CREATE TABLE plus_usage_holds (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES plus_accounts(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX plus_holds_by_account_period ON plus_usage_holds(account_id, period, expires_at);

CREATE TRIGGER plus_charge_completed_answer
AFTER UPDATE OF completed ON plus_usage_holds
WHEN NEW.completed = 1 AND OLD.completed = 0
BEGIN
    INSERT INTO plus_usage (account_id, period, used) VALUES (NEW.account_id, NEW.period, 1)
        ON CONFLICT (account_id, period) DO UPDATE SET used = used + 1;
    DELETE FROM plus_usage_holds WHERE id = NEW.id;
END;
