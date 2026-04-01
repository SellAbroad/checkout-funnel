import { Hono } from "hono";
import { sql, eq, ne, and, gte, lte, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { checkoutSessions, checkoutEvents } from "../db/schema.js";
import { STEP_LABELS, FUNNEL_STEPS } from "../lib/step-order.js";

const EXCLUDED_MERCHANT_IDS = ["01KE79ZTMNNC5S72FGJRYW43QB"];

const analytics = new Hono();

analytics.get("/funnel", async (c) => {
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

  const rows = await db
    .select({
      step: checkoutSessions.maxStepReached,
      count: sql<number>`count(*)::int`,
    })
    .from(checkoutSessions)
    .where(whereClause)
    .groupBy(checkoutSessions.maxStepReached);

  const totalSessions = rows.reduce((sum, r) => sum + r.count, 0);

  const cumulativeCounts: Record<number, number> = {};
  for (const step of FUNNEL_STEPS) {
    cumulativeCounts[step] = rows
      .filter((r) => r.step >= step)
      .reduce((sum, r) => sum + r.count, 0);
  }

  const funnel = FUNNEL_STEPS.map((step, i) => {
    const count = cumulativeCounts[step] ?? 0;
    const prevCount = i > 0 ? (cumulativeCounts[FUNNEL_STEPS[i - 1]] ?? 0) : totalSessions;
    const dropoffRate = prevCount > 0 ? ((prevCount - count) / prevCount) * 100 : 0;

    return {
      step,
      label: STEP_LABELS[step],
      count,
      percentOfTotal: totalSessions > 0 ? (count / totalSessions) * 100 : 0,
      dropoffRate: Math.round(dropoffRate * 10) / 10,
    };
  });

  return c.json({
    totalSessions,
    funnel,
    filters: { merchantId, from, to },
  });
});

analytics.get("/sessions", async (c) => {
  const merchantId = c.req.query("merchant_id");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const maxStep = c.req.query("max_step");
  const completedOnly = c.req.query("completed");
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

  return c.json({
    sessions: sessions.map((s) => ({
      ...s,
      maxStepLabel: STEP_LABELS[s.maxStepReached] ?? `Step ${s.maxStepReached}`,
    })),
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

export default analytics;
