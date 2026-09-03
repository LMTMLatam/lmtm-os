// Migrate agents claude_local → hermes_local (Nous Hermes Agent CLI, provider
// MiniMax). Usage:
//   node hermes-migrate.mjs backup            → full backup of the 14 to stdout-file
//   node hermes-migrate.mjs convert Sergio    → convert one agent by name prefix
//   node hermes-migrate.mjs convert-rest      → convert every claude_local agent left
//   node hermes-migrate.mjs rollback <name>   → restore one agent from the backup file
import postgres from "postgres";
import { readFileSync, writeFileSync } from "fs";
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: false, prepare: false });
const BACKUP = "C:/Users/Administrator/Downloads/lmtm-agents-backup-pre-hermes-2026-07-12.json";

const OPS_BLOCK = `

---

# Operación (Paperclip — tools MCP)
Tenés las tools MCP de Paperclip (paperclip*) y de LMTM (lmtm*) — usalas SIEMPRE; NO uses curl contra la API.

{{#taskId}}
## Tarea asignada
Issue: {{taskId}} — {{taskTitle}}

{{taskBody}}

Flujo: si necesitás más contexto leé el issue (paperclipGetIssue) y sus comentarios (paperclipListComments). Hacé el trabajo con tus tools. Al terminar: comentá el resultado (paperclipAddComment) y cerrá el issue (paperclipUpdateIssue status=done; blocked SOLO si hay bloqueo humano real y explicá cuál).
{{/taskId}}
{{#commentId}}
## Comentario nuevo en tu issue ({{taskId}})
Leelo con paperclipListComments, respondé si corresponde y continuá el trabajo.
{{/commentId}}
{{#noTask}}
## Heartbeat sin tarea puntual
Listá tus issues abiertos (paperclipListIssues) y trabajá el de mayor prioridad. Si no tenés nada, reportá breve qué chequeaste — no inventes trabajo.
{{/noTask}}`;

function hermesConfig(old) {
  const oldEnv = old.adapter_config?.env ?? {};
  const persona = (old.adapter_config?.systemPrompt ?? "").trim();
  return {
    hermesCommand: "/usr/local/bin/hermes",
    provider: "minimax",
    model: "MiniMax-M3",
    timeoutSec: 300,
    quiet: false,
    persistSession: true,
    cwd: "/tmp",
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      ...(oldEnv.PAPERCLIP_MCP_TOOLS ? { PAPERCLIP_MCP_TOOLS: oldEnv.PAPERCLIP_MCP_TOOLS } : {}),
    },
    promptTemplate: persona + OPS_BLOCK,
    // rollback breadcrumb
    migratedFrom: "claude_local",
    migratedAt: new Date().toISOString(),
  };
}

const cmd = process.argv[2];
if (cmd === "backup") {
  const rows = await sql`select id, name, adapter_type, adapter_config from agents order by name`;
  writeFileSync(BACKUP, JSON.stringify(rows, null, 1));
  console.log(`backup de ${rows.length} agentes → ${BACKUP}`);
} else if (cmd === "convert") {
  const name = process.argv[3];
  const [a] = await sql`select id, name, adapter_type, adapter_config from agents where name ilike ${name + "%"} limit 1`;
  if (!a) { console.error("no encontrado"); process.exit(1); }
  if (a.adapter_type === "hermes_local") { console.log(`${a.name}: ya es hermes_local`); process.exit(0); }
  const cfg = hermesConfig(a);
  await sql`update agents set adapter_type = 'hermes_local', adapter_config = ${cfg} where id = ${a.id}`;
  console.log(`✚ ${a.name}: claude_local → hermes_local (persona ${((a.adapter_config?.systemPrompt ?? "").length / 1000).toFixed(1)}k chars)`);
} else if (cmd === "convert-rest") {
  const rows = await sql`select id, name, adapter_type, adapter_config from agents where adapter_type = 'claude_local' order by name`;
  for (const a of rows) {
    const cfg = hermesConfig(a);
    await sql`update agents set adapter_type = 'hermes_local', adapter_config = ${cfg} where id = ${a.id}`;
    console.log(`✚ ${a.name} → hermes_local`);
  }
  console.log(`convertidos: ${rows.length}`);
} else if (cmd === "rollback") {
  const name = process.argv[3];
  const backup = JSON.parse(readFileSync(BACKUP, "utf8"));
  const rows = name ? backup.filter((b) => b.name.toLowerCase().startsWith(name.toLowerCase())) : backup;
  for (const b of rows) {
    await sql`update agents set adapter_type = ${b.adapter_type}, adapter_config = ${b.adapter_config} where id = ${b.id}`;
    console.log(`↩ ${b.name} restaurado a ${b.adapter_type}`);
  }
} else {
  console.log("uso: backup | convert <nombre> | convert-rest | rollback [nombre]");
}
await sql.end();
