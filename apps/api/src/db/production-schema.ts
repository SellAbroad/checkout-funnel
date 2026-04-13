import { pgTable, text, integer, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";

export const cart = pgTable("cart", {
  id: varchar("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Minimal schema — only the columns needed for analytics queries
export const orderInfo = pgTable("order_info", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id"),
  transactionAmountCents: integer("transaction_amount_cents"),
  transactionCurrency: text("transaction_currency"),
  lockedInFxRates: jsonb("locked_in_fx_rates"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const shopifyStore = pgTable("shopify_store", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id"),
  storeName: text("store_name"),
});

export const woocommerceStore = pgTable("woocommerce_store", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id"),
  storeName: text("store_name"),
});
