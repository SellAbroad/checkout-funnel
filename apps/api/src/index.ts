import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import events from "./routes/events.js";
import analytics from "./routes/analytics.js";
import productionAnalytics from "./routes/production-analytics.js";
import dynamoAnalytics from "./routes/dynamodb-analytics.js";
import admin from "./routes/admin.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/events", events);
app.route("/analytics", analytics);
app.route("/production-analytics", productionAnalytics);
app.route("/dynamodb-analytics", dynamoAnalytics);
app.route("/api/admin", admin);

const port = parseInt(process.env.PORT ?? "3100", 10);

console.log(`Checkout Funnel API listening on port ${port}`);
serve({ fetch: app.fetch, port });
