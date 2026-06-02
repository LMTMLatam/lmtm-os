/**
 * Direct test script — bypasses HTTP auth, calls syncAdsInsights directly.
 * Run: node test-sync.mjs
 */

const DATABASE_URL = "postgresql://lmtm:o64N8iiuokJHGCrfHiM0KkXnXZJifeOI@dpg-d83omsjtqb8s73cvnbq0-a.oregon-postgres.render.com:5432/lmtm?sslmode=require";
const COMPANY_ID   = "e3400d17-6cdd-4d05-a3bb-49ccc38db17d";
const SINCE        = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
const UNTIL        = new Date().toISOString().slice(0, 10);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Use import.meta.url to construct proper file URLs
const base = new URL(".", import.meta.url).href;

const postgresModule = await import(new URL("node_modules/.pnpm/postgres@3.4.8/node_modules/postgres/src/index.js", base).href);
const postgres = postgresModule.default;

const drizzlePkgPath = "node_modules/.pnpm/drizzle-orm@0.45.2_@electric-sql+pglite@0.3.15_kysely@0.28.11_pg@8.18.0_postgres@3.4.8_sqlite3@5.1.7/node_modules/drizzle-orm/postgres-js/index.js";
const drizzleModule  = await import(new URL(drizzlePkgPath, base).href);
const { drizzle }    = drizzleModule;

const schemaModule = await import(new URL("packages/db/dist/schema/index.js", base).href);

const { syncAdsInsights, getDashboardData } = await import(new URL("server/dist/services/meta-sync.js", base).href);

console.log("Connecting to DB with SSL...");
const sql = postgres(DATABASE_URL, { ssl: { rejectUnauthorized: false } });
const db  = drizzle(sql, { schema: schemaModule });

console.log(`Syncing insights for ${COMPANY_ID} from ${SINCE} to ${UNTIL}...`);
try {
  const result = await syncAdsInsights(db, { companyId: COMPANY_ID, since: SINCE, until: UNTIL });
  console.log("Sync result:", JSON.stringify(result, null, 2));

  if (result.errors?.length) {
    console.error("⚠ Errors:", result.errors.join("\n"));
    if (result.synced === 0) { await sql.end(); process.exit(1); }
  }

  console.log(`\n✓ Synced ${result.synced} records.`);

  if (result.synced > 0) {
    console.log("\nFetching dashboard...");
    const dash = await getDashboardData(db, COMPANY_ID, { since: SINCE, until: UNTIL });
    console.log("Totals:", JSON.stringify(dash.totals, null, 2));
    console.log(`✅ CONFIRMED: ${dash.byCampaign.length} campaigns, spend=${dash.totals.spend}`);
  }
} catch (err) {
  console.error("Fatal error:", err.message);
  console.error("Cause:", err.cause?.message ?? "(none)");
  await sql.end();
  process.exit(1);
}

await sql.end();
process.exit(0);
