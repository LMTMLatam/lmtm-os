// TEMP — mint a short-lived agent API key (Caro) for tool testing. Delete after use.
import postgres from "postgres";
import { createHash, randomBytes } from "node:crypto";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });
const token = randomBytes(24).toString("hex");
const hash = createHash("sha256").update(token).digest("hex");
try {
  const [a] = await sql`select id, company_id from agents where name ilike 'caro%' limit 1`;
  await sql`insert into agent_api_keys (agent_id, company_id, name, key_hash)
            values (${a.id}, ${a.company_id}, ${"loop-test-temp-agent"}, ${hash})`;
  console.log("AGENT_TOKEN=" + token);
} finally { await sql.end(); }
