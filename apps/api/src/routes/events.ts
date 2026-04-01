import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { checkoutSessions, checkoutEvents } from "../db/schema.js";
import { parseEventBody } from "../lib/parse-event.js";
import { getStepOrder } from "../lib/step-order.js";

const events = new Hono();

events.post("/", async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  let body: string | Record<string, unknown>;

  if (contentType.includes("application/json")) {
    body = await c.req.json();
  } else {
    body = await c.req.text();
  }

  const parsed = parseEventBody(body);
  if (!parsed) {
    return c.json({ ok: false }, 400);
  }

  const stepOrder = getStepOrder(parsed.event);
  const now = parsed.timestamp ? new Date(parsed.timestamp) : new Date();
  const isCompleted = parsed.event === "sa_checkout_completed";

  const { event, cart_id, merchant_id, timestamp, ...rest } = parsed;
  const metadata = Object.keys(rest).length > 0 ? rest : null;

  const [session] = await db
    .insert(checkoutSessions)
    .values({
      cartId: cart_id,
      merchantId: merchant_id,
      claritySessionId: parsed.clarity_session_id ?? null,
      currencyCode: parsed.currency_code ?? null,
      cartAmountCents: parsed.cart_amount_cents ?? null,
      countryCode: parsed.country_code ?? null,
      deviceType: parsed.device_type ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      shopUrl: parsed.shop_url ?? null,
      firstEventAt: now,
      lastEventAt: now,
      maxStepReached: stepOrder,
      isCompleted,
    })
    .onConflictDoUpdate({
      target: checkoutSessions.cartId,
      set: {
        lastEventAt: now,
        maxStepReached: sql`GREATEST(${checkoutSessions.maxStepReached}, ${stepOrder})`,
        isCompleted: isCompleted
          ? sql`TRUE`
          : sql`${checkoutSessions.isCompleted}`,
        claritySessionId: parsed.clarity_session_id
          ? sql`${parsed.clarity_session_id}`
          : sql`${checkoutSessions.claritySessionId}`,
        currencyCode: parsed.currency_code
          ? sql`${parsed.currency_code}`
          : sql`${checkoutSessions.currencyCode}`,
        cartAmountCents: parsed.cart_amount_cents != null
          ? sql`${parsed.cart_amount_cents}`
          : sql`${checkoutSessions.cartAmountCents}`,
        countryCode: parsed.country_code
          ? sql`${parsed.country_code}`
          : sql`${checkoutSessions.countryCode}`,
        shopUrl: parsed.shop_url
          ? sql`${parsed.shop_url}`
          : sql`${checkoutSessions.shopUrl}`,
        deviceType: parsed.device_type
          ? sql`${parsed.device_type}`
          : sql`${checkoutSessions.deviceType}`,
      },
    })
    .returning({ id: checkoutSessions.id });

  await db.insert(checkoutEvents).values({
    sessionId: session.id,
    eventName: event,
    stepOrder,
    metadata,
    clientTimestamp: now,
  });

  return c.json({ ok: true }, 201);
});

export default events;
