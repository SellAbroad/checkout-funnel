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
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_cart ON checkout_sessions(cart_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_step ON checkout_sessions(max_step_reached)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_session ON checkout_events(session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_name ON checkout_events(event_name)`;

  console.log("Migrations complete.");
  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
