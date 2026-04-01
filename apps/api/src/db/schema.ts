import {
  pgTable,
  uuid,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const checkoutSessions = pgTable(
  "checkout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: text("cart_id").notNull(),
    merchantId: text("merchant_id").notNull(),
    claritySessionId: text("clarity_session_id"),
    currencyCode: text("currency_code"),
    cartAmountCents: integer("cart_amount_cents"),
    countryCode: text("country_code"),
    deviceType: text("device_type"),
    userAgent: text("user_agent"),
    shopUrl: text("shop_url"),
    firstEventAt: timestamp("first_event_at", { withTimezone: true }).notNull(),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
    maxStepReached: smallint("max_step_reached").default(0).notNull(),
    isCompleted: boolean("is_completed").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_sessions_cart_unique").on(t.cartId),
    index("idx_sessions_merchant").on(t.merchantId),
    index("idx_sessions_created").on(t.createdAt),
    index("idx_sessions_step").on(t.maxStepReached),
  ],
);

export const checkoutEvents = pgTable(
  "checkout_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => checkoutSessions.id),
    eventName: text("event_name").notNull(),
    stepOrder: smallint("step_order").notNull(),
    metadata: jsonb("metadata"),
    clientTimestamp: timestamp("client_timestamp", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_events_session").on(t.sessionId),
    index("idx_events_name").on(t.eventName),
  ],
);
