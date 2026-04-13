/**
 * Last 100 checkout sessions that never fired sa_checkout_address_selected
 * (matches funnel "Address Selected" step — NOT max_step_reached, which can drift).
 * Run: cd apps/api && npx dotenv-cli -e .env -- node scripts/query-address-dropouts.mjs
 */
import postgres from "postgres";

const EXCLUDED_MERCHANT_IDS = ["01KE79ZTMNNC5S72FGJRYW43QB"];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

const rows = await sql`
  SELECT
    s.id AS session_id,
    s.cart_id AS cart_id,
    s.clarity_session_id AS clarity_session_id,
    s.country_code AS country,
    s.shop_url AS store,
    s.is_completed AS cart_completed,
    s.cart_amount_cents AS amount_cents,
    s.currency_code AS currency,
    s.max_step_reached,
    s.created_at
  FROM checkout_sessions s
  WHERE s.merchant_id <> ${EXCLUDED_MERCHANT_IDS[0]}
    AND NOT EXISTS (
      SELECT 1 FROM checkout_events e
      WHERE e.session_id = s.id AND e.event_name = 'sa_checkout_address_selected'
    )
  ORDER BY s.created_at DESC
  LIMIT 100
`;

console.log(JSON.stringify(rows, null, 2));
await sql.end({ timeout: 5 });
