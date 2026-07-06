// TEMP — inspect raw keys of creatives to find the video signal. Delete after use.
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });
try {
  const rows = await sql`select raw from ads_creatives where client_id is not null limit 40`;
  const keyCount = {};
  for (const r of rows) {
    const raw = r.raw ?? {};
    for (const k of Object.keys(raw)) keyCount[k] = (keyCount[k] ?? 0) + 1;
    const cr = raw.creative ?? {};
    for (const k of Object.keys(cr)) keyCount["creative." + k] = (keyCount["creative." + k] ?? 0) + 1;
  }
  console.log(JSON.stringify(keyCount, null, 0));
  // one full sample truncated
  console.log("SAMPLE:", JSON.stringify(rows[0]?.raw ?? {}).slice(0, 700));
} finally { await sql.end(); }
