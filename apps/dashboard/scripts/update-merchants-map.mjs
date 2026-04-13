import postgres from "postgres";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get PRODUCTION_DATABASE_URL from environment
const connectionString = process.env.PRODUCTION_DATABASE_URL;
if (!connectionString) {
  console.error("❌ PRODUCTION_DATABASE_URL environment variable is required");
  process.exit(1);
}

const sql = postgres(connectionString);

async function updateMerchantsMap() {
  try {
    console.log("📡 Fetching merchants from production database...");

    // Fetch from shopify_store
    const shopifyMerchants = await sql`
      SELECT merchant_id, store_name
      FROM public.shopify_store
      WHERE merchant_id IS NOT NULL AND store_name IS NOT NULL
      ORDER BY merchant_id
    `;

    // Fetch from woocommerce_store
    const woocommerceMerchants = await sql`
      SELECT merchant_id, store_name
      FROM public.woocommerce_store
      WHERE merchant_id IS NOT NULL AND store_name IS NOT NULL
      ORDER BY merchant_id
    `;

    console.log(`✓ Found ${shopifyMerchants.length} Shopify merchants`);
    console.log(`✓ Found ${woocommerceMerchants.length} WooCommerce merchants`);

    // Merge into a single map (shopify takes precedence)
    const merchantMap = new Map();

    woocommerceMerchants.forEach((row) => {
      merchantMap.set(row.merchant_id, row.store_name);
    });

    shopifyMerchants.forEach((row) => {
      merchantMap.set(row.merchant_id, row.store_name);
    });

    console.log(`✓ Total unique merchants: ${merchantMap.size}`);

    // Sort by merchant ID for consistent output
    const sortedEntries = Array.from(merchantMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    // Generate TypeScript code
    const lines = ["export const MERCHANT_NAMES: Record<string, string> = {"];

    sortedEntries.forEach(([merchantId, storeName]) => {
      // Escape quotes in store names
      const escapedName = storeName.replace(/"/g, '\\"');
      lines.push(`  "${merchantId}": "${escapedName}",`);
    });

    lines.push("};");
    lines.push("");
    lines.push("export function getMerchantName(merchantId: string, fallback?: string | null): string {");
    lines.push('  return MERCHANT_NAMES[merchantId] ?? fallback ?? merchantId;');
    lines.push("}");
    lines.push("");

    const content = lines.join("\n");

    // Write to merchants-map.ts
    const mapPath = path.join(__dirname, "../src/lib/merchants-map.ts");
    fs.writeFileSync(mapPath, content, "utf-8");

    console.log(`\n✅ Successfully updated ${mapPath}`);
    console.log(`   ${merchantMap.size} merchants imported`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

updateMerchantsMap();
