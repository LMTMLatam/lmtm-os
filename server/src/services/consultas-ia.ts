// LMTM-OS: consultas IA del equipo → brain de los agentes (pedido 20/7).
//
// El equipo profundiza estrategia preguntándole a ChatGPT/Gemini; ese
// conocimiento moría en el chat de cada uno. Acá se pega la conversación (o su
// link compartido), se guarda como documento del cliente y se abre un issue de
// destilación para que el agente extraiga memorias REALES al client_memory —
// el mismo circuito que ya funcionó con el import histórico de ChatGPT
// (documents + issue_documents key + paperclipGetDocument).

import type { Db } from "@paperclipai/db";
import { agents, clients, documents, issueDocuments, issues } from "@paperclipai/db";
import { and, desc, eq, ilike } from "drizzle-orm";
import { heartbeatService } from "./heartbeat.js";
import { resolveCompanyId } from "./intel-common.js";
import { issueService } from "./issues.js";

export const CONSULTA_IA_DOC_KEY = "consulta-ia";
const FUENTES = ["chatgpt", "gemini", "otro"] as const;
export type FuenteIA = (typeof FUENTES)[number];

export function esFuenteIA(v: unknown): v is FuenteIA {
  return typeof v === "string" && (FUENTES as readonly string[]).includes(v);
}

/** Si viene un link compartido público (chatgpt.com/share/…, gemini share),
 *  intenta bajarlo y quedarse con el texto. Best-effort: si no rinde, se usa
 *  el texto pegado. */
async function textoDesdeLink(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const html = await r.text();
    const texto = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    // Menos de 500 chars útiles = página client-rendered, no sirvió.
    return texto.length >= 500 ? texto : null;
  } catch {
    return null;
  }
}

export async function guardarConsultaIA(
  db: Db,
  input: { clientId: string; fuente: FuenteIA; texto?: string; url?: string; titulo?: string },
): Promise<{ ok: true; issueId: string; documentId: string } | { ok: false; error: string }> {
  const [client] = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.id, input.clientId));
  if (!client) return { ok: false, error: "Cliente no encontrado." };

  let texto = (input.texto ?? "").trim();
  if (!texto && input.url) texto = (await textoDesdeLink(input.url)) ?? "";
  if (texto.length < 200) {
    return { ok: false, error: "Pegá la conversación completa (mínimo ~200 caracteres). Si pasaste solo el link y falló, es porque la página no expone el texto — copialo y pegalo." };
  }

  const companyId = await resolveCompanyId(db, client.id);
  if (!companyId) return { ok: false, error: "El cliente no tiene company asociada." };

  const fecha = new Date().toISOString().slice(0, 10);
  const titulo = (input.titulo ?? "").trim() || `Consulta ${fecha}`;
  const body = [
    `# Consulta IA (${input.fuente}) — ${client.name} — ${titulo}`,
    "",
    `Fuente: ${input.fuente}${input.url ? ` · ${input.url}` : ""} · cargada por el equipo el ${fecha}.`,
    "Es una conversación real del equipo con una IA externa profundizando estrategia/ideas para este cliente.",
    "",
    "---",
    "",
    texto,
  ].join("\n");

  const [doc] = await db.insert(documents).values({
    companyId,
    title: `Consulta IA (${input.fuente}) — ${client.name} — ${titulo}`.slice(0, 200),
    format: "markdown",
    latestBody: body,
  } as never).returning({ id: documents.id });

  // Mismo destino que las destilaciones históricas: el especialista de
  // contenido; si no está, que lo enrute el triage.
  const roster = await db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.companyId, companyId));
  const caro = roster.find((a) => /caro/i.test(a.name)) ?? null;

  const created = await issueService(db).create(companyId, {
    title: `[${client.name.toUpperCase()}] Destilar consulta IA al brain — ${titulo}`.slice(0, 200),
    description: [
      `El equipo cargó una conversación con ${input.fuente} sobre **${client.name}** (${titulo}).`,
      "",
      `Leé el documento adjunto (key \`${CONSULTA_IA_DOC_KEY}\`) con paperclipGetDocument y destilá al brain del cliente:`,
      "- Guardá con lmtmSaveClientMemory SOLO conocimiento real y accionable: decisiones de estrategia, ángulos/dolores del público, ideas de contenido concretas, restricciones de marca, datos del negocio.",
      "- Cada memoria cita su origen (consulta IA del equipo, fecha).",
      "- NO inventes nada que no esté en la conversación; si no hay nada destilable, comentalo y cerrá.",
      "- Si la conversación trae una idea de contenido lista (guion, texto de pauta), guardala también como gancho o idea según corresponda.",
    ].join("\n"),
    status: "todo",
    priority: "medium",
    clientId: client.id,
    originKind: "manual",
    createdByAgentId: null,
    ...(caro ? { assigneeAgentId: caro.id } : {}),
  });
  const issueId = String(created.id ?? "");
  if (!issueId) return { ok: false, error: "No se pudo crear el issue de destilación." };

  await db.insert(issueDocuments).values({
    companyId,
    issueId,
    documentId: doc.id,
    key: CONSULTA_IA_DOC_KEY,
  } as never);

  if (caro) {
    await heartbeatService(db).wakeup(caro.id, {
      source: "automation",
      triggerDetail: "system",
      reason: "consulta_ia",
      payload: { issueId },
    }).catch(() => {});
  }

  return { ok: true, issueId, documentId: doc.id };
}

export async function listarConsultasIA(db: Db, clientId: string): Promise<Array<{ issueId: string; titulo: string; status: string; createdAt: string }>> {
  const rows = await db.select({
    issueId: issues.id,
    titulo: issues.title,
    status: issues.status,
    createdAt: issues.createdAt,
  }).from(issues)
    .where(and(eq(issues.clientId, clientId), ilike(issues.title, "%Destilar consulta IA%")))
    .orderBy(desc(issues.createdAt))
    .limit(20);
  return rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() }));
}
