-- The Node server creates its own state table automatically.
-- You do not need to run SQL for the main application database.
-- Use this file only as a reference if you want to inspect the Render Postgres database.

SELECT key, jsonb_typeof(value) AS value_type
FROM linnmar_state
ORDER BY key;
