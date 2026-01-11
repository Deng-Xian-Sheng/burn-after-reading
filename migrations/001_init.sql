-- D1 schema
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  iv_b64u TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,  -- unix seconds
  expires_at INTEGER NOT NULL,  -- unix seconds
  consumed_at INTEGER           -- unix seconds, NULL means not consumed
);

CREATE INDEX IF NOT EXISTS idx_images_expires_at ON images(expires_at);
