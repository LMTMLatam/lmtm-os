// TEMP — dar el toolkit proactivo a TODOS los agentes. Delete after use.
// Core proactivo: analizar clientes + crear tareas + proponer + memoria + baúl/tendencias.
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });
const CORE = [
  "lmtmListClients", "lmtmGetClientBrain", "lmtmGetClientAdsPerformance", "lmtmGetClientCompetitors",
  "lmtmGetClientScores", "lmtmGetClientBalance", "lmtmGetClientOrganicPosts", "lmtmGetClientScheduledContent",
  "lmtmGetNicheIntel", "lmtmPortfolioSnapshot", "lmtmGetTeamStatus", "lmtmGetTeamLessons",
  "lmtmCreateClientTask", "lmtmRememberAboutClient", "lmtmRememberTeamLesson",
  "lmtmSaveDeliverable", "lmtmListDeliverables",
  "lmtmSaveHook", "lmtmSearchHooks", "lmtmSaveTrend",
];
try {
  const rows = await sql`select id, name, adapter_config from agents order by name`;
  for (const r of rows) {
    const cfg = r.adapter_config ?? {};
    const cur = String(cfg.env?.PAPERCLIP_MCP_TOOLS ?? "");
    if (!cur) { console.log(r.name, "— sin PAPERCLIP_MCP_TOOLS (adapter distinto?), salto"); continue; }
    const list = cur.split(",").map((s) => s.trim()).filter(Boolean);
    const add = CORE.filter((t) => !list.includes(t));
    if (!add.length) { console.log(r.name, "— completo"); continue; }
    cfg.env = { ...cfg.env, PAPERCLIP_MCP_TOOLS: [...list, ...add].join(",") };
    await sql`update agents set adapter_config = ${sql.json(cfg)} where id = ${r.id}`;
    console.log(r.name, "— +" + add.length + ":", add.join(","));
  }
} finally { await sql.end(); }
