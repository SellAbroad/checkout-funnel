import { Hono } from "hono";
import { sql, eq, ne, and, gte, lte, desc, inArray, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { checkoutSessions, checkoutEvents } from "../db/schema.js";
import { productionDb } from "../db/production-client.js";
import { shopifyStore, woocommerceStore } from "../db/production-schema.js";
import { STEP_LABELS, FUNNEL_DEFINITION, SIDE_METRIC_EVENTS, getFunnelDefinition } from "../lib/step-order.js";

const EXCLUDED_MERCHANT_IDS = ["01KE79ZTMNNC5S72FGJRYW43QB"];

const analytics = new Hono();

analytics.get("/funnel", async (c) => {
  const merchantId = c.req.query("merchant_id");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const deviceType = c.req.query("device_type");

  const conditions = EXCLUDED_MERCHANT_IDS.map((id) =>
    ne(checkoutSessions.merchantId, id),
  );
  if (merchantId) {
    conditions.push(eq(checkoutSessions.merchantId, merchantId));
  }
  if (from) {
    conditions.push(gte(checkoutSessions.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(checkoutSessions.createdAt, new Date(to)));
  }
  if (deviceType) {
    conditions.push(eq(checkoutSessions.deviceType, deviceType));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const funnelDef = getFunnelDefinition(deviceType ?? null);

  // Build dynamic CASE statements for all funnel steps
  const selectObj: Record<string, any> = {
    totalSessions: sql<number>`COUNT(DISTINCT ${checkoutSessions.id})::int`,
  };

  // Add counts for all defined funnel steps
  for (const step of funnelDef) {
    selectObj[step.key] = sql<number>`COUNT(DISTINCT CASE WHEN ${checkoutEvents.eventName} = ${step.eventName} THEN ${checkoutSessions.id} END)::int`;
  }

  // Add side metrics
  selectObj.shippingEmpty = sql<number>`COUNT(DISTINCT CASE WHEN ${checkoutEvents.eventName} = ${SIDE_METRIC_EVENTS.shippingEmpty} THEN ${checkoutSessions.id} END)::int`;
  selectObj.paymentError = sql<number>`COUNT(DISTINCT CASE WHEN ${checkoutEvents.eventName} = ${SIDE_METRIC_EVENTS.paymentError} THEN ${checkoutSessions.id} END)::int`;

  const [row] = await db
    .select(selectObj)
    .from(checkoutSessions)
    .leftJoin(checkoutEvents, eq(checkoutEvents.sessionId, checkoutSessions.id))
    .where(whereClause);

  const totalSessions = row?.totalSessions ?? 0;

  const counts: Record<string, number> = {};
  for (const step of funnelDef) {
    counts[step.key] = (row as any)?.[step.key] ?? 0;
  }

  const funnel = funnelDef.map((step, i) => {
    const count = counts[step.key] ?? 0;
    const prevCount = i > 0 ? (counts[funnelDef[i - 1].key] ?? 0) : totalSessions;
    const dropoffRate = prevCount > 0 ? ((prevCount - count) / prevCount) * 100 : 0;

    return {
      step: i + 1,
      label: step.label,
      count,
      percentOfTotal: totalSessions > 0 ? (count / totalSessions) * 100 : 0,
      dropoffRate: Math.round(dropoffRate * 10) / 10,
    };
  });

  const shippingEmptyCount = (row as any)?.shippingEmpty ?? 0;
  const paymentErrorCount  = (row as any)?.paymentError  ?? 0;

  // For mobile, calculate dropdown_open_rate as a key metric
  let mobileMetrics: any = null;
  if (deviceType === "mobile") {
    const shippingShownCount = counts.shipping_shown ?? 0;
    const dropdownOpenCount = counts.price_dropdown_opened ?? 0;
    const dropdownOpenRate = shippingShownCount > 0 ? Math.round((dropdownOpenCount / shippingShownCount) * 1000) / 10 : 0;
    mobileMetrics = { dropdownOpenRate };
  }

  return c.json({
    totalSessions,
    funnel,
    sideMetrics: {
      shippingEmpty:     shippingEmptyCount,
      shippingEmptyRate: totalSessions > 0 ? Math.round((shippingEmptyCount / totalSessions) * 1000) / 10 : 0,
      paymentErrors:     paymentErrorCount,
      paymentErrorRate:  totalSessions > 0 ? Math.round((paymentErrorCount  / totalSessions) * 1000) / 10 : 0,
    },
    mobileMetrics,
    filters: { merchantId, from, to, deviceType },
  });
});

analytics.get("/sessions", async (c) => {
  const merchantId = c.req.query("merchant_id");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const maxStep = c.req.query("max_step");
  const completedOnly = c.req.query("completed");
  const hasPaymentError = c.req.query("has_payment_error");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const conditions = EXCLUDED_MERCHANT_IDS.map((id) =>
    ne(checkoutSessions.merchantId, id),
  );
  if (merchantId) {
    conditions.push(eq(checkoutSessions.merchantId, merchantId));
  }
  if (from) {
    conditions.push(gte(checkoutSessions.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(checkoutSessions.createdAt, new Date(to)));
  }
  if (maxStep) {
    conditions.push(eq(checkoutSessions.maxStepReached, parseInt(maxStep, 10)));
  }
  if (completedOnly === "true") {
    conditions.push(eq(checkoutSessions.isCompleted, true));
  } else if (completedOnly === "false") {
    conditions.push(eq(checkoutSessions.isCompleted, false));
  }
  if (hasPaymentError === "true") {
    const subq = db
      .select({ sessionId: checkoutEvents.sessionId })
      .from(checkoutEvents)
      .where(eq(checkoutEvents.eventName, SIDE_METRIC_EVENTS.paymentError));
    conditions.push(inArray(checkoutSessions.id, subq));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [sessions, countResult] = await Promise.all([
    db
      .select()
      .from(checkoutSessions)
      .where(whereClause)
      .orderBy(desc(checkoutSessions.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(checkoutSessions)
      .where(whereClause),
  ]);

  // Enrich with merchant names from production DB if available
  let enrichedSessions = sessions.map((s) => ({
    ...s,
    maxStepLabel: STEP_LABELS[s.maxStepReached] ?? `Step ${s.maxStepReached}`,
    merchantName: undefined as string | undefined,
  }));

  if (productionDb && enrichedSessions.length > 0) {
    const merchantIds = [...new Set(enrichedSessions.map((s) => s.merchantId))];

    // Get merchant names from both shopify_store and woocommerce_store
    const [shopifyNames, woocommerceNames] = await Promise.all([
      productionDb
        .select({ merchantId: shopifyStore.merchantId, storeName: shopifyStore.storeName })
        .from(shopifyStore)
        .where(inArray(shopifyStore.merchantId, merchantIds)),
      productionDb
        .select({ merchantId: woocommerceStore.merchantId, storeName: woocommerceStore.storeName })
        .from(woocommerceStore)
        .where(inArray(woocommerceStore.merchantId, merchantIds)),
    ]);

    // Merge both lists (shopify takes precedence if both exist)
    const nameMap = new Map<string, string>();
    woocommerceNames.forEach((row) => nameMap.set(row.merchantId, row.storeName));
    shopifyNames.forEach((row) => nameMap.set(row.merchantId, row.storeName));

    enrichedSessions = enrichedSessions.map((s) => ({
      ...s,
      merchantName: nameMap.get(s.merchantId),
    }));
  }

  return c.json({
    sessions: enrichedSessions,
    total: countResult[0]?.total ?? 0,
    limit,
    offset,
  });
});

analytics.get("/sessions/:id/events", async (c) => {
  const sessionId = c.req.param("id");

  const sessionEvents = await db
    .select()
    .from(checkoutEvents)
    .where(eq(checkoutEvents.sessionId, sessionId))
    .orderBy(checkoutEvents.clientTimestamp);

  return c.json({ events: sessionEvents });
});

analytics.get("/merchants", async (c) => {
  const excludeConditions = EXCLUDED_MERCHANT_IDS.map((id) =>
    ne(checkoutSessions.merchantId, id),
  );

  const rows = await db
    .select({
      merchantId: checkoutSessions.merchantId,
      shopUrl: sql<string>`MAX(${checkoutSessions.shopUrl})`,
      sessionCount: sql<number>`count(*)::int`,
    })
    .from(checkoutSessions)
    .where(and(...excludeConditions))
    .groupBy(checkoutSessions.merchantId)
    .orderBy(sql`count(*) DESC`);

  return c.json({ merchants: rows });
});

analytics.get("/stats", async (c) => {
  const merchantId = c.req.query("merchant_id");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const conditions = EXCLUDED_MERCHANT_IDS.map((id) =>
    ne(checkoutSessions.merchantId, id),
  );
  if (merchantId) {
    conditions.push(eq(checkoutSessions.merchantId, merchantId));
  }
  if (from) {
    conditions.push(gte(checkoutSessions.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(checkoutSessions.createdAt, new Date(to)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [result] = await db
    .select({
      totalSessions: sql<number>`count(*)::int`,
      completedSessions: sql<number>`count(*) FILTER (WHERE ${checkoutSessions.isCompleted})::int`,
      avgMaxStep: sql<number>`round(avg(${checkoutSessions.maxStepReached})::numeric, 1)`,
    })
    .from(checkoutSessions)
    .where(whereClause);

  const completionRate =
    result.totalSessions > 0
      ? Math.round((result.completedSessions / result.totalSessions) * 1000) / 10
      : 0;

  const topDropoffStep = await db
    .select({
      step: checkoutSessions.maxStepReached,
      count: sql<number>`count(*)::int`,
    })
    .from(checkoutSessions)
    .where(
      whereClause
        ? and(whereClause, eq(checkoutSessions.isCompleted, false))
        : eq(checkoutSessions.isCompleted, false),
    )
    .groupBy(checkoutSessions.maxStepReached)
    .orderBy(sql`count(*) DESC`)
    .limit(1);

  return c.json({
    totalSessions: result.totalSessions,
    completedSessions: result.completedSessions,
    completionRate,
    avgMaxStep: result.avgMaxStep,
    topDropoffStep: topDropoffStep[0]
      ? {
          step: topDropoffStep[0].step,
          label: STEP_LABELS[topDropoffStep[0].step] ?? `Step ${topDropoffStep[0].step}`,
          count: topDropoffStep[0].count,
        }
      : null,
  });
});

analytics.delete("/sessions/:id", async (c) => {
  const sessionId = c.req.param("id");

  await db.delete(checkoutEvents).where(eq(checkoutEvents.sessionId, sessionId));
  await db.delete(checkoutSessions).where(eq(checkoutSessions.id, sessionId));

  return c.json({ ok: true });
});

const ALLOWED_TIMEZONES: Record<string, string> = {
  UTC: "UTC",
  "Asia/Dubai": "Asia/Dubai",
};

analytics.get("/sessions-over-time", async (c) => {
  const merchantIdsParam = c.req.query("merchant_ids");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const tzParam = c.req.query("timezone") ?? "UTC";
  const timezone = ALLOWED_TIMEZONES[tzParam] ?? "UTC";

  const conditions = EXCLUDED_MERCHANT_IDS.map((id) =>
    ne(checkoutSessions.merchantId, id),
  );

  if (merchantIdsParam) {
    const ids = merchantIdsParam.split(",").filter(Boolean);
    if (ids.length > 0) {
      conditions.push(inArray(checkoutSessions.merchantId, ids));
    }
  }

  if (from) {
    conditions.push(gte(checkoutSessions.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(checkoutSessions.createdAt, new Date(to)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // timezone is already validated against ALLOWED_TIMEZONES, safe to inline
  const tz = sql.raw(`'${timezone}'`);

  const rows = await db
    .select({
      date: sql<string>`DATE(${checkoutSessions.createdAt} AT TIME ZONE ${tz})::text`,
      total: sql<number>`COUNT(*)::int`,
      completed: sql<number>`COUNT(*) FILTER (WHERE ${checkoutSessions.isCompleted} = true)::int`,
    })
    .from(checkoutSessions)
    .where(whereClause)
    .groupBy(sql`1`)
    .orderBy(sql`1 ASC`);

  return c.json({ data: rows, timezone });
});

analytics.get("/today-hourly", async (c) => {
  const merchantIdsParam = c.req.query("merchant_ids");
  const tzParam = c.req.query("timezone") ?? "UTC";
  const timezone = ALLOWED_TIMEZONES[tzParam] ?? "UTC";
  const tz = sql.raw(`'${timezone}'`);

  const merchantConditions = [
    ...EXCLUDED_MERCHANT_IDS.map((id) => ne(checkoutSessions.merchantId, id)),
  ];

  if (merchantIdsParam) {
    const ids = merchantIdsParam.split(",").filter(Boolean);
    if (ids.length > 0) {
      merchantConditions.push(inArray(checkoutSessions.merchantId, ids));
    }
  }

  const baseWhere = and(...merchantConditions);

  const [todayRows, avgRows] = await Promise.all([
    db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${checkoutSessions.createdAt} AT TIME ZONE ${tz})::int`,
        total: sql<number>`COUNT(*)::int`,
        completed: sql<number>`COUNT(*) FILTER (WHERE ${checkoutSessions.isCompleted} = true)::int`,
      })
      .from(checkoutSessions)
      .where(
        and(
          baseWhere,
          sql`DATE(${checkoutSessions.createdAt} AT TIME ZONE ${tz}) = (NOW() AT TIME ZONE ${tz})::date`,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`),

    db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${checkoutSessions.createdAt} AT TIME ZONE ${tz})::int`,
        avgTotal: sql<number>`ROUND(
          COUNT(*)::numeric /
          NULLIF(COUNT(DISTINCT DATE(${checkoutSessions.createdAt} AT TIME ZONE ${tz})), 0),
          1
        )::float8`,
        avgCompleted: sql<number>`ROUND(
          COUNT(*) FILTER (WHERE ${checkoutSessions.isCompleted} = true)::numeric /
          NULLIF(COUNT(DISTINCT DATE(${checkoutSessions.createdAt} AT TIME ZONE ${tz})), 0),
          1
        )::float8`,
      })
      .from(checkoutSessions)
      .where(
        and(
          baseWhere,
          sql`DATE(${checkoutSessions.createdAt} AT TIME ZONE ${tz}) < (NOW() AT TIME ZONE ${tz})::date`,
          sql`DATE(${checkoutSessions.createdAt} AT TIME ZONE ${tz}) >= ((NOW() AT TIME ZONE ${tz})::date - INTERVAL '30 days')`,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);

  // Dubai is UTC+4 (no DST), otherwise UTC+0
  const utcHour = new Date().getUTCHours();
  const currentHour = timezone === "Asia/Dubai" ? (utcHour + 4) % 24 : utcHour;

  return c.json({ today: todayRows, average: avgRows, currentHour, timezone });
});

export default analytics;
