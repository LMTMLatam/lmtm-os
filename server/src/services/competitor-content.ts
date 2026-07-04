// LMTM-OS: competitor-driven content generation.
//
// Takes a client's manually-curated competitors + its Enfoque Técnico + brain,
// asks the AI to produce content split into "pauta" (paid) and "posteo"
// (organic), and stores it for review/export. Degrades to a deterministic
// skeleton if the AI is unavailable (same philosophy as agency-ops).

import { randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { competitors, contentIdeas, clients, videoReferences } from "@paperclipai/db";
import { and, eq, gte } from "drizzle-orm";
import { aiNarrative } from "./agency-ops.js";
import { getBrainContext, upsertMemory, hasMemory } from "./customer-brain.js";
import { resolveCompanyId, activeClients } from "./intel-common.js";

/** Formatted block of the client's curated video references (from the team's
 * reference sheet) so idea generation can riff on formats the team likes. */
async function videoRefsBlock(db: Db, clientId: string): Promise<string> {
  const refs = await db
    .select({ url: videoReferences.url, categorias: videoReferences.categorias, comentario: videoReferences.comentario })
    .from(videoReferences)
    .where(eq(videoReferences.clientId, clientId))
    .limit(25)
    .catch(() => []);
  if (refs.length === 0) return "";
  const lines = refs.map((r) => {
    const cats = (r.categorias ?? []).join(", ");
    return `- ${r.url}${cats ? ` [${cats}]` : ""}${r.comentario ? ` — ${r.comentario}` : ""}`;
  });
  return `\nReferencias de video que le gustan al equipo (usalas como inspiración de formato/edición, no copies literal):\n${lines.join("\n")}`;
}

export type ContentObjetivo = "COMERCIAL" | "ENGAGMENT" | "CONCEPTO";
export interface GeneratedIdea { kind: "pauta" | "posteo"; format?: string; title: string; copy?: string; rationale?: string; objetivo?: ContentObjetivo }

function normalizeObjetivo(v: unknown): ContentObjetivo | undefined {
  const s = String(v ?? "").trim().toUpperCase();
  if (s.startsWith("COMER")) return "COMERCIAL";
  if (s.startsWith("ENGAG")) return "ENGAGMENT";
  if (s.startsWith("CONCEP")) return "CONCEPTO";
  return undefined;
}

function parseIdeas(raw: string): GeneratedIdea[] {
  // The model is asked for a JSON array; be lenient about surrounding prose.
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const arr = JSON.parse(raw.slice(start, end + 1)) as Array<Record<string, unknown>>;
    const out: GeneratedIdea[] = [];
    for (const it of arr) {
      const kind = String(it.kind ?? "").toLowerCase() === "pauta" ? "pauta" : String(it.kind ?? "").toLowerCase() === "posteo" ? "posteo" : null;
      const title = typeof it.title === "string" ? it.title.trim() : "";
      if (!kind || !title) continue;
      out.push({
        kind,
        format: typeof it.format === "string" ? it.format : undefined,
        title,
        copy: typeof it.copy === "string" ? it.copy : undefined,
        rationale: typeof it.rationale === "string" ? it.rationale : undefined,
        objetivo: normalizeObjetivo(it.objetivo),
      });
    }
    return out;
  } catch {
    return [];
  }
}

// Anti-hallucination guard for idea generation. Even with the client's real
// location present in the brain context, the model has invented places (a
// "¿Qué zona de Córdoba va con tu estilo de vida?" quiz for SKYGARDEN, a
// Rosario real-estate firm). Two layers: a hard prompt rule, and the client's
// operating location (clients.metadata.location) anchored on the Cliente line
// where it's most salient.
const GROUNDING_RULE =
  "REGLA DURA: NUNCA inventes ubicaciones (ciudades, barrios, zonas), precios, nombres de proyectos ni datos del cliente. " +
  "Usá SOLO lugares y datos que aparezcan explícitamente en el contexto del cliente. " +
  "Si el contexto no dice dónde opera, NO nombres lugares específicos.";

function clientLine(client: { name: string; industry: string | null; metadata: unknown }): string {
  const location = ((client.metadata as Record<string, unknown> | null)?.location as string | undefined)?.trim();
  return `Cliente: ${client.name}${client.industry ? ` — rubro: ${client.industry}` : ""}${location ? ` — opera en: ${location} (cualquier referencia geográfica debe ser de acá)` : ""}`;
}

export async function generateContentPlan(db: Db, clientId: string): Promise<{ batchId: string; created: number; ideas: GeneratedIdea[] }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { batchId: "", created: 0, ideas: [] };
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { batchId: "", created: 0, ideas: [] };

  const comps = await db.select().from(competitors).where(eq(competitors.clientId, clientId));
  const brain = await getBrainContext(db, clientId, 2500).catch(() => "");

  const compBlock = comps.length
    ? comps.map((c) => {
        const ads = (c.sampleAds ?? []).map((a) => a.text || a.url).filter(Boolean).slice(0, 5).join(" | ");
        return `- ${c.name}${c.fbPageUrl ? ` (${c.fbPageUrl})` : ""}${c.notes ? ` — ${c.notes}` : ""}${ads ? `\n  Anuncios observados: ${ads}` : ""}`;
      }).join("\n")
    : "(sin competidores cargados)";

  const system = [
    "Sos estratega de contenido de LMTM, agencia de marketing latinoamericana.",
    "Generás ideas de contenido accionables para un cliente, separadas en dos tipos:",
    '- "pauta": contenido pago (anuncios) — hook, ángulo, oferta, CTA.',
    '- "posteo": contenido orgánico para redes — idea de post/reel, copy y formato.',
    "Tené en cuenta el Enfoque Técnico del cliente, su memoria, y qué hace la competencia (diferenciate, no copies).",
    "Español rioplatense, concreto. Nunca inventes datos de performance.",
    GROUNDING_RULE,
    'Respondé SOLO con un array JSON: [{"kind":"pauta"|"posteo","format":"reel|carrusel|imagen|video|story|texto","title":"...","copy":"...","rationale":"por qué / en qué se diferencia de la competencia"}]',
    "Generá 5 ideas de pauta y 5 de posteo (10 en total).",
  ].join("\n");

  const user = [
    clientLine(client),
    brain ? `\nContexto del cliente (Enfoque Técnico + memoria):\n${brain}` : "",
    `\nCompetencia:\n${compBlock}`,
    await videoRefsBlock(db, clientId),
  ].join("\n");

  let ideas: GeneratedIdea[] = [];
  const aiRaw = await aiNarrative(system, user).catch(() => null);
  if (aiRaw) ideas = parseIdeas(aiRaw);

  // Deterministic fallback so the feature always returns something usable.
  if (ideas.length === 0) {
    const base = client.name;
    ideas = [
      { kind: "pauta", format: "video", title: `Anuncio de oferta principal — ${base}`, copy: "Hook fuerte en los primeros 3s + propuesta de valor + CTA claro.", rationale: "Estructura base de pauta de conversión; completar con la oferta real del cliente." },
      { kind: "pauta", format: "carrusel", title: "Carrusel de diferenciadores vs competencia", copy: "3-5 placas con los diferenciales del cliente frente a los competidores cargados.", rationale: "Aprovecha lo que la competencia NO comunica." },
      { kind: "posteo", format: "reel", title: "Detrás de escena / proceso", copy: "Reel mostrando el día a día o el proceso del cliente.", rationale: "Orgánico de cercanía; suele tener buen alcance en el rubro." },
      { kind: "posteo", format: "carrusel", title: "Tips útiles del rubro", copy: "Carrusel educativo con 5 consejos del sector.", rationale: "Posiciona autoridad sin vender directo." },
    ];
  }

  const batchId = randomUUID();
  await db.insert(contentIdeas).values(ideas.map((i) => ({
    companyId, clientId, kind: i.kind, format: i.format ?? null, title: i.title,
    copy: i.copy ?? null, rationale: i.rationale ?? null, source: aiRaw ? "ai" : "fallback", batchId,
  })));

  // Mirror the ideas into the client's "Super Redes" ClickUp list (best-effort,
  // deduped by title) so the team works them where they live in ClickUp.
  await pushIdeasToSuperRedes(db, clientId, ideas).catch(() => {});

  return { batchId, created: ideas.length, ideas };
}

const CU_API = "https://api.clickup.com/api/v2";

type CuField = {
  id: string; name: string; type: string;
  type_config?: { options?: Array<{ id: string; name?: string; label?: string }> };
};

/** Accent/space/case-insensitive key so we can match ClickUp field & option
 * names that carry trailing spaces or accents (e.g. "Aprobación de cliente "). */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

/** Resolver over a list's custom fields: field id by name, option id by label. */
function buildFieldResolver(fields: CuField[]) {
  const byName = new Map<string, CuField>();
  for (const f of fields) byName.set(norm(f.name), f);
  return {
    fieldId(name: string): string | undefined { return byName.get(norm(name))?.id; },
    optionId(fieldName: string, optionLabel: string): string | undefined {
      const f = byName.get(norm(fieldName));
      const opt = (f?.type_config?.options ?? []).find((o) => norm(o.name ?? o.label ?? "") === norm(optionLabel));
      return opt?.id;
    },
  };
}

/** Resolve the client's "Super Redes Sociales" list + a custom-field resolver +
 * the set of existing task names (for dedup). Null if no folder/list. */
async function resolveSuperRedes(db: Db, clientId: string, H: Record<string, string>): Promise<
  { listId: string; resolver: ReturnType<typeof buildFieldResolver>; have: Set<string> } | null
> {
  const [client] = await db
    .select({ folderId: clients.clickupFolderId })
    .from(clients)
    .where(eq(clients.id, clientId));
  const folderId = client?.folderId;
  if (!folderId) return null;
  const lists = (await (await fetch(`${CU_API}/folder/${folderId}/list?archived=false`, { headers: H })).json()) as {
    lists?: Array<{ id: string; name: string }>;
  };
  const list = (lists.lists ?? []).find((l) => /super\s*redes/i.test(l.name));
  if (!list) return null;
  const fieldsRes = (await (await fetch(`${CU_API}/list/${list.id}/field`, { headers: H })).json()) as { fields?: CuField[] };
  const resolver = buildFieldResolver(fieldsRes.fields ?? []);
  const existing = (await (await fetch(`${CU_API}/list/${list.id}/task?include_closed=true&page=0`, { headers: H })).json()) as {
    tasks?: Array<{ name: string }>;
  };
  const have = new Set((existing.tasks ?? []).map((t) => norm(t.name)));
  return { listId: list.id, resolver, have };
}

/** Build the custom_fields payload per the LMTM "Super Redes Sociales"
 * convention: Copy o/y Subtitulo (desarrollo), Objetivo de contenido,
 * Estado de producción = IDEA, Aprobación de cliente = PENDIENTE. Fields are
 * resolved by NAME so it works even if option/field ids differ per client. */
function buildIdeaCustomFields(
  resolver: ReturnType<typeof buildFieldResolver>,
  idea: GeneratedIdea,
): Array<{ id: string; value: unknown }> {
  const out: Array<{ id: string; value: unknown }> = [];
  const push = (id: string | undefined, value: unknown) => { if (id != null && value != null) out.push({ id, value }); };

  const copyText = [idea.copy, idea.rationale ? `Por qué encaja: ${idea.rationale}` : ""].filter(Boolean).join("\n");
  if (copyText) push(resolver.fieldId("Copy o/y Subtitulo"), copyText);

  const objId = resolver.fieldId("Objetivo de contenido");
  push(objId, resolver.optionId("Objetivo de contenido", idea.objetivo ?? "ENGAGMENT"));

  const estId = resolver.fieldId("Estado de producción");
  push(estId, resolver.optionId("Estado de producción", "IDEA"));

  const aprId = resolver.fieldId("Aprobación de cliente");
  push(aprId, resolver.optionId("Aprobación de cliente", "PENDIENTE"));

  return out;
}

/** Create the generated ideas as tasks in the client's "Super Redes Sociales"
 * list, with the LMTM custom fields set. Deduped by task name. */
// QA gate: keep generic/boilerplate ideas OUT of the client's ClickUp list.
// The deterministic fallback (when the AI call fails or returns nothing) emits
// titles like "Anuncio de oferta principal" / "Detrás de escena / proceso" —
// useless to a content team and it pollutes their board. These stay in the
// content_ideas DB (marked source=fallback) but never reach ClickUp.
const BOILERPLATE_TITLE_RE = /anuncio de oferta principal|carrusel de diferenciadores vs competencia|detr[aá]s de escena \/ proceso|tips [uú]tiles del rubro/i;
function looksBoilerplate(idea: GeneratedIdea): boolean {
  if (BOILERPLATE_TITLE_RE.test(idea.title)) return true;
  // A real idea has a concrete title and enough copy to act on.
  if (idea.title.trim().length < 12) return true;
  if ((idea.copy ?? "").trim().length < 25) return true;
  // Placeholder language the fallback/AI leaves when it has nothing specific.
  if (/completar con la oferta real|placa[s]? con los diferenciales|estructura base/i.test(idea.copy ?? "")) return true;
  return false;
}

async function pushIdeasToSuperRedes(db: Db, clientId: string, ideas: GeneratedIdea[]): Promise<void> {
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  if (!token || ideas.length === 0) return;
  const H = { Authorization: token, "Content-Type": "application/json" };
  const ctx = await resolveSuperRedes(db, clientId, H);
  if (!ctx) return;

  for (const idea of ideas) {
    if (looksBoilerplate(idea)) continue; // QA gate — don't mirror generic ideas
    const name = idea.title.trim().slice(0, 250);
    if (!name || ctx.have.has(norm(name))) continue; // never duplicate an existing idea
    const customFields = buildIdeaCustomFields(ctx.resolver, idea);
    const body: Record<string, unknown> = { name, tags: ["idea-lmtm-os"] };
    if (customFields.length) body.custom_fields = customFields;
    try {
      const res = await fetch(`${CU_API}/list/${ctx.listId}/task`, {
        method: "POST", headers: H, body: JSON.stringify(body),
      });
      if (res.ok) ctx.have.add(norm(name));
    } catch {
      /* best-effort per idea */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * Generate content ideas across all active clients. With { onlyMissing: true }
 * it skips clients that already have ideas (used on boot to backfill); the
 * weekly sweep regenerates everyone so ideas stay fresh and reflect new
 * competitors/learnings. AI calls are spaced out to stay gentle on the model.
 */
export async function sweepContentIdeas(
  db: Db,
  opts: { onlyMissing?: boolean } = {},
): Promise<{ clients: number; generated: number }> {
  const rows = await activeClients(db);
  let generated = 0;
  for (const c of rows) {
    try {
      if (opts.onlyMissing) {
        const [existing] = await db
          .select({ id: contentIdeas.id })
          .from(contentIdeas)
          .where(eq(contentIdeas.clientId, c.id))
          .limit(1);
        if (existing) continue;
      }
      const r = await generateContentPlan(db, c.id);
      if (r.created > 0) generated += 1;
    } catch {
      /* best-effort per client */
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return { clients: rows.length, generated };
}

/**
 * Generate ONE new post idea for a client and drop it into its "Super Redes
 * Sociales" ClickUp list with the LMTM custom fields (Objetivo, Estado=IDEA,
 * Aprobación=PENDIENTE, Copy). Follows the same instructions the Content agents
 * use (skill `lmtm-post-ideas`) PLUS the context the engine already had (brain
 * / Enfoque Técnico + competidores). Idempotent: at most one idea per client
 * per calendar day, so restarts don't double-post.
 */
export async function generateDailyIdeaForClient(db: Db, clientId: string): Promise<{ created: boolean }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { created: false };
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { created: false };

  // One idea per client per day (idempotent across restarts/redeploys).
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [today] = await db
    .select({ id: contentIdeas.id })
    .from(contentIdeas)
    .where(and(eq(contentIdeas.clientId, clientId), gte(contentIdeas.createdAt, startOfDay)))
    .limit(1);
  if (today) return { created: false };

  const comps = await db.select().from(competitors).where(eq(competitors.clientId, clientId));
  const brain = await getBrainContext(db, clientId, 2500).catch(() => "");
  const compBlock = comps.length
    ? comps.map((c) => `- ${c.name}${c.notes ? ` — ${c.notes}` : ""}`).join("\n")
    : "(sin competidores cargados)";

  const system = [
    "Sos estratega de contenido de LMTM, agencia de marketing latinoamericana.",
    "Generá UNA sola idea NUEVA de posteo orgánico para el cliente: accionable, original y alineada a su marca.",
    "Puede ser un concepto de post concreto, una acción/campaña creativa, o una estrategia a implementar.",
    "Tené en cuenta el Enfoque Técnico del cliente, su memoria, su rubro/tono y qué hace la competencia (diferenciate, no copies).",
    "Clasificá el objetivo en COMERCIAL (vender/convertir), ENGAGMENT (interacción/comunidad) o CONCEPTO (marca/valores/educativo).",
    "Español rioplatense, concreto. Nunca inventes datos de performance.",
    GROUNDING_RULE,
    'Respondé SOLO con un array JSON de UN elemento: [{"kind":"posteo","format":"reel|carrusel|post|story|clip corto|video","title":"la idea en una línea","copy":"desarrollo en 2-3 líneas: qué es, por qué encaja con la marca y cómo ejecutarla","objetivo":"COMERCIAL|ENGAGMENT|CONCEPTO","rationale":"en qué se diferencia de la competencia"}]',
  ].join("\n");
  const vids = await videoRefsBlock(db, clientId);
  const user = [
    clientLine(client),
    brain ? `\nContexto del cliente (Enfoque Técnico + memoria):\n${brain}` : "",
    `\nCompetencia:\n${compBlock}`,
    vids,
  ].join("\n");

  let idea: GeneratedIdea | null = null;
  const aiRaw = await aiNarrative(system, user).catch(() => null);
  if (aiRaw) idea = parseIdeas(aiRaw)[0] ?? null;
  if (!idea) {
    idea = {
      kind: "posteo", format: "reel",
      title: `Detrás de escena / proceso — ${client.name}`,
      copy: "Reel mostrando el día a día o el proceso del cliente, con un hook fuerte en los primeros 3s. Completar con el ángulo real del cliente.",
      objetivo: "ENGAGMENT",
      rationale: "Orgánico de cercanía; suele tener buen alcance en el rubro.",
    };
  }
  if (!idea.objetivo) idea.objetivo = "ENGAGMENT";

  const batchId = randomUUID();
  await db.insert(contentIdeas).values({
    companyId, clientId, kind: "posteo", format: idea.format ?? null, title: idea.title,
    copy: idea.copy ?? null, rationale: idea.rationale ?? null, source: aiRaw ? "ai-daily" : "fallback-daily", batchId,
  });
  await pushIdeasToSuperRedes(db, clientId, [idea]).catch(() => {});
  return { created: true };
}

/** One idea per active client per day, paced to stay gentle on the model + API. */
export async function sweepDailyIdeas(db: Db): Promise<{ clients: number; created: number }> {
  const rows = await activeClients(db);
  let created = 0;
  for (const c of rows) {
    try {
      const r = await generateDailyIdeaForClient(db, c.id);
      if (r.created) created += 1;
    } catch {
      /* best-effort per client */
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return { clients: rows.length, created };
}

const CONTENT_REVIEW_KEY = "content-review-posts";

/** Read task names from the client's "Redes Sociales" + "Super Redes Sociales"
 * ClickUp lists (for the one-time content review). Best-effort. */
async function readClientPostNames(db: Db, clientId: string): Promise<string[]> {
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  if (!token) return [];
  const [client] = await db.select({ folderId: clients.clickupFolderId }).from(clients).where(eq(clients.id, clientId));
  const folderId = client?.folderId;
  if (!folderId) return [];
  const H = { Authorization: token, "Content-Type": "application/json" };
  const lists = (await (await fetch(`${CU_API}/folder/${folderId}/list?archived=false`, { headers: H })).json()) as {
    lists?: Array<{ id: string; name: string }>;
  };
  const targets = (lists.lists ?? []).filter((l) => /redes\s*sociales/i.test(l.name)); // matches "Redes Sociales" + "Super Redes Sociales"
  const names: string[] = [];
  for (const l of targets) {
    try {
      const r = (await (await fetch(`${CU_API}/list/${l.id}/task?include_closed=true&page=0`, { headers: H })).json()) as {
        tasks?: Array<{ name: string }>;
      };
      for (const t of r.tasks ?? []) if (t.name) names.push(t.name.trim());
    } catch { /* best-effort per list */ }
  }
  return names.slice(0, 120);
}

/**
 * ONE-TIME per client: review the posts already in its ClickUp lists, distill
 * what the client publishes (tipos, objetivos, tono, formatos, rubro) and save
 * that to the client's brain (memory) so every future idea is grounded in it.
 * Idempotent — skips a client that already has the review memory.
 */
export async function reviewClientContentOnce(db: Db, clientId: string): Promise<{ reviewed: boolean }> {
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { reviewed: false };
  // Idempotent: skip if we already reviewed this client. Check the memory table
  // by key directly — scanning the truncated brain context missed the entry once
  // a client's brain grew past the char cap, re-running the AI review every boot.
  if (await hasMemory(db, clientId, CONTENT_REVIEW_KEY).catch(() => false)) return { reviewed: false };

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { reviewed: false };
  const names = await readClientPostNames(db, clientId);
  if (names.length === 0) return { reviewed: false };

  const system = [
    "Sos analista de contenido de LMTM. Te paso los títulos de los posteos que un cliente ya tiene cargados en ClickUp.",
    "Distilá un resumen accionable de: qué TIPO de contenido publica, qué OBJETIVOS predominan (COMERCIAL/ENGAGMENT/CONCEPTO), qué TONO usa, qué FORMATOS predominan (reel/carrusel/post/story/clip corto), y de qué RUBRO es.",
    "Devolvé 4-8 bullets concretos, en español rioplatense. Nada de relleno. Este texto se guarda como memoria del cliente y guía la generación de ideas futuras.",
  ].join("\n");
  const user = `Cliente: ${client.name}${client.industry ? ` — rubro: ${client.industry}` : ""}\n\nPosteos cargados (${names.length}):\n${names.map((n) => `- ${n}`).join("\n")}`;

  const summary = await aiNarrative(system, user).catch(() => null);
  if (!summary) return { reviewed: false };

  await upsertMemory(db, {
    companyId, clientId, kind: "context", key: CONTENT_REVIEW_KEY,
    content: `Review de contenido (de sus posteos en ClickUp):\n${summary.trim()}`,
    source: "content-review", pinned: true,
  });
  return { reviewed: true };
}

/** One-time review sweep across all active clients (skips already-reviewed). */
export async function sweepContentReviewOnce(db: Db): Promise<{ clients: number; reviewed: number }> {
  const rows = await activeClients(db);
  let reviewed = 0;
  for (const c of rows) {
    try {
      const r = await reviewClientContentOnce(db, c.id);
      if (r.reviewed) reviewed += 1;
    } catch { /* best-effort per client */ }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return { clients: rows.length, reviewed };
}

let contentTimer: ReturnType<typeof setInterval> | null = null;
let lastContentDay = "";

export function initContentIdeas(db: Db): void {
  if (contentTimer) return;
  // Boot: (1) ONE-TIME content review to seed each client's brain from its
  // existing posts, then (2) create today's idea for any client missing one.
  // The review is idempotent, so this only does real work the first time.
  setTimeout(() => {
    void (async () => {
      const rev = await sweepContentReviewOnce(db).catch((e) => {
        console.warn("[content-ideas] boot content review failed:", e);
        return { clients: 0, reviewed: 0 };
      });
      console.log(`[content-ideas] boot content review: ${rev.reviewed} reviewed / ${rev.clients} clients`);
      const day = await sweepDailyIdeas(db).catch((e) => {
        console.warn("[content-ideas] boot daily sweep failed:", e);
        return { clients: 0, created: 0 };
      });
      console.log(`[content-ideas] boot daily sweep: ${day.created} created / ${day.clients} clients`);
    })();
  }, 3 * 60 * 1000);

  // Daily: one idea per client per calendar day (checks every 3h, fires once/day).
  const tick = async () => {
    const day = new Date().toISOString().slice(0, 10);
    if (day === lastContentDay) return;
    lastContentDay = day;
    await sweepDailyIdeas(db)
      .then((r) => console.log(`[content-ideas] daily sweep: ${r.created} created / ${r.clients} clients`))
      .catch((e) => console.warn("[content-ideas] daily sweep failed:", e));
  };
  contentTimer = setInterval(() => { void tick(); }, 3 * 3600 * 1000);
  console.log("[content-ideas] scheduled DAILY idea generation (1/client/day)");
}
