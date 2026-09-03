// Ingest ChatGPT corpus: condensed per-client document + distillation issue.
// Also adds paperclip document tools to every agent's MCP allowlist.
import postgres from "postgres";
import { readFileSync } from "fs";
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: false, prepare: false });
const API = "https://lmtm-os-production.up.railway.app/api";
const BOARD = readFileSync(process.env.HOME + "/.cache_boardkey_tmp", "utf8").trim();
const COMPANY = "00000000-0000-4000-8000-000000000001";

const convos = readFileSync("C:/Users/Administrator/lmtm-chatgpt-export/conversations.ndjson", "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

// 0. allowlist: sumar tools de documentos a los 14
const agents = await sql`select id, adapter_config from agents`;
let allowFixed = 0;
for (const a of agents) {
  const cfg = a.adapter_config ?? {};
  const cur = cfg.env?.PAPERCLIP_MCP_TOOLS;
  if (typeof cur !== "string" || cur.includes("paperclipGetDocument")) continue;
  cfg.env.PAPERCLIP_MCP_TOOLS = cur + ",paperclipGetDocument,paperclipListDocuments";
  await sql`update agents set adapter_config = ${cfg} where id = ${a.id}`;
  allowFixed++;
}
console.log(`allowlist de documentos agregada a ${allowFixed} agentes`);

// 1. clientes de la DB para matchear
const clients = await sql`select id, name from clients where status = 'active'`;
const findClient = (needle) => clients.find((c) => c.name.toLowerCase().includes(needle.toLowerCase()));

const NAMES = ["DUNOD","COSA","MAERS","SERRAT","SKYGARDEN","GALA","BOERO","BITTI","CAMPO TIMBO","PRONE","IMPERIA","BRISANOVA","NUMORPH","MUNDO INFLABLE","INBELT","KORSIO","HANSHI","CANNES","CARVUK","MA DESARROLLOS","MA PROPIEDADES","Hotel Lescano","Hotel Libertador","Hotel San Bernardo","Ferrol","ADR Luparini","Alun Nehuen","GRUPO ROIBAS","GRUPO MA","PKT","ECOCREDITO","MONDINO","TAMARINDO","WERKALEC","SANTA ROSA","Distrito Roldan","SUSTENTA","Ikigai","Empresariosxfunes","Sebastian Ramasco","YATO","Domingo Bisio","Luz y Fuerza","Hiper de la Pelu","ALIS","Workera","Distrillantas"];

let docs = 0, issues = 0;
for (const name of NAMES) {
  const client = findClient(name);
  if (!client) continue;
  const mine = convos.filter((c) => {
    const hay = (c.title + " " + c.msgs.slice(0, 6).map((m) => m.text.slice(0, 400)).join(" ")).toLowerCase();
    return hay.includes(name.toLowerCase());
  });
  if (mine.length < 3) continue;
  // condensar: últimas 60 convos, SOLO mensajes del equipo (briefs/correcciones)
  const recent = mine.slice(-60);
  let body = `# Historia de trabajo en ChatGPT — ${client.name}\n\n` +
    `Corpus: ${mine.length} conversaciones (${mine[0].created} → ${mine[mine.length - 1].created}). ` +
    `Abajo van las PALABRAS DEL EQUIPO (pedidos, briefs, correcciones) de las ${recent.length} más recientes — ` +
    `es la voz de la agencia enseñando qué quiere para este cliente.\n\n`;
  for (const c of recent) {
    const userMsgs = c.msgs.filter((m) => m.role === "user").slice(0, 3);
    if (!userMsgs.length) continue;
    body += `## [${c.created}] ${c.title}\n` + userMsgs.map((m) => `- ${m.text.slice(0, 1000).replace(/\n+/g, " ")}`).join("\n") + "\n\n";
    if (body.length > 120_000) break;
  }
  const [existing] = await sql`select id from documents where company_id = ${COMPANY} and title = ${"Historia ChatGPT — " + client.name} limit 1`;
  const [doc] = existing ? [existing] : await sql`
    insert into documents (company_id, title, format, latest_body)
    values (${COMPANY}, ${"Historia ChatGPT — " + client.name}, 'markdown', ${body})
    returning id`;
  docs++;
  // issue de destilación vía API (identifier + routing correctos)
  const desc = [
    `Tenemos ${mine.length} conversaciones históricas de ChatGPT donde el equipo trabajó a ${client.name} (mayo 2025 → enero 2026). Están condensadas en el documento "Historia ChatGPT — ${client.name}" (id ${doc.id}) — leelo con paperclipGetDocument.`,
    ``,
    `TAREA: destilá ese material al brain del cliente con lmtmRememberAboutClient. Guardá memorias SEPARADAS (kind=context, pinned) para:`,
    `1. VOZ DE MARCA: tono, muletillas, qué estilo pedía el equipo, qué corregían siempre.`,
    `2. BRIEFS RECURRENTES: qué tipos de piezas pedían para este cliente (formatos, temas, campañas).`,
    `3. REGLAS/PREFERENCIAS: todo "no hagas X" / "siempre Y" que el equipo repetía.`,
    `4. CONTEXTO DE NEGOCIO: datos del cliente que aparezcan (productos, zonas, diferenciales, audiencia).`,
    `Solo hechos que aparecen en el corpus — no inventes. Al terminar comentá el resumen y cerrá el issue.`,
  ].join("\n");
  const res = await fetch(`${API}/companies/${COMPANY}/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${BOARD}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: `[${client.name}] Destilar historia de ChatGPT al brain`, description: desc, clientId: client.id, status: "backlog", priority: "medium" }),
  });
  if (res.ok) issues++;
  else console.log(`  issue falló para ${client.name}: ${res.status}`);
  await new Promise((r) => setTimeout(r, 300));
}
console.log(`documentos creados: ${docs} | issues de destilación: ${issues}`);
await sql.end();
