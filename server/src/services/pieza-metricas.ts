// LMTM-OS: el lazo de medición de las piezas del Productor (02/11).
//
// De cada pieza entregada ya se sabe el estilo, el tipo de gancho, el pilar y los insertos (metadata
// del entregable). Falta saber cómo rindió: se saca una foto a las 24 h y a los 7 días del posteo, y
// antes de proponer el Productor mira el ganador de ESE cliente y de su rubro.
//
// El estudio de lo viral del kit son datos de UNA cuenta: acá todo es hipótesis a medir por cliente.
//
// VINCULAR PIEZA Y POSTEO: el video lo publica una persona o Make, y el posteo no trae ninguna marca de
// qué pieza es. Se vincula solo si hay certeza (la tarea de ClickUp salió y hay UN solo reel en esas
// horas) o si alguien pega el link en el panel. Nunca al más cercano: una atribución mal hecha le
// enseñaría al sistema lo contrario de lo que pasó.

import type { Db } from "@paperclipai/db";
import { adsConnections, agentDeliverables, clients, hooks, organicPostInsights, organicPosts, piezaMetricas } from "@paperclipai/db";
import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import { engagementDe } from "./organico-aprendizaje.js";
import { mediana } from "./contenido-analisis.js";

const GRAPH = "https://graph.facebook.com/v21.0";
const DIA = 86_400_000;
const MOMENTOS = [{ momento: "24h", horas: 24 }, { momento: "7d", horas: 168 }] as const;
/** Para decir que algo rinde: piezas medidas del mismo cliente y, de cada valor, al menos estas. */
const MIN_PIEZAS = 3;
const MIN_POR_VALOR = 2;

/**
 * Hipótesis por rubro. «Te escriben cuando estás cerrado» solo donde es real: turnos, pedidos, reservas o
 * consultas. En el resto hay que buscar su propia tensión. Las claves son las de clients.industry.
 */
export const TENSION_POR_RUBRO: Record<string, { cerrado: boolean; tension: string }> = {
  "turismo-hoteleria": { cerrado: true, tension: "reservan a la noche, cuando no hay nadie en recepción" },
  inmobiliaria: { cerrado: true, tension: "consultan una propiedad fuera de horario; la que no se contesta se va" },
  "retail-consumo": { cerrado: true, tension: "piden fuera de horario o no encuentran lo que buscan" },
  "automotor-autopartes": { cerrado: true, tension: "el auto parado: turno o repuesto para ya" },
  Gomeria: { cerrado: true, tension: "la goma pinchada no avisa: turno o auxilio para ya" },
  "construccion-materiales": { cerrado: false, tension: "la obra frenada por lo que falta o por lo que llegó mal" },
  "industria-b2b": { cerrado: false, tension: "la línea parada y el plazo de entrega" },
  "entretenimiento-eventos": { cerrado: false, tension: "la fecha que se llena" },
  "finanzas-servicios": { cerrado: false, tension: "el vencimiento y lo que cuesta esperar" },
  "servicios-profesionales": { cerrado: false, tension: "lo que se posterga hasta que sale más caro" },
};

export interface PiezaMedida {
  clientId: string;
  movimiento?: string;
  ganchoTipo?: string;
  pilar?: string;
  insertos?: string[];
  interaccion: number;
}

/** Puro. La misma vara que el orgánico: reacciones + comentarios×3 + compartidos×5. Los guardados valen como un compartido. */
export function interaccionDe(m: { reacciones: number | null; comentarios: number | null; compartidos: number | null; guardados?: number | null }): number {
  return engagementDe(m.reacciones ?? 0, m.comentarios ?? 0, (m.compartidos ?? 0) + (m.guardados ?? 0));
}

/**
 * Puro. Qué estilo, gancho, pilar e insertos rinden, cada pieza contra lo normal de SU cliente. Con pocas
 * piezas no afirma nada: devuelve vacío.
 */
export function ganadorDePiezas(piezas: PiezaMedida[]): Array<{ dimension: string; valor: string; indice: number; piezas: number }> {
  const porCliente = new Map<string, PiezaMedida[]>();
  for (const p of piezas) porCliente.set(p.clientId, [...(porCliente.get(p.clientId) ?? []), p]);
  const medidas: Array<PiezaMedida & { indice: number }> = [];
  for (const arr of porCliente.values()) {
    if (arr.length < MIN_PIEZAS) continue;
    const normal = mediana(arr.map((p) => p.interaccion));
    if (normal <= 0) continue;
    for (const p of arr) medidas.push({ ...p, indice: p.interaccion / normal });
  }
  const dimensiones: Array<[string, (p: PiezaMedida) => string | undefined]> = [
    ["estilo", (p) => p.movimiento], ["gancho", (p) => p.ganchoTipo], ["pilar", (p) => p.pilar],
    ["insertos", (p) => (p.insertos?.length ? p.insertos.join(" · ") : undefined)],
  ];
  const out: Array<{ dimension: string; valor: string; indice: number; piezas: number }> = [];
  for (const [dimension, clave] of dimensiones) {
    const g = new Map<string, number[]>();
    for (const p of medidas) { const k = clave(p); if (k) g.set(k, [...(g.get(k) ?? []), p.indice]); }
    const mejor = [...g.entries()].filter(([, xs]) => xs.length >= MIN_POR_VALOR).map(([valor, xs]) => ({ valor, indice: Math.round(mediana(xs) * 100) / 100, piezas: xs.length })).sort((a, b) => b.indice - a.indice)[0];
    if (mejor && mejor.indice > 1) out.push({ dimension, ...mejor });
  }
  return out;
}

/** Puro. Un solo reel en la ventana de la tarea: esa es la pieza. Dos o ninguno: no se adivina. */
export function posteoDeLaTarea<T extends { createdTime: Date | null; postType: string | null }>(posts: T[], fechaTarea: Date): T | null {
  const candidatos = posts.filter((p) => p.createdTime && /reel|video/i.test(p.postType ?? "") && p.createdTime.getTime() >= fechaTarea.getTime() - DIA && p.createdTime.getTime() <= fechaTarea.getTime() + 2 * DIA);
  return candidatos.length === 1 ? candidatos[0]! : null;
}

/** Puro. Lee la respuesta de /{media}/insights. Lo que Meta no da queda null. */
export function leerInsights(data: Array<{ name?: string; values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } }> | undefined) {
  const de = (n: string) => {
    const f = (data ?? []).find((x) => x.name === n);
    const v = f?.values?.[0]?.value ?? f?.total_value?.value;
    return typeof v === "number" ? v : null;
  };
  return { alcance: de("reach"), vistas: de("views"), guardados: de("saved"), compartidos: de("shares") };
}

async function insightsDeIg(db: Db, post: { id: string; connectionId: string | null; pageId: string | null }): Promise<ReturnType<typeof leerInsights> & { nota: string | null }> {
  const vacio = { alcance: null, vistas: null, guardados: null, compartidos: null };
  if (!post.id.startsWith("ig_")) return { ...vacio, nota: "no es de Instagram" };
  if (!post.connectionId) return { ...vacio, nota: "sin conexión" };
  const [conn] = await db.select({ token: adsConnections.accessToken }).from(adsConnections).where(eq(adsConnections.id, post.connectionId)).limit(1);
  if (!conn?.token) return { ...vacio, nota: "sin token" };
  // Las métricas del medio se piden con el token de su página.
  let token = conn.token;
  if (post.pageId) {
    const r = await fetch(`${GRAPH}/${post.pageId}?fields=access_token&access_token=${encodeURIComponent(conn.token)}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { access_token?: string } | null;
    if (j?.access_token) token = j.access_token;
  }
  const r = await fetch(`${GRAPH}/${post.id.slice(3)}/insights?metric=reach,views,saved,shares&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { data?: Parameters<typeof leerInsights>[0]; error?: { message?: string } } | null;
  if (!j || j.error) return { ...vacio, nota: `Meta: ${String(j?.error?.message ?? "sin respuesta").slice(0, 160)}` };
  return { ...leerInsights(j.data), nota: null };
}

/** Pega el posteo a la pieza por su link. Solo posteos del mismo cliente. */
export async function vincularPieza(db: Db, deliverableId: string, permalink: string): Promise<{ ok: boolean; motivo?: string }> {
  const [d] = await db.select({ clientId: agentDeliverables.clientId, metadata: agentDeliverables.metadata }).from(agentDeliverables).where(eq(agentDeliverables.id, deliverableId)).limit(1);
  if (!d?.clientId) return { ok: false, motivo: "No encuentro esa pieza." };
  const limpio = permalink.trim().split("?")[0]!.replace(/\/+$/, "");
  const [post] = await db.select({ id: organicPosts.id }).from(organicPosts)
    .where(and(eq(organicPosts.clientId, d.clientId), sql`split_part(${organicPosts.permalinkUrl}, '?', 1) in (${limpio}, ${`${limpio}/`})`)).limit(1);
  if (!post) return { ok: false, motivo: "Ese posteo todavía no está entre los leídos de este cliente. Se leen de noche: probá mañana." };
  await db.update(agentDeliverables).set({ metadata: { ...((d.metadata ?? {}) as object), postId: post.id, postLink: limpio } }).where(eq(agentDeliverables.id, deliverableId));
  return { ok: true };
}

/** Las piezas con tarea de ClickUp ya salida se vinculan solas, si hay certeza. */
async function vincularPorTarea(db: Db, desde: Date): Promise<number> {
  const { getRedesCalendar } = await import("./clickup-sync.js");
  const filas = await db.select({ id: agentDeliverables.id, clientId: agentDeliverables.clientId, metadata: agentDeliverables.metadata, createdAt: agentDeliverables.createdAt })
    .from(agentDeliverables)
    .where(and(eq(agentDeliverables.kind, "video"), sql`${agentDeliverables.metadata}->>'via' = 'productor-video'`, sql`${agentDeliverables.metadata}->>'taskId' is not null`, sql`${agentDeliverables.metadata}->>'postId' is null`, gte(agentDeliverables.createdAt, desde)));
  let hechas = 0;
  for (const f of filas) {
    if (!f.clientId) continue;
    const m = (f.metadata ?? {}) as Record<string, unknown>;
    const items = await getRedesCalendar(db, f.clientId, f.createdAt.getTime(), Date.now() + DIA).catch(() => null);
    const tarea = items?.find((t) => t.id === m.taskId && t.published);
    if (!tarea) continue;
    const posts = await db.select({ id: organicPosts.id, createdTime: organicPosts.createdTime, postType: organicPosts.postType, permalink: organicPosts.permalinkUrl })
      .from(organicPosts).where(and(eq(organicPosts.clientId, f.clientId), gte(organicPosts.createdTime, f.createdAt), sql`${organicPosts.permalinkUrl} like '%instagram.com%'`));
    const post = posteoDeLaTarea(posts, new Date(tarea.date));
    if (!post) continue;
    await db.update(agentDeliverables).set({ metadata: { ...m, postId: post.id, postLink: post.permalink } }).where(eq(agentDeliverables.id, f.id));
    hechas++;
  }
  return hechas;
}

/** La foto de cada pieza vinculada al llegar a las 24 h y a los 7 días. */
export async function medirPiezas(db: Db): Promise<{ vinculadas: number; medidas: number }> {
  const desde = new Date(Date.now() - 45 * DIA);
  const vinculadas = await vincularPorTarea(db, desde);
  const piezas = await db.select({ id: agentDeliverables.id, clientId: agentDeliverables.clientId, postId: sql<string>`${agentDeliverables.metadata}->>'postId'` })
    .from(agentDeliverables)
    .where(and(eq(agentDeliverables.kind, "video"), sql`${agentDeliverables.metadata}->>'postId' is not null`, gte(agentDeliverables.createdAt, desde)));
  let medidas = 0;
  for (const p of piezas) {
    const [post] = await db.select({ id: organicPosts.id, createdTime: organicPosts.createdTime, connectionId: organicPosts.connectionId, pageId: organicPosts.pageId }).from(organicPosts).where(eq(organicPosts.id, p.postId)).limit(1);
    if (!post?.createdTime) continue;
    const horas = Math.floor((Date.now() - post.createdTime.getTime()) / 3_600_000);
    const hechas = await db.select({ momento: piezaMetricas.momento }).from(piezaMetricas).where(eq(piezaMetricas.deliverableId, p.id));
    for (const { momento, horas: tope } of MOMENTOS) {
      if (horas < tope || hechas.some((h) => h.momento === momento)) continue;
      const base = await db.select({ metric: organicPostInsights.metric, value: organicPostInsights.value }).from(organicPostInsights).where(eq(organicPostInsights.postId, post.id));
      const val = (m: string) => { const v = base.find((b) => b.metric === m)?.value; return v == null ? null : Number(v); };
      const ig = await insightsDeIg(db, post);
      await db.insert(piezaMetricas).values({
        deliverableId: p.id, clientId: p.clientId, postId: post.id, momento, horas,
        reacciones: val("post_reactions_by_type_total"), comentarios: val("post_comments"),
        compartidos: ig.compartidos ?? val("post_shares"), alcance: ig.alcance, vistas: ig.vistas, guardados: ig.guardados, nota: ig.nota,
      }).onConflictDoNothing();
      medidas++;
    }
  }
  return { vinculadas, medidas };
}

let timer: ReturnType<typeof setInterval> | null = null;
export function initMedirPiezas(db: Db): void {
  if (timer) return;
  const correr = () => medirPiezas(db)
    .then((r) => { if (r.vinculadas || r.medidas) console.log(`[piezas] ${r.vinculadas} vinculadas, ${r.medidas} fotos`); })
    .catch((e) => console.warn("[piezas] falló la medición:", String(e instanceof Error ? e.message : e).slice(0, 160)));
  timer = setInterval(correr, 3 * 3600_000);
  console.log("[piezas] medición de las piezas cada 3 h");
}

/** Lo que el Productor lee antes de proponer. Corto: viaja en todos sus turnos. null si no hay nada que decir. */
export async function queRepetir(db: Db, clientId: string, nicho: string | null): Promise<string[]> {
  const L: string[] = [];
  const { analisisContenido } = await import("./contenido-analisis.js");
  const a = await analisisContenido(db, 180).catch(() => null);
  const c = a?.clientes.find((x) => x.clientId === clientId);
  const n = nicho ? a?.nichos.find((x) => x.nicho === nicho) : undefined;
  const x = (i: number) => `${i.toFixed(1).replace(".", ",")}×`;
  if (c?.mejorAngulo) L.push(`- Este cliente: rinde «${c.mejorAngulo.clave}» (${x(c.mejorAngulo.indice)} lo normal, ${c.mejorAngulo.publicaciones} publicaciones).`);
  if (c?.oportunidad) L.push(`- Sin probar acá y rinde en su rubro: «${c.oportunidad.angulo}» (${x(c.oportunidad.indiceEnNicho)}).`);
  const fmt = n?.formatos[0];
  if (fmt) L.push(`- Su rubro: ${fmt.clave} ${x(fmt.indice)}${n?.angulos[0] ? `; ángulo «${n.angulos[0].clave}» ${x(n.angulos[0].indice)}` : ""} (${n?.cuentas} cuentas).`);

  // Las piezas del Productor ya medidas: estilo, gancho, pilar e insertos.
  const medidas = await db.select({ clientId: piezaMetricas.clientId, metadata: agentDeliverables.metadata, reacciones: piezaMetricas.reacciones, comentarios: piezaMetricas.comentarios, compartidos: piezaMetricas.compartidos, guardados: piezaMetricas.guardados })
    .from(piezaMetricas)
    .innerJoin(agentDeliverables, eq(agentDeliverables.id, piezaMetricas.deliverableId))
    .innerJoin(clients, eq(clients.id, piezaMetricas.clientId))
    .where(and(eq(piezaMetricas.momento, "7d"), nicho ? eq(clients.industry, nicho) : eq(piezaMetricas.clientId, clientId)))
    .limit(200).catch(() => []);
  const aPieza = (f: (typeof medidas)[number]): PiezaMedida => {
    const m = (f.metadata ?? {}) as Partial<PiezaMedida>;
    return { clientId: f.clientId as string, movimiento: m.movimiento, ganchoTipo: m.ganchoTipo, pilar: m.pilar, insertos: m.insertos, interaccion: interaccionDe(f) };
  };
  const propias = ganadorDePiezas(medidas.filter((f) => f.clientId === clientId).map(aPieza));
  const delRubro = ganadorDePiezas(medidas.map(aPieza));
  if (propias.length) L.push(`- Sus piezas medidas a 7 días: ${propias.map((g) => `${g.dimension} ${g.valor} ${x(g.indice)}`).join("; ")}.`);
  else if (delRubro.length) L.push(`- Piezas medidas de su rubro a 7 días: ${delRubro.map((g) => `${g.dimension} ${g.valor} ${x(g.indice)}`).join("; ")}.`);

  const rubro = nicho ? TENSION_POR_RUBRO[nicho] : undefined;
  if (rubro) L.push(`- Tensión a probar (hipótesis): ${rubro.tension}.${rubro.cerrado ? " «Te escriben cuando estás cerrado» solo si de verdad atienden mensajes, con chat de EJEMPLO; una vez por semana como mucho." : " Acá «te escriben cuando estás cerrado» no aplica."}`);
  if (nicho) {
    const delNicho = await db.select({ text: hooks.text, views: hooks.views }).from(hooks)
      .where(and(eq(hooks.niche, nicho), eq(hooks.sourceKind, "competidor"), gt(hooks.views, 0))).orderBy(desc(hooks.views)).limit(2).catch(() => []);
    for (const h of delNicho) L.push(`- Gancho de un competidor del rubro (${h.views} vistas; adaptalo, no lo copies): "${String(h.text).slice(0, 110)}"`);
  }
  if (L.length) L.push("- Repetí lo que rinde con OTRO tema, nunca la misma pieza. Una prueba nueva por semana (un pilar o inserto sin usar). Son datos a medir, no ley.");
  return L;
}

