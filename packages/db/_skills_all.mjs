// TEMP — asignar lmtm-proactividad a todos los agentes. Delete after use.
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });
try {
  const rows = await sql`select id, name, adapter_config from agents order by name`;
  // primero mostrar el shape de uno
  const sample = rows.find((r) => r.adapter_config?.paperclipSkillSync);
  console.log("shape ejemplo:", JSON.stringify(sample?.adapter_config?.paperclipSkillSync ?? null).slice(0, 200));
  for (const r of rows) {
    const cfg = r.adapter_config ?? {};
    const sync = cfg.paperclipSkillSync ?? {};
    const desired = Array.isArray(sync.desiredSkills) ? sync.desiredSkills : [];
    if (desired.includes("lmtm-proactividad")) { console.log(r.name, "— ya la tiene"); continue; }
    cfg.paperclipSkillSync = { ...sync, desiredSkills: [...desired, "lmtm-proactividad"] };
    await sql`update agents set adapter_config = ${sql.json(cfg)} where id = ${r.id}`;
    console.log(r.name, "— skill agregada (total", desired.length + 1 + ")");
  }
} finally { await sql.end(); }
