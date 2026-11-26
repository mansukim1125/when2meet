BEGIN;
-- Serialize schema creation when two deployments start together.
SELECT pg_advisory_xact_lock(17424, 1);

CREATE SCHEMA IF NOT EXISTS nalmoa;
REVOKE ALL ON SCHEMA nalmoa FROM PUBLIC;

CREATE TABLE IF NOT EXISTS nalmoa.polls (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  dates TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nalmoa.responses (
  poll_id TEXT NOT NULL REFERENCES nalmoa.polls(id),
  token_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  dates TEXT NOT NULL,
  response_order BIGINT GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (poll_id, token_hash)
);

COMMIT;
