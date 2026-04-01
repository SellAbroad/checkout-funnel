import "dotenv/config";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const sql = postgres(connectionString);

async function migrate() {
  console.log("Running migrations...");

  await sql`
    CREATE TABLE IF NOT EXISTS checkout_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cart_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      clarity_session_id TEXT,
      currency_code TEXT,
      cart_amount_cents INTEGER,
      country_code TEXT,
      device_type TEXT,
      user_agent TEXT,
      shop_url TEXT,
      first_event_at TIMESTAMPTZ NOT NULL,
      last_event_at TIMESTAMPTZ NOT NULL,
      max_step_reached SMALLINT NOT NULL DEFAULT 0,
      is_completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS checkout_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES checkout_sessions(id),
      event_name TEXT NOT NULL,
      step_order SMALLINT NOT NULL,
      metadata JSONB,
      client_timestamp TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_merchant ON checkout_sessions(merchant_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_created ON checkout_sessions(created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_step ON checkout_sessions(max_step_reached)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_session ON checkout_events(session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_name ON checkout_events(event_name)`;

  // Merge duplicate sessions: reassign events to the "best" session per cart_id
  console.log("Merging duplicate sessions...");
  await sql`
    WITH best AS (
      SELECT DISTINCT ON (cart_id) id, cart_id
      FROM checkout_sessions
      ORDER BY cart_id, is_completed DESC, max_step_reached DESC, created_at ASC
    ),
    dupes AS (
      SELECT cs.id AS dupe_id, b.id AS keep_id
      FROM checkout_sessions cs
      JOIN best b ON b.cart_id = cs.cart_id
      WHERE cs.id != b.id
    )
    UPDATE checkout_events
    SET session_id = dupes.keep_id
    FROM dupes
    WHERE checkout_events.session_id = dupes.dupe_id
  `;

  await sql`
    WITH best AS (
      SELECT DISTINCT ON (cart_id) id, cart_id
      FROM checkout_sessions
      ORDER BY cart_id, is_completed DESC, max_step_reached DESC, created_at ASC
    )
    DELETE FROM checkout_sessions
    WHERE id NOT IN (SELECT id FROM best)
  `;

  // Drop old non-unique index if it exists, then add unique constraint
  await sql`DROP INDEX IF EXISTS idx_sessions_cart`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_cart_unique
    ON checkout_sessions(cart_id)
  `;

  // Recalculate max_step_reached and is_completed for merged sessions
  await sql`
    UPDATE checkout_sessions cs
    SET
      max_step_reached = sub.real_max,
      is_completed = sub.has_completed,
      last_event_at = sub.last_ts
    FROM (
      SELECT
        session_id,
        MAX(step_order) AS real_max,
        BOOL_OR(event_name = 'sa_checkout_completed') AS has_completed,
        MAX(client_timestamp) AS last_ts
      FROM checkout_events
      GROUP BY session_id
    ) sub
    WHERE cs.id = sub.session_id
  `;

  console.log("Migrations complete.");
  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
