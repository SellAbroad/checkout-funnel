import { Hono } from "hono";
import { sql, and, isNull, inArray } from "drizzle-orm";
import { productionDb } from "../db/production-client.js";
import { orderInfo, cart } from "../db/production-schema.js";

const ALLOWED_TIMEZONES: Record<string, string> = {
  UTC: "UTC",
  "Asia/Dubai": "Asia/Dubai",
};

// Converts transaction_amount_cents to USD using the locked_in_fx_rates JSONB column.
// Formula mirrors order-financial-calculations.ts in ormulus:
//   amount_in_currency = cents / divisor (1000 for KWD/BHD/OMR/JOD/TND, 100 for others)
//   gmv_usd = amount_in_currency * fx_rate (from locked_in_fx_rates or 1.0 for USD)
const gmvUsdExpr = sql<number>`
  (${orderInfo.transactionAmountCents}::float /
    CASE WHEN UPPER(${orderInfo.transactionCurrency}) IN ('KWD','BHD','OMR','JOD','TND')
      THEN 1000 ELSE 100
    END
  ) * COALESCE(
    (${orderInfo.lockedInFxRates}->>(LOWER(${orderInfo.transactionCurrency}) || ':usd'))::float,
    CASE WHEN UPPER(${orderInfo.transactionCurrency}) = 'USD' THEN 1.0 ELSE 0 END
  )
`;

const productionAnalytics = new Hono();

productionAnalytics.get("/today-hourly", async (c) => {
  if (!productionDb) {
    return c.json({ error: "PRODUCTION_DATABASE_URL not configured" }, 503);
  }

  const tzParam = c.req.query("timezone") ?? "UTC";
  const timezone = ALLOWED_TIMEZONES[tzParam] ?? "UTC";
  const tz = sql.raw(`'${timezone}'`);
  const merchantIdsParam = c.req.query("merchant_ids");
  const merchantIds = merchantIdsParam ? merchantIdsParam.split(",").filter(Boolean) : [];

  // No payment_status filter — matches admin dashboard behavior (deleted_at IS NULL only)
  const merchantFilter = merchantIds.length > 0 ? inArray(orderInfo.merchantId, merchantIds) : undefined;
  const baseWhere = merchantFilter ? and(isNull(orderInfo.deletedAt), merchantFilter) : isNull(orderInfo.deletedAt);
  const historicalWhere = and(
    baseWhere,
    sql`DATE(${orderInfo.createdAt} AT TIME ZONE ${tz}) < (NOW() AT TIME ZONE ${tz})::date`,
    sql`DATE(${orderInfo.createdAt} AT TIME ZONE ${tz}) >= ((NOW() AT TIME ZONE ${tz})::date - INTERVAL '30 days')`,
  );

  const utcHour = new Date().getUTCHours();
  const currentHour = timezone === "Asia/Dubai" ? (utcHour + 4) % 24 : utcHour;

  // Fetch total distinct days in the 30-day window first, so the per-hour average
  // divides by the total window size — not just the days that had orders at that hour.
  const [daysResult, todayRows, avgRows] = await Promise.all([
    productionDb
      .select({ count: sql<number>`COUNT(DISTINCT DATE(${orderInfo.createdAt} AT TIME ZONE ${tz}))::int` })
      .from(orderInfo)
      .where(historicalWhere),

    productionDb
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${orderInfo.createdAt} AT TIME ZONE ${tz})::int`,
        orders: sql<number>`COUNT(*)::int`,
        gmvUsd: sql<number>`ROUND(COALESCE(SUM(${gmvUsdExpr}), 0)::numeric, 2)::float8`,
      })
      .from(orderInfo)
      .where(
        and(
          baseWhere,
          sql`DATE(${orderInfo.createdAt} AT TIME ZONE ${tz}) = (NOW() AT TIME ZONE ${tz})::date`,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`),

    productionDb
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${orderInfo.createdAt} AT TIME ZONE ${tz})::int`,
        totalOrders: sql<number>`COUNT(*)::int`,
        totalGmvUsd: sql<number>`ROUND(COALESCE(SUM(${gmvUsdExpr}), 0)::numeric, 2)::float8`,
      })
      .from(orderInfo)
      .where(historicalWhere)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);

  const totalDays = daysResult[0]?.count ?? 30;

  const avgRowsMapped = avgRows.map((row) => ({
    hour: row.hour,
    avgOrders: Math.round((row.totalOrders / totalDays) * 100) / 100,
    avgGmvUsd: Math.round((row.totalGmvUsd / totalDays) * 100) / 100,
  }));

  return c.json({ today: todayRows, average: avgRowsMapped, currentHour, timezone });
});

productionAnalytics.get("/carts-today-hourly", async (c) => {
  if (!productionDb) {
    return c.json({ error: "PRODUCTION_DATABASE_URL not configured" }, 503);
  }

  const tzParam = c.req.query("timezone") ?? "UTC";
  const timezone = ALLOWED_TIMEZONES[tzParam] ?? "UTC";
  const tz = sql.raw(`'${timezone}'`);

  const notDeleted = isNull(cart.deletedAt);
  const cartHistoricalWhere = and(
    notDeleted,
    sql`DATE(${cart.createdAt} AT TIME ZONE ${tz}) < (NOW() AT TIME ZONE ${tz})::date`,
    sql`DATE(${cart.createdAt} AT TIME ZONE ${tz}) >= ((NOW() AT TIME ZONE ${tz})::date - INTERVAL '30 days')`,
  );

  const utcHour = new Date().getUTCHours();
  const currentHour = timezone === "Asia/Dubai" ? (utcHour + 4) % 24 : utcHour;

  const [cartDaysResult, todayRows, avgRows] = await Promise.all([
    productionDb
      .select({ count: sql<number>`COUNT(DISTINCT DATE(${cart.createdAt} AT TIME ZONE ${tz}))::int` })
      .from(cart)
      .where(cartHistoricalWhere),

    productionDb
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${cart.createdAt} AT TIME ZONE ${tz})::int`,
        total: sql<number>`COUNT(*)::int`,
        completed: sql<number>`COUNT(*) FILTER (WHERE ${cart.completedAt} IS NOT NULL)::int`,
      })
      .from(cart)
      .where(
        and(
          notDeleted,
          sql`DATE(${cart.createdAt} AT TIME ZONE ${tz}) = (NOW() AT TIME ZONE ${tz})::date`,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`),

    productionDb
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${cart.createdAt} AT TIME ZONE ${tz})::int`,
        totalCarts: sql<number>`COUNT(*)::int`,
        totalCompleted: sql<number>`COUNT(*) FILTER (WHERE ${cart.completedAt} IS NOT NULL)::int`,
      })
      .from(cart)
      .where(cartHistoricalWhere)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);

  const totalCartDays = cartDaysResult[0]?.count ?? 30;

  const avgRowsMapped = avgRows.map((row) => ({
    hour: row.hour,
    avgTotal: Math.round((row.totalCarts / totalCartDays) * 10) / 10,
    avgCompleted: Math.round((row.totalCompleted / totalCartDays) * 10) / 10,
  }));

  return c.json({ today: todayRows, average: avgRowsMapped, currentHour, timezone });
});

/** Cumulative GMV (USD) by day-of-month: current month vs previous month + forecast for rest of current month. */
productionAnalytics.get("/monthly-growth", async (c) => {
  if (!productionDb) {
    return c.json({ error: "PRODUCTION_DATABASE_URL not configured" }, 503);
  }

  const tzParam = c.req.query("timezone") ?? "UTC";
  const timezone = ALLOWED_TIMEZONES[tzParam] ?? "UTC";
  const tz = sql.raw(`'${timezone}'`);
  const merchantIdsParam = c.req.query("merchant_ids");
  const merchantIds = merchantIdsParam ? merchantIdsParam.split(",").filter(Boolean) : [];

  const merchantFilter = merchantIds.length > 0 ? inArray(orderInfo.merchantId, merchantIds) : undefined;
  const baseWhere = merchantFilter ? and(isNull(orderInfo.deletedAt), merchantFilter) : isNull(orderInfo.deletedAt);

  const dateCol = sql`DATE(${orderInfo.createdAt} AT TIME ZONE ${tz})`;

  const currentMonthWhere = and(
    baseWhere,
    sql`${dateCol} >= DATE_TRUNC('month', (NOW() AT TIME ZONE ${tz})::timestamp)::date`,
    sql`${dateCol} <= (DATE_TRUNC('month', (NOW() AT TIME ZONE ${tz})::timestamp) + INTERVAL '1 month - 1 day')::date`,
  );

  const prevMonthWhere = and(
    baseWhere,
    sql`${dateCol} >= (DATE_TRUNC('month', (NOW() AT TIME ZONE ${tz})::timestamp) - INTERVAL '1 month')::date`,
    sql`${dateCol} < DATE_TRUNC('month', (NOW() AT TIME ZONE ${tz})::timestamp)::date`,
  );

  const dailySelect = {
    dom: sql<number>`EXTRACT(DAY FROM ${dateCol})::int`,
    dailyGmvUsd: sql<number>`ROUND(COALESCE(SUM(${gmvUsdExpr}), 0)::numeric, 2)::float8`,
  };

  const [currentDaily, prevDaily] = await Promise.all([
    productionDb
      .select(dailySelect)
      .from(orderInfo)
      .where(currentMonthWhere)
      .groupBy(sql`EXTRACT(DAY FROM ${dateCol})`)
      .orderBy(sql`EXTRACT(DAY FROM ${dateCol})`),
    productionDb
      .select(dailySelect)
      .from(orderInfo)
      .where(prevMonthWhere)
      .groupBy(sql`EXTRACT(DAY FROM ${dateCol})`)
      .orderBy(sql`EXTRACT(DAY FROM ${dateCol})`),
  ]);

  const curMap = new Map(currentDaily.map((r) => [r.dom, r.dailyGmvUsd]));
  const prevMap = new Map(prevDaily.map((r) => [r.dom, r.dailyGmvUsd]));

  // Calendar metadata in Node (same TZ as API queries)
  const tzName = timezone === "Asia/Dubai" ? "Asia/Dubai" : "UTC";
  const calStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: tzName,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, mo, todayDom] = calStr.split("-").map(Number);
  const daysInCurrentMonth = new Date(y, mo, 0).getDate();
  const prevMonthEnd = new Date(y, mo - 1, 0);
  const daysInPrevMonth = prevMonthEnd.getDate();
  const prevMonthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: tzName }).format(
    new Date(y, mo - 2, 15),
  );
  const currentMonthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: tzName }).format(
    new Date(y, mo - 1, 15),
  );

  let prevCum = 0;
  const previousMonthCumulative: { day: number; gmvUsd: number }[] = [];
  for (let d = 1; d <= daysInPrevMonth; d++) {
    prevCum += prevMap.get(d) ?? 0;
    previousMonthCumulative.push({ day: d, gmvUsd: Math.round(prevCum * 100) / 100 });
  }

  let running = 0;
  const currentCumulativeByDay = new Map<number, number>();
  for (let d = 1; d <= daysInCurrentMonth; d++) {
    running += curMap.get(d) ?? 0;
    currentCumulativeByDay.set(d, Math.round(running * 100) / 100);
  }

  const cumAtToday = currentCumulativeByDay.get(todayDom) ?? 0;
  const dailyAvgDen = Math.max(todayDom, 1);
  const dailyAvg = cumAtToday / dailyAvgDen;

  const points: {
    day: number;
    previousMonthCumulative: number | null;
    currentActual: number | null;
    currentForecast: number | null;
  }[] = [];

  const maxDay = Math.max(daysInCurrentMonth, daysInPrevMonth, 31);
  for (let day = 1; day <= maxDay; day++) {
    const prevVal = day <= daysInPrevMonth ? previousMonthCumulative[day - 1]?.gmvUsd ?? null : null;

    let actual: number | null = null;
    let forecast: number | null = null;

    if (day <= daysInCurrentMonth) {
      if (day <= todayDom) {
        actual = currentCumulativeByDay.get(day) ?? 0;
      } else {
        forecast = Math.round((cumAtToday + dailyAvg * (day - todayDom)) * 100) / 100;
      }
    }

    points.push({
      day,
      previousMonthCumulative: prevVal,
      currentActual: actual,
      currentForecast: forecast,
    });
  }

  return c.json({
    timezone,
    currentMonthLabel,
    previousMonthLabel: prevMonthLabel,
    todayDayOfMonth: todayDom,
    daysInCurrentMonth,
    daysInPreviousMonth: daysInPrevMonth,
    dailyAvgUsd: Math.round(dailyAvg * 100) / 100,
    cumulativeToDateUsd: cumAtToday,
    points,
  });
});

export default productionAnalytics;
