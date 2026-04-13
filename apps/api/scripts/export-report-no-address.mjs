import dotenv from "dotenv";

/**
 * Export sessions without sa_checkout_address_selected (NOT EXISTS that event).
 *
 * Usage (from apps/api):
 *   node scripts/export-report-no-address.mjs                    # last 100 -> last100-no-address.{md,xlsx}
 *   node scripts/export-report-no-address.mjs --all              # all rows -> all-sessions-no-address.{md,xlsx}
 *   node scripts/export-report-no-address.mjs --limit 500      # cap -> last100-no-address.*
 *   node scripts/export-report-no-address.mjs --completed-only # cart completed but no address event -> completed-without-address.{md,xlsx}
 *
 * Clarity link matches dashboard SessionsTable (impressions by cart id).
 * CLARITY_PROJECT_ID in apps/api/.env (same as dashboard VITE_CLARITY_PROJECT_ID).
 */
import postgres from "postgres";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const EXCLUDED = "01KE79ZTMNNC5S72FGJRYW43QB";

/** Same URL pattern as apps/dashboard/src/components/SessionsTable.tsx */
function buildClarityImpressionsUrl(clarityProjectId, cartId) {
  if (!clarityProjectId?.trim() || !cartId) return "";
  const pid = clarityProjectId.trim();
  return `https://clarity.microsoft.com/projects/view/${pid}/impressions?URL=2%3B2%3B${cartId}&date=Last%2060%20days`;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required (apps/api/.env)");
  process.exit(1);
}

const clarityProjectId =
  process.env.CLARITY_PROJECT_ID?.trim() ||
  process.env.VITE_CLARITY_PROJECT_ID?.trim() ||
  "";

const sql = postgres(connectionString, { max: 1 });

const argv = process.argv.slice(2);
const completedOnly = argv.includes("--completed-only");
const exportAll = argv.includes("--all");
const limitIdx = argv.indexOf("--limit");
let rowLimit = 100;
if (limitIdx !== -1 && argv[limitIdx + 1]) {
  const n = parseInt(argv[limitIdx + 1], 10);
  if (!Number.isNaN(n) && n > 0) rowLimit = n;
}
if (exportAll) {
  rowLimit = null;
}

let baseName = exportAll ? "all-sessions-no-address" : "last100-no-address";
let sheetName = "no_address_event";

if (completedOnly) {
  baseName = "completed-without-address";
  sheetName = "completed_no_address";
  rowLimit = null;
}

const rows = completedOnly
  ? await sql`
      SELECT
        s.id AS session_id,
        s.cart_id AS cart_id,
        s.clarity_session_id AS clarity_session_id,
        s.country_code AS country,
        s.shop_url AS store,
        s.is_completed AS cart_completed,
        s.cart_amount_cents AS amount_cents,
        s.currency_code AS currency,
        s.max_step_reached,
        s.created_at
      FROM checkout_sessions s
      WHERE s.merchant_id <> ${EXCLUDED}
        AND s.is_completed = true
        AND NOT EXISTS (
          SELECT 1 FROM checkout_events e
          WHERE e.session_id = s.id AND e.event_name = 'sa_checkout_address_selected'
        )
      ORDER BY s.created_at DESC
    `
  : rowLimit === null
    ? await sql`
        SELECT
          s.id AS session_id,
          s.cart_id AS cart_id,
          s.clarity_session_id AS clarity_session_id,
          s.country_code AS country,
          s.shop_url AS store,
          s.is_completed AS cart_completed,
          s.cart_amount_cents AS amount_cents,
          s.currency_code AS currency,
          s.max_step_reached,
          s.created_at
        FROM checkout_sessions s
        WHERE s.merchant_id <> ${EXCLUDED}
          AND NOT EXISTS (
            SELECT 1 FROM checkout_events e
            WHERE e.session_id = s.id AND e.event_name = 'sa_checkout_address_selected'
          )
        ORDER BY s.created_at DESC
      `
    : await sql`
        SELECT
          s.id AS session_id,
          s.cart_id AS cart_id,
          s.clarity_session_id AS clarity_session_id,
          s.country_code AS country,
          s.shop_url AS store,
          s.is_completed AS cart_completed,
          s.cart_amount_cents AS amount_cents,
          s.currency_code AS currency,
          s.max_step_reached,
          s.created_at
        FROM checkout_sessions s
        WHERE s.merchant_id <> ${EXCLUDED}
          AND NOT EXISTS (
            SELECT 1 FROM checkout_events e
            WHERE e.session_id = s.id AND e.event_name = 'sa_checkout_address_selected'
          )
        ORDER BY s.created_at DESC
        LIMIT ${rowLimit}
      `;

const outDir = __dirname;

const sheetRows = rows.map((r) => {
  const cartId = r.cart_id ?? "";
  const clarityLink = buildClarityImpressionsUrl(clarityProjectId, cartId);
  const val =
    r.amount_cents == null ? "" : `${r.amount_cents} ${r.currency ?? ""}`.trim();
  const created =
    r.created_at instanceof Date
      ? r.created_at.toISOString()
      : String(r.created_at ?? "");
  return {
    session_id: r.session_id,
    cart_id: cartId,
    country: r.country ?? "",
    store: r.store ?? "",
    cart_completed: r.cart_completed ? "yes" : "no",
    amount_minor_units: r.amount_cents ?? "",
    currency: r.currency ?? "",
    max_step_reached: r.max_step_reached ?? "",
    clarity_session_id: r.clarity_session_id ?? "",
    clarity_link: clarityLink || "(set CLARITY_PROJECT_ID in apps/api/.env)",
    created_at_utc: created,
  };
});

// --- Markdown
let md = `| Session ID | Cart ID | País | Loja | Cart completado | Valor (minor) | Moeda | max_step | clarity_session_id | Link Clarity |\n`;
md += `|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) {
  const cartId = r.cart_id ?? "";
  const clarityLink = buildClarityImpressionsUrl(clarityProjectId, cartId);
  const val = r.amount_cents == null ? "-" : String(r.amount_cents);
  const store = String(r.store ?? "-").replace(/\|/g, "/");
  const linkCell = clarityLink || "-";
  md += `| ${r.session_id} | \`${cartId}\` | ${r.country ?? "-"} | ${store} | ${r.cart_completed} | ${val} | ${r.currency ?? "-"} | ${r.max_step_reached} | ${r.clarity_session_id ?? "-"} | ${linkCell} |\n`;
}

const mdPath = path.join(outDir, `${baseName}.md`);
fs.writeFileSync(mdPath, md, "utf8");
console.log(`Wrote ${rows.length} rows to ${mdPath}`);

// --- Excel
const ws = XLSX.utils.json_to_sheet(sheetRows);
const colWidths = [
  { wch: 38 },
  { wch: 28 },
  { wch: 6 },
  { wch: 36 },
  { wch: 14 },
  { wch: 12 },
  { wch: 8 },
  { wch: 10 },
  { wch: 28 },
  { wch: 90 },
  { wch: 26 },
];
ws["!cols"] = colWidths;
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, sheetName);

const xlsxPath = path.join(outDir, `${baseName}.xlsx`);
const xlsxFallback = path.join(outDir, `${baseName}-export.xlsx`);
try {
  XLSX.writeFile(wb, xlsxPath);
  console.log(`Wrote ${rows.length} rows to ${xlsxPath}`);
} catch (err) {
  const code = err && typeof err === "object" && "code" in err ? err.code : "";
  if (code === "EBUSY" || code === "EPERM") {
    XLSX.writeFile(wb, xlsxFallback);
    console.log(
      `Wrote ${rows.length} rows to ${xlsxFallback} (primary xlsx was locked — close it and re-run)`,
    );
  } else {
    throw err;
  }
}

if (!clarityProjectId) {
  console.warn(
    "Tip: add CLARITY_PROJECT_ID to apps/api/.env (dashboard VITE_CLARITY_PROJECT_ID) to fill clarity_link.",
  );
}

await sql.end({ timeout: 5 });
