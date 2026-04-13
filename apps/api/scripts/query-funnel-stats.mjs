import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const excluded = "01KE79ZTMNNC5S72FGJRYW43QB";

const [totals] = await sql`
  SELECT
    count(*)::int AS total_sessions,
    count(*) FILTER (WHERE max_step_reached < 5)::int AS below_address_step,
    count(*) FILTER (WHERE max_step_reached >= 5)::int AS reached_address_or_more
  FROM checkout_sessions
  WHERE merchant_id <> ${excluded}
`;

const [eventBased] = await sql`
  SELECT
    count(DISTINCT s.id)::int AS sessions_without_address_event
  FROM checkout_sessions s
  WHERE s.merchant_id <> ${excluded}
    AND NOT EXISTS (
      SELECT 1 FROM checkout_events e
      WHERE e.session_id = s.id AND e.event_name = 'sa_checkout_address_selected'
    )
`;

const [withAddressEvent] = await sql`
  SELECT count(DISTINCT s.id)::int AS cnt
  FROM checkout_sessions s
  INNER JOIN checkout_events e ON e.session_id = s.id AND e.event_name = 'sa_checkout_address_selected'
  WHERE s.merchant_id <> ${excluded}
`;

console.log(JSON.stringify({ totals, eventBased, withAddressEvent }, null, 2));
await sql.end({ timeout: 5 });
