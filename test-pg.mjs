process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const base = new URL(".", import.meta.url).href;
const { default: pg } = await import(new URL("node_modules/.pnpm/pg@8.18.0/node_modules/pg/lib/index.js", base).href);
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://lmtm:o64N8iiuokJHGCrfHiM0KkXnXZJifeOI@dpg-d83omsjtqb8s73cvnbq0-a.oregon-postgres.render.com:5432/lmtm",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  query_timeout: 10000,
});

console.log("Connecting with pg...");
await client.connect();
console.log("Connected!");
const r1 = await client.query("SELECT COUNT(*) as cnt FROM meta_ad_account_mappings WHERE company_id = $1", ["e3400d17-6cdd-4d05-a3bb-49ccc38db17d"]);
console.log("Mappings count:", r1.rows);
const r2 = await client.query("SELECT COUNT(*) as cnt, MAX(date) as max_date FROM meta_ads_insights WHERE company_id = $1", ["e3400d17-6cdd-4d05-a3bb-49ccc38db17d"]);
console.log("Insights:", r2.rows);
const r3 = await client.query("SELECT job_name, status, records_synced, error, completed_at FROM sync_logs WHERE company_id = $1 ORDER BY created_at DESC LIMIT 5", ["e3400d17-6cdd-4d05-a3bb-49ccc38db17d"]);
console.log("Recent sync logs:", r3.rows);
await client.end();
