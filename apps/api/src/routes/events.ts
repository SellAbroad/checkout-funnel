import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
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

  const existing = await db
    .select({ id: checkoutSessions.id, maxStepReached: checkoutSessions.maxStepReached })
    .from(checkoutSessions)
    .where(eq(checkoutSessions.cartId, cart_id))
    .limit(1);

  let sessionId: string;

  if (existing.length > 0) {
    sessionId = existing[0].id;
    const updateFields: Record<string, unknown> = {
      lastEventAt: now,
    };

    if (stepOrder > existing[0].maxStepReached) {
      updateFields.maxStepReached = stepOrder;
    }
    if (isCompleted) {
      updateFields.isCompleted = true;
    }
    if (parsed.clarity_session_id) {
      updateFields.claritySessionId = parsed.clarity_session_id;
    }
    if (parsed.currency_code) {
      updateFields.currencyCode = parsed.currency_code;
    }
    if (parsed.cart_amount_cents != null) {
      updateFields.cartAmountCents = parsed.cart_amount_cents;
    }
    if (parsed.country_code) {
      updateFields.countryCode = parsed.country_code;
    }
    if (parsed.shop_url) {
      updateFields.shopUrl = parsed.shop_url;
    }
    if (parsed.device_type) {
      updateFields.deviceType = parsed.device_type;
    }

    await db
      .update(checkoutSessions)
      .set(updateFields)
      .where(eq(checkoutSessions.id, sessionId));
  } else {
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
      .returning({ id: checkoutSessions.id });
    sessionId = session.id;
  }

  await db.insert(checkoutEvents).values({
    sessionId,
    eventName: event,
    stepOrder,
    metadata,
    clientTimestamp: now,
  });

  return c.json({ ok: true }, 201);
});

export default events;
