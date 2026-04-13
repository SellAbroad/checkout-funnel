import "dotenv/config";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const sql = postgres(connectionString);

async function truncate() {
  console.log("Truncating tables...");

  await sql`TRUNCATE TABLE checkout_events CASCADE`;
  console.log("✓ checkout_events truncated");

  await sql`TRUNCATE TABLE checkout_sessions CASCADE`;
  console.log("✓ checkout_sessions truncated");

  console.log("Done. Database reset.");
  await sql.end();
}

truncate().catch((err) => {
  console.error("Truncate failed:", err);
  process.exit(1);
});
