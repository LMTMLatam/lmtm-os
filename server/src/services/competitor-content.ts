// LMTM-OS: competitor-driven content generation.
//
// Takes a client's manually-curated competitors + its Enfoque Técnico + brain,
// asks the AI to produce content split into "pauta" (paid) and "posteo"
// (organic), and stores it for review/export. Degrades to a deterministic
// skeleton if the AI is unavailable (same philosophy as agency-ops).

import { randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { competitors, contentIdeas, clients, clientMemory, videoReferences, contentPerformance } from "@paperclipai/db";
import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import { aiNarrative } from "./agency-ops.js";
import { getRedesCalendar } from "./clickup-sync.js";
import { getBrainContext, upsertMemory, hasMemory } from "./customer-brain.js";
import { resolveCompanyId, activeClients } from "./intel-common.js";
import { NON_LATIN_RE } from "./entrega-checks.js";
import { bloqueDeAngulos } from "./angulos-creativos.js";

/** Formatted block of the client's curated video references (from the team's
 * reference sheet) so idea generation can riff on formats the team likes.
 * Fallback: si el cliente no tiene referencias propias, usa las de su NICHO
 * (pares de rubro) — así ningún cliente genera "a ciegas". */
async function videoRefsBlock(db: Db, clientId: string): Promise<string> {
  let refs = await db
    .select({ url: videoReferences.url, categorias: videoReferences.categorias, comentario: videoReferences.comentario })
    .from(videoReferences)
    .where(eq(videoReferences.clientId, clientId))
    .limit(25)
    .catch(() => []);
  let origen = "del cliente";
  if (refs.length === 0) {
    const [c] = await db.select({ industry: clients.industry }).from(clients).where(eq(clients.id, clientId));
    if (c?.industry) {
      refs = await db
        .select({ url: videoReferences.url, categorias: videoReferences.categorias, comentario: videoReferences.comentario })
        .from(videoReferences)
        .innerJoin(clients, eq(videoReferences.clientId, clients.id))
        .where(and(eq(clients.industry, c.industry), eq(clients.status, "active")))
        .limit(12)
        .catch(() => []);
      origen = `del NICHO (el cliente no tiene propias)`;
    }
  }
  if (refs.length === 0) return "";
  const lines = refs.map((r) => {
    const cats = (r.categorias ?? []).join(", ");
    return `- ${r.url}${cats ? ` [${cats}]` : ""}${r.comentario ? ` — ${r.comentario}` : ""}`;
  });
  return `\nPerfil de videos ${origen} — referencias curadas por el equipo, etiquetadas con tipo (Blanda/VSL/Comercial/Engagement) y concepto (Cinemático, UGC, Viral…). Usalas como inspiración de formato/edición/tono, no copies literal. Si tu idea es de video, indicá en el copy qué TIPO y CONCEPTO le corresponde (ej: "Engagement · Cinemático") tomando este perfil como guía:\n${lines.join("\n")}`;
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
// Anti-loop (review 27/7: "Altecno está en loop de la misma idea"): las ideas
// recientes del cliente se inyectan al prompt y queda PROHIBIDO repetir tema.
async function ideasRecientesBlock(db: Db, clientId: string): Promise<string> {
  const rows = await db
    .select({ title: contentIdeas.title, format: contentIdeas.format })
    .from(contentIdeas)
    .where(and(eq(contentIdeas.clientId, clientId), gte(contentIdeas.createdAt, new Date(Date.now() - 45 * 86_400_000))))
    .orderBy(desc(contentIdeas.createdAt))
    .limit(25);
  if (rows.length === 0) return "";
  // Anti-MOLDE entre clientes (30/7): el equipo trabaja varias cuentas y veía
  // la misma fórmula en todas ("Detrás de escena / proceso — X" ×24, "Lo que
  // nadie te cuenta de…"). El historial del propio cliente no alcanza.
  const moldes = await db
    .select({ title: contentIdeas.title })
    .from(contentIdeas)
    .where(and(
      gte(contentIdeas.createdAt, new Date(Date.now() - 21 * 86_400_000)),
      ne(contentIdeas.clientId, clientId),
    ))
    .orderBy(desc(contentIdeas.createdAt))
    .limit(60);
  const aperturas = [...new Set(moldes.map((m) => m.title.toLowerCase().split(/\s+/).slice(0, 4).join(" ")))].slice(0, 20);

  return (
    "\nIDEAS YA GENERADAS para este cliente (últimos 45 días) — PROHIBIDO repetir el tema, el ángulo o el gancho de cualquiera de estas; además VARIÁ el formato (si la mayoría son carrusel, proponé reel/estático/story):\n" +
    rows.map((r) => `- [${r.format ?? "?"}] ${r.title}`).join("\n") +
    (aperturas.length
      ? "\n\nFÓRMULAS YA USADAS EN OTROS CLIENTES DE LA AGENCIA — PROHIBIDO abrir la idea con estos moldes (el equipo ve todas las cuentas y le resulta repetitivo). Buscá un ángulo propio de ESTE cliente:\n" +
        aperturas.map((a) => `- "${a}…"`).join("\n")
      : "")
  );
}

const GROUNDING_RULE =
  "REGLA DURA: NUNCA inventes ubicaciones (ciudades, barrios, zonas), precios, nombres de proyectos ni datos del cliente. " +
  "Usá SOLO lugares y datos que aparezcan explícitamente en el contexto del cliente. " +
  "Si el contexto no dice dónde opera, NO nombres lugares específicos.";

function clientLine(client: { name: string; industry: string | null; metadata: unknown }): string {
  const location = ((client.metadata as Record<string, unknown> | null)?.location as string | undefined)?.trim();
  return `Cliente: ${client.name}${client.industry ? ` — rubro: ${client.industry}` : ""}${location ? ` — opera en: ${location} (cualquier referencia geográfica debe ser de acá)` : ""}`;
}

// Pedido 24/7: la idea sale CERRADA — el diseñador la produce sin preguntar
// nada. Contrato compartido por la idea diaria y el plan de contenido.
const IDEA_CERRADA_SPEC = [
  'El campo "copy" lleva la idea COMPLETA Y CERRADA (bloques separados con \\n), lista para mandar a un diseñador sin que tenga que preguntar nada:',
  "IDEA: qué es y por qué encaja con ESTE cliente (2-3 líneas).",
  "COPY DEL POSTEO: el caption completo listo para publicar, en la voz del cliente (con hashtags si corresponden).",
  'Si format=carrusel: bloque SLIDES de 5 a 8 placas, cada una así → "SLIDE N — Texto: [el texto EXACTO de la placa] / Visual: [qué se ve: foto del cliente, ilustración, dato grande, ícono...]". El slide 1 es la portada-gancho, el último es el CTA.',
  'Si format=reel|video|clip corto: HOOK (las primeras 2 líneas textuales) + ESCENAS numeradas (qué se ve + VO o texto en pantalla) + duración objetivo.',
  'Si format=imagen|post|story: PLACA con el texto exacto sobre la imagen + Visual con la descripción precisa de la imagen.',
  "DISEÑO: indicaciones concretas para el diseñador (estilo, recursos reales del cliente a usar, referencia si hay).",
  "CTA: el llamado a la acción final.",
  "ANGULO: el id del angulo elegido, tal cual figura en la lista (ej: ANGULO: mito).",
  "Una idea a la que el diseñador tenga que adivinarle algo NO está terminada.",
].join("\n");

/**
 * Los ángulos que este cliente ya usó en sus últimas ideas.
 *
 * Se leen del texto guardado, no de una columna: las ideas viejas no tienen el
 * campo y agregar una migración para rotar ángulos es de más. Si no encuentra
 * ninguno devuelve vacío y la lista sale en su orden natural.
 */
async function angulosRecientes(db: Db, clientId: string): Promise<string[]> {
  const filas = await db
    .select({ copy: contentIdeas.copy })
    .from(contentIdeas)
    .where(eq(contentIdeas.clientId, clientId))
    .orderBy(desc(contentIdeas.createdAt))
    .limit(12);
  const vistos: string[] = [];
  for (const f of filas) {
    const m = (f.copy ?? "").match(/ANGULO\s*:\s*([a-z-]+)/i);
    if (m && !vistos.includes(m[1].toLowerCase())) vistos.push(m[1].toLowerCase());
  }
  return vistos.slice(0, 6);
}

export async function generateContentPlan(db: Db, clientId: string): Promise<{ batchId: string; created: number; ideas: GeneratedIdea[]; motivo?: string }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { batchId: "", created: 0, ideas: [] };
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { batchId: "", created: 0, ideas: [] };

  // Precondición: si el cliente no tiene a dónde publicar, generarle ideas es
  // trabajo que se descarta en silencio. Se arregla el caño primero. Al 10/9/26
  // eran 15 clientes activos en esa situación.
  const { puedeProducir } = await import("./cadena-publicacion.js");
  const pre = await puedeProducir(db, clientId).catch(() => null);
  if (pre && !pre.listo) {
    console.warn(`[content] no se genera para ${client.name}: ${pre.motivo}`);
    return { batchId: "", created: 0, ideas: [], motivo: pre.motivo };
  }

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
    "TODO el texto va en ESPAÑOL. Está PROHIBIDO dejar palabras en inglés sueltas — el equipo lee esto tal cual y lo tiene que corregir a mano. Nada de 'strangers', 'pillows menu', 'linking', 'tactile', 'fiber'. Se dicen: desconocidos, menú de almohadas, se conecta, táctil, fibra. Revisá el texto antes de responder.",
    GROUNDING_RULE,
    "Si el contexto del cliente incluye 'Feedback Super Redes', aplicalo a rajatabla: más de los patrones que el equipo aprueba, nada de lo que descarta.",
    // La voz de la marca, aprendida de lo que el cliente YA publicó. Sin esto el
    // copy salía correcto pero genérico: la misma pieza le servía a una
    // inmobiliaria y a una peluquería. Ver marca-aprendida.ts.
    await bloqueDeMarca(db, clientId),
    'Respondé SOLO con un array JSON: [{"kind":"pauta"|"posteo","format":"<UNA de: Post|Photo Post|Story|Carrusel|Tips y Trucos|Guia|Clip corto|Reel|Video Largo|Vivo|Articulo|Blog>","title":"...","copy":"...","rationale":"por qué / en qué se diferencia de la competencia"}]',
    IDEA_CERRADA_SPEC,
    // Los 18 ángulos de Aguara. Sin esto el agente escribía siempre la misma
    // forma: listas de errores y de tips. Mirando las 90 ideas de GRUPO MA se ve
    // — "5 errores que…", "3 señales de…", "lo que nadie te cuenta". El ángulo
    // es desde dónde se cuenta, y cambia la pieza entera (18/8).
    bloqueDeAngulos(client.industry ?? null, await angulosRecientes(db, clientId).catch(() => [])),
    "Cada una de las 6 ideas usa un ÁNGULO DISTINTO de la lista. Repetir ángulo es repetir la idea con otras palabras.",
    "Generá 3 ideas de pauta y 3 de posteo (6 en total) — profundidad antes que cantidad.",
  ].join("\n");

  const user = [
    clientLine(client),
    brain ? `\nContexto del cliente (Enfoque Técnico + memoria):\n${brain}` : "",
    `\nCompetencia:\n${compBlock}`,
    await videoRefsBlock(db, clientId),
    await ideasRecientesBlock(db, clientId).catch(() => ""),
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
    /** ClickUp distingue `drop_down` (value = id suelto) de `labels`
     *  (value = ARRAY de ids). Mandar un string a un campo labels no falla:
     *  simplemente deja el campo VACÍO — así se perdía "Tipo de Contenido" en
     *  cada idea (14/8). */
    fieldType(name: string): string | undefined { return byName.get(norm(name))?.type; },
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
  let list = (lists.lists ?? []).find((l) => /super\s*redes/i.test(l.name));
  if (!list) {
    // TODAS las ideas deben aparecer en Super Redes (pedido explícito del
    // usuario): si el folder no tiene la lista, la creamos en vez de dropear
    // las ideas en silencio. Los campos custom heredan del espacio "Clientes"
    // (creables vía POST /v2/space/{id}/field — p.ej. Puntuación/Devolución,
    // 2026-07-12); las tareas salen con nombre+tags y los campos del espacio.
    try {
      const created = (await (await fetch(`${CU_API}/folder/${folderId}/list`, {
        method: "POST", headers: H, body: JSON.stringify({ name: "Super Redes Sociales" }),
      })).json()) as { id?: string; name?: string };
      if (created.id) list = { id: created.id, name: created.name ?? "Super Redes Sociales" };
    } catch { /* sin permisos/red — se reintenta en la próxima pasada */ }
  }
  if (!list) return null;
  const fieldsRes = (await (await fetch(`${CU_API}/list/${list.id}/field`, { headers: H })).json()) as { fields?: CuField[] };
  const resolver = buildFieldResolver(fieldsRes.fields ?? []);
  const existing = (await (await fetch(`${CU_API}/list/${list.id}/task?include_closed=true&page=0`, { headers: H })).json()) as {
    tasks?: Array<{ name: string }>;
  };
  const have = new Set((existing.tasks ?? []).map((t) => norm(t.name)));
  return { listId: list.id, resolver, have };
}

/**
 * Lleva el `format` que devolvió el modelo a UNA de las 12 opciones reales del
 * dropdown "Tipo de Contenido" de ClickUp. Se pide en el prompt que elija de la
 * lista, pero los modelos igual devuelven "video", "imagen" o "texto": si no se
 * normaliza, `optionId` no encuentra la opción y el campo queda vacío otra vez.
 */
export function normalizarTipoContenido(format: string | undefined): string | null {
  const f = (format ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!f) return null;
  if (/vivo|live/.test(f)) return "Vivo";
  if (/video largo|largo/.test(f)) return "Video Largo";
  if (/reel/.test(f)) return "Reel";
  if (/clip|short/.test(f)) return "Clip corto";
  if (/story|historia/.test(f)) return "Story";
  if (/carrusel|carousel/.test(f)) return "Carrusel";
  if (/tips|trucos/.test(f)) return "Tips y Trucos";
  if (/guia/.test(f)) return "Guia";
  if (/articulo|nota/.test(f)) return "Articulo";
  if (/blog/.test(f)) return "Blog";
  if (/photo post|foto/.test(f)) return "Photo Post";
  if (/post|imagen|placa|feed|texto/.test(f)) return "Post";
  // "video" a secas: un video sin más datos es un reel para redes.
  if (/video/.test(f)) return "Reel";
  return null;
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

  // Tipo de Contenido (14/8): antes la idea salía con este campo VACÍO y el
  // equipo lo completaba a mano. Ahora lo decide el agente al generarla, y de
  // ese campo depende qué se genera después con la etiqueta "generar contenido"
  // (Reel → 3 clips, Clip corto → 1 clip, Carrusel → N placas, Post → placa).
  const tipo = normalizarTipoContenido(idea.format);
  if (tipo) {
    const tcId = resolver.fieldId("Tipo de Contenido");
    const optId = resolver.optionId("Tipo de Contenido", tipo);
    // "Tipo de Contenido" es `labels`: el value va como array o el campo queda
    // vacío sin error (verificado contra ClickUp 14/8).
    const esLabels = resolver.fieldType("Tipo de Contenido") === "labels";
    push(tcId, optId != null ? (esLabels ? [optId] : optId) : undefined);
  }

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

/**
 * Palabras en inglés que MiniMax deja sueltas en el texto ESPAÑOL de la idea.
 * Verificado en producción (15/8): "eluteando con strangers", "el pillows menu",
 * "se linking con su conocimiento", "el detalle tactile". El equipo abre la
 * tarjeta y lee eso: queda mal y hay que reescribirlo a mano.
 *
 * Solo se listan palabras que NO son parte del castellano de agencia — "reel",
 * "story", "post", "carrusel", "marketing", "brief" y demás se usan a diario y
 * no se tocan.
 */
const INGLES_SUELTO = /\b(strangers?|pillows?|linking|tactile|fiber|amazing|awesome|customers?|feelings?|insights?|thinking|building|shopping|winning|sharing|nowadays|actually|however|therefore|indeed)\b/i;

/** Devuelve las palabras en inglés encontradas en el texto de la idea. */
export function inglesEnIdea(idea: GeneratedIdea): string[] {
  const texto = `${idea.title} ${idea.copy ?? ""} ${idea.rationale ?? ""}`;
  const hits = new Set<string>();
  for (const m of texto.matchAll(new RegExp(INGLES_SUELTO, "gi"))) hits.add(m[0].toLowerCase());
  return [...hits];
}

/**
 * Descarta las ideas que no son del negocio del cliente.
 *
 * MiniMax alucina a partir del NOMBRE cuando se parece a otra cosa: a BRACHETTA
 * (baterías de auto) le escribió "El experto en bruschettas que no sabías que
 * necesitabas", con copy de tomate y albahaca (17/8). El brain tenía el dato
 * correcto — "empresa rosarina especializada en baterías" — así que no es falta
 * de contexto: es que nadie revisaba la idea contra el negocio antes de subirla.
 *
 * Una sola llamada por cliente valida todo el lote. Ante la duda se deja pasar:
 * perder una idea buena es peor que dejar una rara que el equipo descarta.
 */
async function ideasFueraDeRubro(
  db: Db,
  clientId: string,
  clienteNombre: string,
  ideas: GeneratedIdea[],
): Promise<Set<number>> {
  const fuera = new Set<number>();
  if (ideas.length === 0) return fuera;

  const [c] = await db.select({ industry: clients.industry }).from(clients).where(eq(clients.id, clientId));
  const [negocio] = await db.select({ content: clientMemory.content })
    .from(clientMemory)
    .where(and(eq(clientMemory.clientId, clientId), eq(clientMemory.key, "enfoque-tecnico")))
    .limit(1);
  const contexto = (negocio?.content ?? "").slice(0, 1200);
  // Sin descripción del negocio no hay con qué comparar: no se filtra nada.
  if (contexto.length < 80) return fuera;

  const sistema = [
    "Te dan la descripción de un negocio y una lista numerada de ideas de contenido.",
    "Devolvé SOLO un JSON array con los NÚMEROS de las ideas que NO tienen nada que ver con ese negocio.",
    "Una idea está BIEN si habla del rubro, sus clientes, sus productos, su equipo o efemérides generales.",
    "Marcala como MALA solo si habla de otro rubro por completo (ej: recetas de cocina para una empresa de baterías).",
    "Ante la duda, NO la marques. Si están todas bien devolvé [].",
  ].join(" ");
  const lista = ideas.map((x, i) => `${i + 1}. ${x.title}`).join("\n");
  const salida = await aiNarrative(
    sistema,
    `Negocio: ${clienteNombre}${c?.industry ? ` (rubro ${c.industry})` : ""}\n${contexto}\n\nIdeas:\n${lista}`,
  );
  if (!salida) return fuera;
  try {
    const limpio = salida.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const nums = JSON.parse(limpio.slice(limpio.indexOf("["), limpio.lastIndexOf("]") + 1)) as unknown[];
    // Si dice que TODAS están mal, casi seguro se confundió el modelo, no el
    // agente de ideas: se ignora antes que borrar el lote entero.
    if (!Array.isArray(nums) || nums.length >= ideas.length) return fuera;
    for (const n of nums) {
      const i = Number(n) - 1;
      if (Number.isInteger(i) && i >= 0 && i < ideas.length) fuera.add(i);
    }
  } catch { /* respuesta ilegible: no se filtra */ }
  return fuera;
}

async function pushIdeasToSuperRedes(db: Db, clientId: string, ideas: GeneratedIdea[]): Promise<void> {
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  if (!token || ideas.length === 0) return;
  const H = { Authorization: token, "Content-Type": "application/json" };
  const ctx = await resolveSuperRedes(db, clientId, H);
  if (!ctx) return;

  const [cli] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId));
  const fueraDeRubro = await ideasFueraDeRubro(db, clientId, cli?.name ?? "", ideas).catch(() => new Set<number>());

  for (const [indice, idea] of ideas.entries()) {
    if (fueraDeRubro.has(indice)) {
      console.warn(`[ideas] descartada por no ser del rubro de ${cli?.name ?? clientId}: "${idea.title.slice(0, 60)}"`);
      continue;
    }
    if (looksBoilerplate(idea)) continue; // QA gate — don't mirror generic ideas
    // Spanglish: se avisa en el log y la idea igual pasa (tiene valor aunque
    // haya que corregir una palabra); bloquearla sería peor que dejarla.
    const ingles = inglesEnIdea(idea);
    if (ingles.length > 0) {
      console.warn(`[ideas] "${idea.title.slice(0, 50)}" trae inglés suelto: ${ingles.join(", ")}`);
    }
    // El TÍTULO también se sanea. Se saneaba solo la descripción, y así quedó
    // en ClickUp "El test de voltaje que revelará si tu batería está的命运"
    // (17/8): MiniMax filtra chino y el título es justo lo que ve el equipo.
    const name = idea.title.replace(new RegExp(NON_LATIN_RE.source, "g"), "").replace(/\s+/g, " ").trim().slice(0, 250);
    if (name.length < 12 || ctx.have.has(norm(name))) continue; // never duplicate an existing idea
    const customFields = buildIdeaCustomFields(ctx.resolver, idea);
    // La idea CERRADA viaja completa en la descripción (antes solo iba el
    // título y el equipo veía un titular pelado — bug visto 24/7).
    // Saneo determinista (26/7): sin caracteres no latinos ni links muertos —
    // acá no hay agente al que devolverle el error, se limpia directo.
    const { sanearTextoPipeline } = await import("./entrega-checks.js");
    const description = await sanearTextoPipeline([
      idea.copy?.trim() ?? "",
      idea.rationale ? `\n---\nPor qué / diferencial: ${idea.rationale.trim()}` : "",
    ].join("\n").trim());
    const body: Record<string, unknown> = { name, tags: ["idea-lmtm-os"] };
    if (description) body.description = description;
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
    "TODO el texto va en ESPAÑOL. Está PROHIBIDO dejar palabras en inglés sueltas — el equipo lee esto tal cual y lo tiene que corregir a mano. Nada de 'strangers', 'pillows menu', 'linking', 'tactile', 'fiber'. Se dicen: desconocidos, menú de almohadas, se conecta, táctil, fibra. Revisá el texto antes de responder.",
    GROUNDING_RULE,
    "Si el contexto del cliente incluye 'Feedback Super Redes', aplicalo a rajatabla: más de los patrones que el equipo aprueba, nada de lo que descarta.",
    'Respondé SOLO con un array JSON de UN elemento: [{"kind":"posteo","format":"<UNA de: Post|Photo Post|Story|Carrusel|Tips y Trucos|Guia|Clip corto|Reel|Video Largo|Vivo|Articulo|Blog>","title":"la idea en una línea","copy":"la idea CERRADA según el spec de abajo","objetivo":"COMERCIAL|ENGAGMENT|CONCEPTO","rationale":"en qué se diferencia de la competencia"}]',
    IDEA_CERRADA_SPEC,
  ].join("\n");
  const vids = await videoRefsBlock(db, clientId);
  const user = [
    clientLine(client),
    brain ? `\nContexto del cliente (Enfoque Técnico + memoria):\n${brain}` : "",
    `\nCompetencia:\n${compBlock}`,
    vids,
    await ideasRecientesBlock(db, clientId).catch(() => ""),
  ].join("\n");

  let idea: GeneratedIdea | null = null;
  const aiRaw = await aiNarrative(system, user).catch(() => null);
  if (aiRaw) idea = parseIdeas(aiRaw)[0] ?? null;
  // Gate binario "idea cerrada" (curso reliable-agents 26/7): si el juez dice
  // que la idea NO está lista para un diseñador, se regenera UNA vez con el
  // motivo inyectado; el segundo intento queda (el equipo revisa igual).
  if (idea?.copy) {
    try {
      const { gateBinario } = await import("./entrega-checks.js");
      const v = await gateBinario({
        criterio: "¿La idea está CERRADA para mandar a un diseñador sin adivinar nada? (copy completo y específico del cliente; si es carrusel, cada slide con su texto exacto; visual definido; CTA). Genérica o incompleta = false.",
        contenido: `${idea.title}\n${idea.copy}`,
      });
      if (!v.ok && v.motivo) {
        const retryRaw = await aiNarrative(
          system + `\nOJO: tu intento anterior falló la verificación de calidad por esto: "${v.motivo}". Corregilo.`,
          user,
        ).catch(() => null);
        const retry = retryRaw ? parseIdeas(retryRaw)[0] ?? null : null;
        if (retry?.copy) idea = retry;
      }
    } catch { /* gate best-effort */ }
  }
  // Sin idea de la IA NO inventamos una genérica (30/7): el fallback fijo
  // "Detrás de escena / proceso — X" se publicó 24 veces en 30 días y es la
  // cara visible de "las ideas son repetitivas". Mejor ninguna que una de
  // relleno — mañana vuelve a intentar.
  if (!idea) {
    console.warn(`[content-ideas] sin idea de IA para ${client.name} — se omite (no se genera relleno)`);
    return { created: false };
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

// ── Feedback loop: learn from what the team does with the agent's ideas ──────
//
// Reads each client's "Super Redes Sociales" list and compares the fate of the
// ideas we created (tag idea-lmtm-os) against the team's own posts: what got
// APROBADO / moved past IDEA vs what sat pending or was deleted. The distilled
// result is pinned to the client's brain so the next generation round produces
// MORE of what the team adopts and less of what dies — the ramp toward agent
// posts as good as the team's, and eventually a fully automatic pipeline.

const FEEDBACK_KEY = "super-redes-feedback";
const OUR_TAG = "idea-lmtm-os";

type SrCustomField = {
  name?: string;
  type?: string;
  value?: unknown;
  type_config?: { options?: Array<{ id: string; name?: string; label?: string; orderindex?: number }> };
};

/** Label of a drop_down custom field VALUE (ClickUp returns the option's
 * orderindex or id depending on the endpoint — accept both). */
function dropdownLabel(f: SrCustomField | undefined): string | null {
  if (!f || f.value == null) return null;
  const opt = (f.type_config?.options ?? []).find((o) => o.id === f.value || o.orderindex === f.value);
  return (opt?.name ?? opt?.label ?? "").trim() || null;
}

type SrTask = {
  id?: string;
  name: string; ours: boolean; aprobacion: string | null; estado: string | null; objetivo: string | null;
  /** "Puntuación" (1-5) que el equipo le puso a la idea — señal fina de calidad. */
  score: number | null;
  /** "Devolución" escrita del equipo — la señal de aprendizaje más fuerte. */
  devolucion: string | null;
};

/** Numeric value of the "Puntuación" field regardless of how the team built it
 *  (rating/emoji → number, number → number, dropdown → parse the option label). */
function scoreOf(f: SrCustomField | undefined): number | null {
  if (!f || f.value == null) return null;
  if (typeof f.value === "number" && Number.isFinite(f.value)) return f.value;
  if (typeof f.value === "string" && /^\d+([.,]\d+)?$/.test(f.value.trim())) return parseFloat(f.value.replace(",", "."));
  const label = dropdownLabel(f);
  const n = label ? parseInt(label, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

async function readSuperRedesTasks(db: Db, clientId: string): Promise<SrTask[] | null> {
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  if (!token) return null;
  const H = { Authorization: token, "Content-Type": "application/json" };
  const [client] = await db.select({ folderId: clients.clickupFolderId }).from(clients).where(eq(clients.id, clientId));
  if (!client?.folderId) return null;
  const lists = (await (await fetch(`${CU_API}/folder/${client.folderId}/list?archived=false`, { headers: H })).json()) as {
    lists?: Array<{ id: string; name: string }>;
  };
  const list = (lists.lists ?? []).find((l) => /super\s*redes/i.test(l.name));
  if (!list) return null;
  const r = (await (await fetch(`${CU_API}/list/${list.id}/task?include_closed=true&page=0`, { headers: H })).json()) as {
    tasks?: Array<{ id?: string; name?: string; tags?: Array<{ name?: string }>; custom_fields?: SrCustomField[] }>;
  };
  const mapped = (r.tasks ?? [])
    .map((t) => {
      const cfs = t.custom_fields ?? [];
      const byName = (n: string) => cfs.find((c) => norm(c.name ?? "") === norm(n));
      const txt = (f: SrCustomField | undefined) =>
        typeof f?.value === "string" && f.value.trim() ? f.value.trim().slice(0, 400) : null;
      // El equipo escribe la devolución en cualquiera de los dos campos
      // (30/7: "Comentario de cliente" se estaba perdiendo).
      const devolucion = txt(byName("Devolución") ?? byName("Devolucion")) ?? txt(byName("Comentario de cliente"));
      return {
        id: t.id ?? "",
        name: (t.name ?? "").trim(),
        ours: (t.tags ?? []).some((tg) => norm(tg.name ?? "") === OUR_TAG),
        aprobacion: dropdownLabel(byName("Aprobación de cliente")),
        estado: dropdownLabel(byName("Estado de producción")),
        objetivo: dropdownLabel(byName("Objetivo de contenido")),
        score: scoreOf(byName("Puntuación") ?? byName("Puntuacion")),
        devolucion,
      };
    })
    .filter((t) => t.name);

  // Las devoluciones también llegan como COMENTARIOS de ClickUp (30/7: el
  // equipo comenta la tarea en vez de llenar el campo). Se leen solo para las
  // ideas del agente sin devolución cargada — 1 request por tarea, acotado.
  const sinDev = mapped.filter((t) => t.ours && !t.devolucion && t.id).slice(0, 12);
  for (const t of sinDev) {
    try {
      const cr = (await (await fetch(`${CU_API}/task/${t.id}/comment`, { headers: H })).json()) as {
        comments?: Array<{ comment_text?: string; user?: { username?: string } }>;
      };
      const texto = (cr.comments ?? [])
        .map((c) => (c.comment_text ?? "").trim())
        .filter((c) => c.length > 15)
        .join(" · ");
      if (texto) t.devolucion = texto.slice(0, 400);
    } catch { /* best-effort por tarea */ }
    await new Promise((res) => setTimeout(res, 120));
  }
  return mapped;
}

const isApproved = (t: SrTask) => /aprobad/i.test(t.aprobacion ?? "");
// "Taken" = the team engaged with it: client review, or produced past IDEA.
const isTaken = (t: SrTask) => isApproved(t) || /revisi/i.test(t.aprobacion ?? "") || (!!t.estado && !/^idea$/i.test(t.estado));

/**
 * Close the loop for ONE client: tally what happened to the agent's ideas in
 * Super Redes, distill the pattern with AI, and pin it to the client's brain
 * (key super-redes-feedback). Overwrites the previous snapshot — idempotent.
 */
export async function runSuperRedesFeedback(db: Db, clientId: string): Promise<{ updated: boolean; pending?: number }> {
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { updated: false };
  const tasks = await readSuperRedesTasks(db, clientId).catch(() => null);
  if (!tasks) return { updated: false };
  const ours = tasks.filter((t) => t.ours);
  const team = tasks.filter((t) => !t.ours);
  if (ours.length === 0) return { updated: false };

  // Ideas we generated ≥3 days ago that no longer exist in the list were
  // deleted (or renamed) by the team — the strongest negative signal we get.
  const have = new Set(tasks.map((t) => norm(t.name)));
  const cutoff = new Date(Date.now() - 3 * 86_400_000);
  const past = await db
    .select({ title: contentIdeas.title, copy: contentIdeas.copy })
    .from(contentIdeas)
    .where(and(eq(contentIdeas.clientId, clientId), lte(contentIdeas.createdAt, cutoff)));
  const discarded = past
    .filter((p) => !looksBoilerplate({ kind: "posteo", title: p.title, copy: p.copy ?? undefined }))
    .filter((p) => !have.has(norm(p.title)))
    .map((p) => p.title);

  const approved = ours.filter(isApproved);
  const taken = ours.filter((t) => isTaken(t) && !isApproved(t));
  const pending = ours.length - approved.length - taken.length;
  const teamTaken = team.filter(isTaken);
  const ourRate = Math.round(((approved.length + taken.length) / ours.length) * 100);
  const teamRate = team.length ? Math.round((teamTaken.length / team.length) * 100) : 0;

  // Puntuación (1-5) + Devolución escrita: la señal fina que el equipo carga
  // por idea. Una devolución dice POR QUÉ algo funciona o no — pesa más que el
  // destino binario aprobado/borrado.
  const scored = ours.filter((t) => t.score != null);
  const avgScore = scored.length ? scored.reduce((a, t) => a + (t.score as number), 0) / scored.length : null;
  const withDevolucion = ours.filter((t) => t.devolucion);

  // Distill only when there's real signal — otherwise just store the tallies.
  let bullets = "";
  if (approved.length + taken.length + discarded.length + scored.length + withDevolucion.length > 0) {
    const system = [
      "Sos el editor de contenido de LMTM. Analizás qué pasó con ideas de posteo generadas por agentes IA en el ClickUp de un cliente, para que la próxima tanda sea mejor.",
      "Compará: (a) ideas del agente que el equipo aprobó o tomó en producción, (b) ideas del agente descartadas (borradas) o ignoradas, (c) posteos propios del equipo — el estándar a igualar o superar.",
      "SEÑAL PRIORITARIA: las Puntuaciones (1-5) y Devoluciones escritas del equipo dicen POR QUÉ una idea funciona o no — pesalas por encima del destino binario. Citá las devoluciones al derivar patrones.",
      "Devolvé máximo 6 bullets accionables en español rioplatense: patrones de tema/ángulo/objetivo/formato que SÍ adopta el equipo, y qué evitar. Concreto, sin relleno — esto se inyecta como memoria para la próxima generación de ideas.",
    ].join("\n");
    const fmt = (ts: SrTask[]) => ts.slice(0, 25).map((t) => `- ${t.name}${t.objetivo ? ` [${t.objetivo}]` : ""}`).join("\n");
    const fmtScored = (ts: SrTask[]) => ts.slice(0, 20)
      .map((t) => `- ${t.name} → ${t.score != null ? `${t.score}/5` : "sin puntuar"}${t.devolucion ? ` — "${t.devolucion}"` : ""}`)
      .join("\n");
    const feedbackTasks = ours.filter((t) => t.score != null || t.devolucion);
    const user = [
      feedbackTasks.length
        ? `Puntuaciones y devoluciones del equipo (SEÑAL MÁS FUERTE, ${feedbackTasks.length}):\n${fmtScored(feedbackTasks)}\n`
        : "",
      `Aprobadas/tomadas del agente (${approved.length + taken.length}):\n${fmt([...approved, ...taken]) || "(ninguna)"}`,
      `\nDescartadas o ignoradas del agente (${discarded.length + pending}):\n${[...discarded.slice(0, 15).map((n) => `- ${n} (borrada)`), ...fmt(ours.filter((t) => !isTaken(t)) as SrTask[]).split("\n").filter(Boolean).slice(0, 10)].join("\n") || "(ninguna)"}`,
      `\nPosteos del equipo tomados/aprobados (referencia de calidad, ${teamTaken.length}):\n${fmt(teamTaken) || "(sin posteos del equipo)"}`,
    ].filter(Boolean).join("\n");
    bullets = (await aiNarrative(system, user).catch(() => null))?.trim() ?? "";
  }

  // ── Loop de RESULTADOS: idea adoptada → calendario real → publicada →
  // engagement. Cierra el círculo más allá del gusto del equipo: mide si los
  // posts nacidos de ideas del agente rinden como los del cliente. El match
  // idea↔post es por solapamiento de tokens del título y la ventana de
  // engagement es ±1.5 días de la fecha del post — aproximado y dicho como tal.
  let resultados = "";
  try {
    const adopted = [...approved, ...taken];
    if (adopted.length > 0) {
      const tokensOf = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
      const titleMatch = (a: string, b: string) => {
        const ta = tokensOf(a), tb = tokensOf(b);
        if (ta.size < 2 || tb.size < 2) return false;
        let inter = 0;
        for (const w of ta) if (tb.has(w)) inter += 1;
        return inter / Math.min(ta.size, tb.size) >= 0.6;
      };
      const nowMs = Date.now();
      const cal = (await getRedesCalendar(db, clientId, nowMs - 60 * 86_400_000, nowMs + 30 * 86_400_000).catch(() => null)) ?? [];
      const matches = adopted
        .map((idea) => cal.find((it) => titleMatch(idea.name, it.name)))
        .filter((it): it is NonNullable<typeof it> => !!it);
      if (matches.length > 0) {
        const publicadas = matches.filter((m) => m.published);
        let linea = `- Resultados reales: ${matches.length} de las ${adopted.length} ideas adoptadas llegaron al calendario de Redes; ${publicadas.length} ya publicadas.`;
        if (publicadas.length > 0) {
          const cps = await db.select({ score: contentPerformance.score, publishedAt: contentPerformance.publishedAt })
            .from(contentPerformance)
            .where(and(eq(contentPerformance.clientId, clientId), eq(contentPerformance.source, "organic")));
          const scores = cps.map((r) => Number(r.score)).filter((s) => Number.isFinite(s) && s > 0);
          const avgAll = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
          const ideaScores: number[] = [];
          for (const m of publicadas) {
            const t = new Date(m.date).getTime();
            for (const r of cps) {
              if (!r.publishedAt) continue;
              if (Math.abs(new Date(r.publishedAt).getTime() - t) <= 1.5 * 86_400_000) {
                const s = Number(r.score);
                if (Number.isFinite(s) && s > 0) ideaScores.push(s);
              }
            }
          }
          if (ideaScores.length > 0 && avgAll > 0) {
            const avgIdeas = ideaScores.reduce((a, b) => a + b, 0) / ideaScores.length;
            linea += ` Engagement de esos posts: ${Math.round(avgIdeas)} vs ${Math.round(avgAll)} promedio del cliente (ventana ±1.5 días, aproximado)${avgIdeas >= avgAll ? " — las ideas del agente rinden igual o mejor: repetir esos ángulos" : " — rinden por debajo del promedio: revisar ángulo/formato de lo que se propone"}.`;
          }
        }
        resultados = linea;
      }
    }
  } catch { /* resultados es best-effort */ }

  // Devoluciones textuales del equipo: van verbatim a la memoria — es la voz
  // directa de "qué queremos", más valiosa que cualquier destilado.
  const devolucionLines = withDevolucion.slice(0, 6)
    .map((t) => `  · "${t.name}"${t.score != null ? ` (${t.score}/5)` : ""}: ${t.devolucion}`);

  const today = new Date().toISOString().slice(0, 10);
  const content = [
    `Feedback Super Redes (auto, ${today}) — destino de las ideas del agente en la lista "Super Redes Sociales":`,
    `- Ideas del agente: ${ours.length} en la lista → ${approved.length} aprobadas, ${taken.length} tomadas (revisión/producción), ${pending} pendientes. Descartadas por el equipo (borradas/renombradas): ${discarded.length}.`,
    `- Tasa de adopción: agente ${ourRate}% vs equipo ${teamRate}%. Meta: igualar o superar al equipo de forma sostenida — ahí el pipeline pasa a 100% automático.`,
    avgScore != null ? `- Puntuación del equipo: promedio ${avgScore.toFixed(1)}/5 sobre ${scored.length} idea${scored.length === 1 ? "" : "s"} puntuada${scored.length === 1 ? "" : "s"}.` : "",
    devolucionLines.length ? `- Devoluciones del equipo (aplicar a rajatabla en la próxima tanda):\n${devolucionLines.join("\n")}` : "",
    resultados,
    bullets ? `\n${bullets}` : "",
  ].filter(Boolean).join("\n");

  await upsertMemory(db, {
    companyId, clientId, kind: "context", key: FEEDBACK_KEY,
    content, source: "super-redes-feedback", pinned: true,
  });
  return { updated: true, pending };
}

/** Daily feedback pass across all active clients (paced, best-effort).
 *  Con { digest: true } (los lunes, desde el tick diario) manda además un
 *  WhatsApp al equipo con las ideas pendientes de revisión — el ritual humano
 *  del que depende TODO el loop de aprendizaje: sin aprobar/borrar ideas en
 *  Super Redes, la tasa de adopción no se mueve y el agente no aprende. */
export async function sweepSuperRedesFeedback(db: Db, opts: { digest?: boolean } = {}): Promise<{ clients: number; updated: number }> {
  const rows = await activeClients(db);
  let updated = 0;
  const pendientes: Array<{ name: string; pending: number }> = [];
  for (const c of rows) {
    try {
      const r = await runSuperRedesFeedback(db, c.id);
      if (r.updated) updated += 1;
      if (r.pending && r.pending > 0) pendientes.push({ name: c.name, pending: r.pending });
    } catch { /* best-effort per client */ }
    await new Promise((res) => setTimeout(res, 1500));
  }

  if (opts.digest && pendientes.length > 0) {
    const { sendWhatsAppToNumber, alertsNumber } = await import("./agency-ops.js");
    const team = alertsNumber();
    if (team) {
      pendientes.sort((a, b) => b.pending - a.pending);
      const total = pendientes.reduce((a, p) => a + p.pending, 0);
      const lines = [
        `*💡 ${total} ideas de agentes esperan revisión en Super Redes*`,
        "",
        ...pendientes.slice(0, 15).map((p) => `• *${p.name}*: ${p.pending} pendiente${p.pending === 1 ? "" : "s"}`),
        "",
        "_Aprobar (Aprobación de cliente → APROBADO) o borrar las malas. Mejor todavía: puntuá 1-5 (campo Puntuación) y dejá una Devolución escrita — el agente aprende directo de esas palabras: lo bien puntuado se repite, lo criticado se corrige._",
      ];
      await sendWhatsAppToNumber(team, lines.join("\n")).catch(() => {});
    }
  }

  return { clients: rows.length, updated };
}

/**
 * Backfill: empuja TODAS las ideas guardadas en content_ideas a la lista
 * Super Redes de cada cliente (pedido explícito: ninguna idea puede quedar
 * solo en la DB/panel). Deduplica contra las tareas existentes por nombre y
 * filtra boilerplate — reusa el mismo camino que la generación diaria, así
 * que también crea la lista si falta.
 */
export async function backfillIdeasToSuperRedes(db: Db): Promise<{ clients: number; pushed: number }> {
  const rows = await activeClients(db);
  let pushedTotal = 0;
  for (const c of rows) {
    try {
      const stored = await db.select().from(contentIdeas).where(eq(contentIdeas.clientId, c.id));
      if (stored.length === 0) continue;
      const ideas: GeneratedIdea[] = stored.map((i) => ({
        kind: (i.kind === "pauta" ? "pauta" : "posteo"),
        format: i.format ?? undefined,
        title: i.title,
        copy: i.copy ?? undefined,
        rationale: i.rationale ?? undefined,
      }));
      const token = process.env.CLICKUP_API_TOKEN?.trim();
      if (!token) break;
      const H = { Authorization: token, "Content-Type": "application/json" };
      const ctx = await resolveSuperRedes(db, c.id, H);
      if (!ctx) continue;
      const before = ctx.have.size;
      for (const idea of ideas) {
        if (looksBoilerplate(idea)) continue;
        const name = idea.title.trim().slice(0, 250);
        if (!name || ctx.have.has(norm(name))) continue;
        const customFields = buildIdeaCustomFields(ctx.resolver, idea);
        const body: Record<string, unknown> = { name, tags: ["idea-lmtm-os"] };
        if (customFields.length) body.custom_fields = customFields;
        try {
          const res = await fetch(`${CU_API}/list/${ctx.listId}/task`, { method: "POST", headers: H, body: JSON.stringify(body) });
          if (res.ok) ctx.have.add(norm(name));
        } catch { /* best-effort per idea */ }
        await new Promise((r) => setTimeout(r, 250));
      }
      pushedTotal += ctx.have.size - before;
    } catch { /* best-effort per client */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { clients: rows.length, pushed: pushedTotal };
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
  // "Redes Sociales" + "Super Redes Sociales" + "Producción de video": las
  // listas donde vive el contexto real del cliente (pedido explícito del
  // usuario: SIEMPRE tomar contexto de redes Y producción de video).
  const targets = (lists.lists ?? []).filter((l) => /redes\s*sociales/i.test(l.name) || /produ\S*\s+de\s+v[ií]deos?/i.test(l.name));
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
      const fb = await sweepSuperRedesFeedback(db).catch((e) => {
        console.warn("[content-ideas] boot feedback sweep failed:", e);
        return { clients: 0, updated: 0 };
      });
      console.log(`[content-ideas] boot feedback sweep: ${fb.updated} updated / ${fb.clients} clients`);
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
    // Feedback first, so today's ideas are generated with yesterday's lessons.
    // Lunes: digest de ideas pendientes al equipo (el ritual del que depende el loop).
    await sweepSuperRedesFeedback(db, { digest: new Date().getDay() === 1 })
      .then((r) => console.log(`[content-ideas] feedback sweep: ${r.updated} updated / ${r.clients} clients`))
      .catch((e) => console.warn("[content-ideas] feedback sweep failed:", e));
    await sweepDailyIdeas(db)
      .then((r) => console.log(`[content-ideas] daily sweep: ${r.created} created / ${r.clients} clients`))
      .catch((e) => console.warn("[content-ideas] daily sweep failed:", e));
  };
  contentTimer = setInterval(() => { void tick(); }, 3 * 3600 * 1000);
  console.log("[content-ideas] scheduled DAILY idea generation (1/client/day)");
}

/**
 * La voz de la marca como bloque de prompt, o "" si todavía no se aprendió.
 *
 * Devolver "" en vez de un texto genérico es a propósito: una instrucción de
 * marca inventada es peor que ninguna, porque el modelo la obedece igual y
 * produce una voz que el cliente no tiene.
 */
async function bloqueDeMarca(db: Db, clientId: string): Promise<string> {
  try {
    const { clientBrand } = await import("@paperclipai/db");
    const [m] = await db.select().from(clientBrand).where(eq(clientBrand.clientId, clientId)).limit(1);
    if (!m) return "";
    const partes: string[] = [];
    if (m.tono) partes.push(`Tono de la marca: ${m.tono}`);
    if (m.publico) partes.push(`Le habla a: ${m.publico}`);
    if (m.mensaje) partes.push(`Promete: ${m.mensaje}`);
    if (m.diferencial) partes.push(`Se diferencia por: ${m.diferencial}`);
    const si = (m.palabrasSi ?? []).slice(0, 12);
    const no = (m.palabrasNo ?? []).slice(0, 12);
    if (si.length) partes.push(`Palabras y expresiones que ESTA marca usa de verdad: ${si.join(", ")}. Escribí con esas, no con sinónimos.`);
    if (no.length) partes.push(`Registros que NO usa: ${no.join(", ")}.`);
    if (partes.length === 0) return "";
    return ["", "VOZ DE LA MARCA (aprendida de lo que el cliente ya publicó — respetala):", ...partes].join("\n");
  } catch {
    return "";
  }
}
