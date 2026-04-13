import { Hono } from "hono";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb, ANALYTICS_TABLE } from "../lib/dynamodb-client.js";

type MetricType = "SESSION" | "ATC" | "VISITOR";
const METRIC_TYPES: MetricType[] = ["SESSION", "ATC", "VISITOR"];

const ALLOWED_TIMEZONES: Record<string, number> = {
  UTC: 0,
  "Asia/Dubai": 4,
};

// Fetch all pages for a single merchant+metric query within a date range.
async function queryAllPages(
  merchantMetric: string,
  fromIso: string,
  toIso: string,
): Promise<string[]> {
  const timestamps: string[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const cmd = new QueryCommand({
      TableName: ANALYTICS_TABLE,
      IndexName: "merchant-metric-created-index",
      KeyConditionExpression: "merchant_metric = :mm AND created_at BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":mm": merchantMetric,
        ":from": fromIso,
        ":to": toIso,
      },
      ProjectionExpression: "created_at",
      ExclusiveStartKey: lastKey,
    });

    const result = await dynamoDb.send(cmd);
    for (const item of result.Items ?? []) {
      timestamps.push(item.created_at as string);
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return timestamps;
}

// Aggregate a list of ISO timestamps into a map of hour -> count.
function groupByHour(timestamps: string[], tzOffsetHours: number): Map<number, number> {
  const counts = new Map<number, number>();
  for (const ts of timestamps) {
    const date = new Date(ts);
    const hour = (date.getUTCHours() + tzOffsetHours + 24) % 24;
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  return counts;
}

// From a list of timestamps, compute the average count per hour across distinct days.
function computeHourlyAverage(
  timestamps: string[],
  tzOffsetHours: number,
): Map<number, number> {
  // Group by day -> hour -> count
  const dayHour = new Map<string, Map<number, number>>();
  for (const ts of timestamps) {
    const date = new Date(ts);
    const localMs = date.getTime() + tzOffsetHours * 3600_000;
    const localDate = new Date(localMs);
    const day = localDate.toISOString().slice(0, 10);
    const hour = localDate.getUTCHours();

    if (!dayHour.has(day)) dayHour.set(day, new Map());
    const hourMap = dayHour.get(day)!;
    hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
  }

  const totalDays = dayHour.size || 1;

  // Sum across all days per hour, then divide by totalDays
  const totals = new Map<number, number>();
  for (const hourMap of dayHour.values()) {
    for (const [hour, count] of hourMap) {
      totals.set(hour, (totals.get(hour) ?? 0) + count);
    }
  }

  const averages = new Map<number, number>();
  for (const [hour, total] of totals) {
    averages.set(hour, Math.round((total / totalDays) * 10) / 10);
  }
  return averages;
}

const dynamoAnalytics = new Hono();

dynamoAnalytics.get("/today-hourly", async (c) => {
  const merchantIdsParam = c.req.query("merchant_ids");
  const tzParam = c.req.query("timezone") ?? "UTC";
  const tzOffsetHours = ALLOWED_TIMEZONES[tzParam] ?? 0;

  if (!merchantIdsParam) {
    return c.json({ error: "merchant_ids is required" }, 400);
  }

  const merchantIds = merchantIdsParam.split(",").filter(Boolean);

  // Compute today's bounds in UTC
  const now = new Date();
  const localNow = new Date(now.getTime() + tzOffsetHours * 3600_000);
  const todayLocal = localNow.toISOString().slice(0, 10);
  const todayStartUtc = new Date(new Date(todayLocal).getTime() - tzOffsetHours * 3600_000);
  const todayEndUtc = new Date(todayStartUtc.getTime() + 86400_000 - 1);

  const histEndUtc = new Date(todayStartUtc.getTime() - 1);
  const histStartUtc = new Date(todayStartUtc.getTime() - 30 * 86400_000);

  const currentHour = localNow.getUTCHours();

  // Parallel queries: for each merchant x metric, fetch today + historical.
  // Batched to avoid DynamoDB rate limits when many merchants are selected.
  const CONCURRENCY_LIMIT = 10;
  const todayMaps: Record<MetricType, Map<number, number>> = {
    SESSION: new Map(),
    ATC: new Map(),
    VISITOR: new Map(),
  };
  const histTimestamps: Record<MetricType, string[]> = {
    SESSION: [],
    ATC: [],
    VISITOR: [],
  };

  const tasks = merchantIds.flatMap((merchantId) =>
    METRIC_TYPES.flatMap((metric) => [
      () =>
        queryAllPages(
          `${merchantId}#${metric}`,
          todayStartUtc.toISOString(),
          todayEndUtc.toISOString(),
        ).then((ts) => {
          const hourly = groupByHour(ts, tzOffsetHours);
          for (const [hour, count] of hourly) {
            todayMaps[metric].set(hour, (todayMaps[metric].get(hour) ?? 0) + count);
          }
        }),
      () =>
        queryAllPages(
          `${merchantId}#${metric}`,
          histStartUtc.toISOString(),
          histEndUtc.toISOString(),
        ).then((ts) => {
          histTimestamps[metric].push(...ts);
        }),
    ]),
  );

  // Run tasks in batches of CONCURRENCY_LIMIT
  for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
    await Promise.all(tasks.slice(i, i + CONCURRENCY_LIMIT).map((t) => t()));
  }

  // Build 24-hour arrays
  const avgMaps: Record<MetricType, Map<number, number>> = {
    SESSION: computeHourlyAverage(histTimestamps.SESSION, tzOffsetHours),
    ATC: computeHourlyAverage(histTimestamps.ATC, tzOffsetHours),
    VISITOR: computeHourlyAverage(histTimestamps.VISITOR, tzOffsetHours),
  };

  const today = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    sessions: todayMaps.SESSION.get(h) ?? 0,
    atc: todayMaps.ATC.get(h) ?? 0,
    visitors: todayMaps.VISITOR.get(h) ?? 0,
  }));

  const average = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    avgSessions: avgMaps.SESSION.get(h) ?? 0,
    avgAtc: avgMaps.ATC.get(h) ?? 0,
    avgVisitors: avgMaps.VISITOR.get(h) ?? 0,
  }));

  return c.json({ today, average, currentHour, timezone: tzParam });
});

export default dynamoAnalytics;
