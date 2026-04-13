import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./production-schema.js";

const connectionString = process.env.PRODUCTION_DATABASE_URL;

// Production DB is optional — endpoints degrade gracefully if not configured
export const productionDb = connectionString
  ? drizzle(postgres(connectionString, { max: 3 }), { schema })
  : null;
