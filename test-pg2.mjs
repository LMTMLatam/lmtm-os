process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const base = new URL(".", import.meta.url).href;

const postgresModule = await import(new URL("node_modules/.pnpm/postgres@3.4.8/node_modules/postgres/src/index.js", base).href);
const postgres = postgresModule.default;

// Try with 'require' string (not object) and explicit connect_timeout
const sql = postgres({
  host: "dpg-d83omsjtqb8s73cvnbq0-a.oregon-postgres.render.com",
  port: 5432,
  database: "lmtm",
  username: "lmtm",
  password: "o64N8iiuokJHGCrfHiM0KkXnXZJifeOI",
  ssl: "require",
  connect_timeout: 10,
  idle_timeout: 5,
  max: 1,
});

console.log("Querying...");
try {
  const result = await sql`SELECT COUNT(*) as cnt FROM meta_ad_account_mappings WHERE company_id = 'e3400d17-6cdd-4d05-a3bb-49ccc38db17d'`;
  console.log("Result:", result);
} catch(e) {
  console.error("Error:", e.message, e.code);
}
await sql.end({ timeout: 3 });
