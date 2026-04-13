import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const EXCLUDED = "01KE79ZTMNNC5S72FGJRYW43QB";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const [row] = await sql`
  SELECT count(*)::int AS completed_without_address_event
  FROM checkout_sessions s
  WHERE s.merchant_id <> ${EXCLUDED}
    AND s.is_completed = true
    AND NOT EXISTS (
      SELECT 1 FROM checkout_events e
      WHERE e.session_id = s.id AND e.event_name = 'sa_checkout_address_selected'
    )
`;

const [totals] = await sql`
  SELECT
    count(*) FILTER (WHERE is_completed = true)::int AS completed_total,
    count(*)::int AS sessions_total
  FROM checkout_sessions
  WHERE merchant_id <> ${EXCLUDED}
`;

console.log(JSON.stringify({ ...row, ...totals }, null, 2));
await sql.end({ timeout: 5 });
