// TEMP — clean all [PRUEBA] test artifacts + revoke temp keys. Delete after use.
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });
try {
  const r1 = await sql`delete from hooks where text like '[PRUEBA%' returning id`;
  const r2 = await sql`delete from trends where title like '[PRUEBA%' returning id`;
  const r3 = await sql`delete from agent_deliverables where title like '[PRUEBA%' returning id`;
  const r4 = await sql`delete from client_memory where key = 'prueba-loop' returning id`;
  const r5 = await sql`delete from learnings where scope = 'team' and scope_key = 'prueba-loop' returning id`;
  const r6 = await sql`update board_api_keys set revoked_at = now() where name = 'loop-test-temp' and revoked_at is null returning id`;
  const r7 = await sql`update agent_api_keys set revoked_at = now() where name = 'loop-test-temp-agent' and revoked_at is null returning id`;
  console.log(`hooks:${r1.length} trends:${r2.length} deliverables:${r3.length} memoria:${r4.length} lecciones:${r5.length} boardKeys:${r6.length} agentKeys:${r7.length}`);
} finally { await sql.end(); }
