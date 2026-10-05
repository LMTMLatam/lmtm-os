// LMTM-OS: Customer Brain — living per-client memory (#1).
//
// Accumulates and continuously updates facts/decisions/preferences/events/
// performance per client, fed from ClickUp's Enfoque Técnico, ad performance,
// and other signals. Read by agent-chat (context injection), the weekly report
// and the opportunities engine.

import type { Db } from "@paperclipai/db";
import { clientMemory, clients, videoReferences } from "@paperclipai/db";
import { and, eq, desc } from "drizzle-orm";
import { aggInsights, dayStr } from "./agency-ops.js";
import { getEnfoqueTecnicoContext } from "./clickup-sync.js";
import { resolveCompanyId, activeClients } from "./intel-common.js";

export type MemoryKind = "fact" | "preference" | "decision" | "event" | "performance" | "context" | "risk";

export async function upsertMemory(
  db: Db,
  input: { companyId: string; clientId: string; kind: MemoryKind; key: string; content: string; source?: string; confidence?: number; pinned?: boolean },
): Promise<void> {
  await db.insert(clientMemory).values({
    companyId: input.companyId,
    clientId: input.clientId,
    kind: input.kind,
    key: input.key,
    content: input.content,
    source: input.source ?? null,
    confidence: input.confidence != null ? String(input.confidence) : "0.7",
    pinned: input.pinned ?? false,
  }).onConflictDoUpdate({
    target: [clientMemory.clientId, clientMemory.kind, clientMemory.key],
    set: { content: input.content, source: input.source ?? null, updatedAt: new Date() },
  });
}

export async function getClientBrain(db: Db, clientId: string) {
  return db.select().from(clientMemory).where(eq(clientMemory.clientId, clientId))
    .orderBy(desc(clientMemory.pinned), desc(clientMemory.updatedAt)).limit(100);
}

/** True if the client already has a memory entry with this key. Use for
 *  idempotency checks — reliable regardless of how large the brain is (scanning
 *  the truncated getBrainContext string can miss the entry once the brain grows). */
export async function hasMemory(db: Db, clientId: string, key: string): Promise<boolean> {
  const [row] = await db.select({ id: clientMemory.id }).from(clientMemory)
    .where(and(eq(clientMemory.clientId, clientId), eq(clientMemory.key, key))).limit(1);
  return !!row;
}

/** Compact, prompt-ready context string from the client's brain.
 *
 * Priority: pinned → kind (estrategia/hechos antes que alertas) → recency.
 * Every memory gets a per-line cap so una sola memoria enorme no puede
 * comerse (ni vaciar) todo el presupuesto: el loop viejo hacía `break` en la
 * PRIMERA línea que no entraba, y como el "enfoque-tecnico" pinneado mide
 * hasta 4000 chars, 5 de 6 clientes con enfoque recibían contexto VACÍO en
 * ideas/reportes/oportunidades (detectado 2026-07-07). */
const KIND_WEIGHT: Record<string, number> = { context: 0, fact: 1, preference: 2, decision: 3, performance: 4, event: 5, risk: 6 };

/**
 * Debajo de esta confianza, una memoria es un SUPUESTO y no un hecho.
 *
 * El caso que lo motivó: un cliente sin referencias propias recibe un perfil
 * "derivado del NICHO" con confidence 0.6 (ver más abajo). El texto decía de
 * dónde salía, pero `getBrainContext` armaba la línea como `- [preference] …`
 * y TIRABA la confianza — así que al agente le llegaba exactamente igual que un
 * dato medido del cliente. De ahí salió un agente hablando de una inmobiliaria
 * para un cliente que no lo era.
 */
export const UMBRAL_CERTEZA = 0.7;

/** La advertencia que convierte el marcador en una instrucción. */
export const AVISO_SUPUESTOS =
  "ATENCIÓN: las líneas marcadas SUPUESTO no están verificadas contra datos de ESTE cliente " +
  "(se derivaron de sus pares de rubro o de una fuente indirecta). No las afirmes como propias " +
  "del cliente, no las uses en nada que vea el cliente sin confirmarlas, y si una te cambia la " +
  "decisión, verificala o decí que falta ese dato.";

/** ¿Esta memoria es un supuesto? Pura: `confidence` viaja como texto desde la DB. */
export function esSupuesto(confidence: unknown): boolean {
  const n = typeof confidence === "number" ? confidence : Number.parseFloat(String(confidence ?? ""));
  // Sin confianza legible se asume lo seguro: tratarlo como supuesto obliga a
  // verificar, y el costo de verificar de más es mucho menor que el de afirmar
  // de menos.
  if (!Number.isFinite(n)) return true;
  return n < UMBRAL_CERTEZA;
}

export async function getBrainContext(db: Db, clientId: string, maxChars = 2500): Promise<string> {
  const rows = await getClientBrain(db, clientId);
  if (rows.length === 0) return "";
  const ordered = [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const kw = (KIND_WEIGHT[a.kind] ?? 9) - (KIND_WEIGHT[b.kind] ?? 9);
    if (kw !== 0) return kw;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  // Una línea puede usar hasta ~40% del presupuesto: el enfoque técnico entra
  // resumido y siguen quedando ~60% para feedback, review, notas y performance.
  const perLineCap = Math.max(800, Math.floor(maxChars * 0.4));
  let out = "";
  let huboSupuestos = false;
  for (const r of ordered) {
    const room = maxChars - out.length;
    if (room < 80) break; // no queda espacio útil
    const supuesto = esSupuesto(r.confidence);
    if (supuesto) huboSupuestos = true;
    // El marcador va en la línea y no en un bloque aparte: una advertencia al
    // pie se pierde cuando el contexto se recorta, y es justo el recorte el que
    // deja al supuesto suelto y sin su aclaración.
    let line = `- [${r.kind}]${supuesto ? " SUPUESTO:" : ""} ${r.content}`;
    const cap = Math.min(perLineCap, room);
    if (line.length > cap) line = line.slice(0, cap - 1) + "…";
    out += (out ? "\n" : "") + line;
  }
  // El aviso va ARRIBA: si el contexto se corta por presupuesto, lo que
  // sobrevive es la instrucción, no la última memoria.
  return huboSupuestos ? `${AVISO_SUPUESTOS}\n\n${out}` : out;
}

/**
 * Quién decide del otro lado. Lo carga una persona: no se deriva de ningún dato.
 */
export interface Decisor {
  /** Nombre y, si se sabe, el cargo. */
  quien?: string;
  /** Qué mueve su decisión: leads, facturación, prestigio, tranquilidad. */
  queLeImporta?: string;
  /** Qué lo frena: presupuesto, miedo al cambio, un socio, una mala experiencia. */
  queLoFrena?: string;
  /** Registro: formal, directo, con números, con ejemplos visuales. */
  comoHablarle?: string;
  /** Por dónde se le llega: WhatsApp, mail, reunión. */
  canal?: string;
}

const CAMPOS_DECISOR: Array<[keyof Decisor, string]> = [
  ["quien", "Quién decide"],
  ["queLeImporta", "Qué le importa"],
  ["queLoFrena", "Qué lo frena"],
  ["comoHablarle", "Cómo hablarle"],
  ["canal", "Canal"],
];

/** Lee el decisor de `clients.metadata`, tolerando que no esté o esté a medias. */
export function leerDecisor(metadata: unknown): Decisor | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const d = (metadata as { decisor?: unknown }).decisor;
  if (typeof d !== "object" || d === null) return null;
  const out: Decisor = {};
  for (const [campo] of CAMPOS_DECISOR) {
    const v = (d as Record<string, unknown>)[campo];
    if (typeof v === "string" && v.trim()) out[campo] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * El decisor como se lo lee un agente — incluido el caso en que no está.
 *
 * El texto del hueco dice qué hacer, no sólo que falta: "no está cargado" se
 * lee como permiso para improvisar, y "no inventes, pedilo" no.
 */
export function textoDeDecisor(d: Decisor | null): string {
  if (!d) {
    return (
      "Decisor: NO CARGADO. No sabés quién decide de este lado ni qué le importa. " +
      "No inventes un perfil ni le escribas a un destinatario genérico: si lo que estás " +
      "por entregar depende de a quién le habla, decilo y pedí que lo carguen."
    );
  }
  const partes = CAMPOS_DECISOR.filter(([campo]) => d[campo]).map(([campo, etiqueta]) => `${etiqueta}: ${d[campo]}`);
  const faltan = CAMPOS_DECISOR.filter(([campo]) => !d[campo]).map(([, etiqueta]) => etiqueta);
  const base = `Decisor — ${partes.join(" · ")}. Todo lo que escribas para este cliente le habla a esta persona.`;
  // Lo que falta se nombra: media ficha completada en silencio invita a rellenar
  // el resto a ojo.
  return faltan.length > 0 ? `${base} (Sin cargar todavía: ${faltan.join(", ")} — no lo supongas.)` : base;
}

/** Derive/refresh memory entries for a client from its current signals. */
export async function refreshClientBrain(db: Db, clientId: string): Promise<{ updated: number }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { updated: 0 };
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { updated: 0 };
  let updated = 0;

  // Pinned identity facts.
  const identity = [client.industry ? `Rubro: ${client.industry}` : null, client.websiteUrl ? `Web: ${client.websiteUrl}` : null]
    .filter(Boolean).join(" · ");
  if (identity) {
    await upsertMemory(db, { companyId, clientId, kind: "fact", key: "identity", content: identity, source: "client", pinned: true });
    updated++;
  }

  // A QUIÉN le habla todo lo que se escribe para este cliente.
  //
  // No existía. Los agentes producían copy, planes y reportes sin saber quién
  // decide del otro lado ni qué le importa, así que le hablaban a nadie en
  // particular. Lo carga una persona porque esa info sólo la tiene el equipo:
  // no se puede derivar de la pauta ni del orgánico.
  //
  // Cuando NO está cargado se escribe igual, diciendo que falta. Es deliberado:
  // el hueco tiene que ser visible, porque un agente que no sabe a quién le
  // habla y tampoco sabe que no sabe, se inventa un interlocutor — que es
  // exactamente el problema de los supuestos de más arriba.
  await upsertMemory(db, {
    companyId, clientId, kind: "fact", key: "decisor",
    content: textoDeDecisor(leerDecisor(client.metadata)),
    source: "client", confidence: 0.95, pinned: true,
  });
  updated++;

  // Enfoque Técnico context (the client's networks/strategy doc).
  try {
    const ctx = await getEnfoqueTecnicoContext(db, clientId, { maxAgeMs: 60 * 60 * 1000 });
    const md = (ctx.markdown ?? "").trim();
    if (md) {
      await upsertMemory(db, { companyId, clientId, kind: "context", key: "enfoque-tecnico", content: md.slice(0, 4000), source: "clickup", confidence: 0.9, pinned: true });
      updated++;
    }
  } catch { /* no enfoque */ }

  // Perfil de videos derivado de las referencias etiquetadas por el equipo
  // (tipo: Blanda/VSL/Comercial/Engagement · concepto: Cinemático/UGC/...).
  // Pinned al brain para que TODA generación de contenido lo respete — es el
  // eslabón "etiquetás una vez → el agente crea con ese perfil".
  // FALLBACK AL NICHO: si el cliente no tiene referencias propias etiquetadas,
  // deriva el perfil de las referencias de sus PARES de rubro — así los 56
  // clientes tienen perfil desde el día uno y se afina al cargar propias.
  try {
    const tally = (rows: Array<{ categorias: string[] | null }>) => {
      const tagged = rows.filter((r) => (r.categorias ?? []).length > 0);
      if (tagged.length === 0) return null;
      const TIPOS = new Set(["blanda", "vsl", "comercial", "engagement"]);
      const counts = new Map<string, number>();
      for (const r of tagged) for (const c of r.categorias ?? []) {
        const k = c.trim();
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      return {
        n: tagged.length,
        tipos: ranked.filter(([k]) => TIPOS.has(k.toLowerCase())).slice(0, 2).map(([k, n]) => `${k} (${n})`),
        conceptos: ranked.filter(([k]) => !TIPOS.has(k.toLowerCase())).slice(0, 3).map(([k, n]) => `${k} (${n})`),
      };
    };

    const own = tally(await db.select({ categorias: videoReferences.categorias })
      .from(videoReferences).where(eq(videoReferences.clientId, clientId)));
    let profile = own;
    let origen = `derivado de ${own?.n ?? 0} referencias etiquetadas del cliente`;
    if (!profile && client.industry) {
      const nicheRows = await db.select({ categorias: videoReferences.categorias })
        .from(videoReferences)
        .innerJoin(clients, eq(videoReferences.clientId, clients.id))
        .where(and(eq(clients.industry, client.industry), eq(clients.status, "active")));
      profile = tally(nicheRows);
      origen = `SUPUESTO derivado del NICHO "${client.industry}" (${profile?.n ?? 0} referencias de sus pares — ESTE cliente no tiene propias, así que esto NO describe al cliente sino a su rubro; cargar referencias afina el perfil)`;
    }
    if (profile) {
      const content = `Perfil de videos (${origen}): ` +
        `${profile.tipos.length ? `tipo dominante ${profile.tipos.join(", ")}` : "sin tipo dominante todavía"}` +
        `${profile.conceptos.length ? `; conceptos: ${profile.conceptos.join(", ")}` : ""}. ` +
        `Las ideas de video para Super Redes deben seguir este perfil (indicar tipo + concepto en el copy).`;
      await upsertMemory(db, { companyId, clientId, kind: "preference", key: "video-profile", content, source: "video-references", confidence: own ? 0.9 : 0.6, pinned: true });
      updated++;

      // Si el perfil es prestado del rubro, alguien tiene que confirmar que el
      // rubro sea el correcto: ese campo es el que decide de QUIÉN se copia el
      // perfil, y si está mal el agente hereda la persona de otro negocio.
      // Va por intervenciones, que es el canal que ya alimenta el Centro de
      // Inteligencia y el brief, y que deduplica solo por clave.
      if (!own) {
        const { recordIntervention } = await import("./vigilantes.js");
        await recordIntervention(db, {
          vigilante: "brain",
          kind: "tarea",
          level: 3,
          clientId,
          title: `Confirmar el rubro de ${client.name}: su perfil está prestado del nicho`,
          body:
            `${client.name} no tiene referencias propias cargadas, así que su perfil de contenido se derivó ` +
            `del rubro "${client.industry}". Todo lo que los agentes propongan para este cliente sale de ahí.\n\n` +
            `Dos cosas, cualquiera de las dos alcanza: confirmar que "${client.industry}" es el rubro correcto, ` +
            `o cargarle referencias propias (es lo que de verdad afina el perfil).`,
          dedupeKey: `brain:rubro-sin-confirmar:${clientId}`,
        }).catch(() => {});
      }
    }
  } catch { /* sin referencias no hay perfil */ }

  // Weekly performance snapshot.
  const today = new Date();
  const d = (back: number) => dayStr(new Date(today.getTime() - back * 86400000));
  const w = await aggInsights(db, clientId, d(7), d(0));
  if (w.impressions > 0 || w.spend > 0) {
    const ctr = w.impressions > 0 ? (w.clicks / w.impressions) * 100 : 0;
    const cpl = w.leads > 0 ? w.spend / w.leads : 0;
    const perf = `Últimos 7d: inversión $${Math.round(w.spend)}, ${w.leads} leads, CTR ${ctr.toFixed(2)}%${w.leads > 0 ? `, CPL $${Math.round(cpl)}` : ""}.`;
    await upsertMemory(db, { companyId, clientId, kind: "performance", key: "weekly-ads", content: perf, source: "ads", confidence: 1 });
    updated++;
  }

  return { updated };
}

let brainTimer: ReturnType<typeof setInterval> | null = null;

export function initCustomerBrain(db: Db): void {
  if (brainTimer) return;
  const run = async () => {
    const rows = await activeClients(db);
    for (const c of rows) { await refreshClientBrain(db, c.id).catch(() => {}); }
    // Qué funciona en el orgánico de cada cliente (14/8): teníamos 3.301 posts
    // publicados y el aprendizaje nunca se destilaba, así que las ideas salían
    // genéricas por más historial que hubiera.
    try {
      const { destilarTodos } = await import("./organico-aprendizaje.js");
      const r = await destilarTodos(db);
      console.log(`[customer-brain] orgánico destilado: ${r.conSenal}/${r.evaluados} clientes con señal suficiente`);
    } catch (e) {
      console.warn("[customer-brain] destilado de orgánico falló:", e instanceof Error ? e.message : e);
    }
  };
  setTimeout(() => { run().catch((e) => console.warn("[customer-brain] refresh failed:", e)); }, 8 * 60 * 1000);
  brainTimer = setInterval(() => { run().catch((e) => console.warn("[customer-brain] refresh failed:", e)); }, 12 * 3600 * 1000);
  console.log("[customer-brain] scheduled brain refresh every 12h");
}

