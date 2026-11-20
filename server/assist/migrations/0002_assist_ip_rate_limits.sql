CREATE TABLE assist_ip_rate_limits (
    ip_hash TEXT PRIMARY KEY,
    window INTEGER NOT NULL,
    count INTEGER NOT NULL CHECK (count >= 1)
);
