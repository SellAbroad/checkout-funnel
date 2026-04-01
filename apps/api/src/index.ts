import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import events from "./routes/events.js";
import analytics from "./routes/analytics.js";

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

const port = parseInt(process.env.PORT ?? "3100", 10);

console.log(`Checkout Funnel API listening on port ${port}`);
serve({ fetch: app.fetch, port });
