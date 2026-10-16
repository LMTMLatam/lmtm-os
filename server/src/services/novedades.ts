// LMTM-OS: buenas noticias por cliente (pedido 15/10: "que los agentes puedan
// dar buenas noticias para reenviar a los clientes, titulares llamativos para
// que noten la evolución; personalizado por cliente, en un panel o en el
// dashboard").
//
// Los titulares los arma el sistema con plantillas, no un modelo: cada cifra
// sale de los mismos datos que el dashboard y nada se redondea a favor. Para
// que una noticia salga exige volumen mínimo y que no esconda un empeoramiento:
// "llegaron más consultas" no va si cada una costó mucho más, y "cada consulta
// cuesta menos" no va si llegaron muchas menos.

import type { Db } from "@paperclipai/db";
import { agentActions, clients, organicPostInsights, organicPosts, webDiario, webPropiedades } from "@paperclipai/db";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { conversionesDudosas, cuentaEnPesos } from "../metricas/index.js";
import { saludFuentes } from "../ingest/salud.js";
import { sumarDias, sumarVentana, ultimoDiaCompleto } from "./google-web.js";
import { mediana } from "./contenido-analisis.js";
import { diaLocal } from "../avisos/politica.js";

export type AreaNovedad = "pauta" | "web" | "organico";
export interface Novedad {
  tipo: string;
  area: AreaNovedad;
  titular: string;
  detalle: string;
  /** Para ordenar: cuánto pesa la noticia (récord > mejora grande > mejora chica). */
  fuerza: number;
}

/** Los mínimos para afirmar algo. */
export const MIN = {
  leadsSemana: 10,
  leadsMes: 20,
  subaConsultas: 0.2,
  bajaCosto: 0.15,
  /** "Más consultas" no va si cada una costó más que esto de más. */
  costoToleradoAlSubir: 0.2,
  /** "Más baratas" no va si llegaron menos que esto de menos. */
  caidaToleradaAlBajar: 0.3,
  semanasHistoria: 8,
  clicsGoogle: 30,
  subaGoogle: 0.2,
  impresionesGoogle: 500,
  subaVisibilidad: 0.3,
  postsHistoria: 8,
  indicePost: 2.5,
  interaccionesPost: 20,
  diasPost: 14,
};

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const entero = (n: number) => Math.round(n).toLocaleString("es-AR");
const pct = (x: number) => `${Math.round(x * 100)}%`;
const ddmm = (iso: string) => `${Number(iso.slice(8, 10))}/${iso.slice(5, 7)}`;
const veces = (x: number) => `${x.toFixed(x >= 10 ? 0 : 1).replace(".", ",")} veces`;

// ── Pauta ────────────────────────────────────────────────────────────────

export interface DiaPauta { fecha: string; inversion: number; leads: number }
interface Bloque { desde: string; hasta: string; inversion: number; leads: number; cpl: number | null }

function bloque(dias: DiaPauta[], desde: string, hasta: string): Bloque {
  let inversion = 0;
  let leads = 0;
  for (const d of dias) if (d.fecha >= desde && d.fecha <= hasta) { inversion += d.inversion; leads += d.leads; }
  return { desde, hasta, inversion, leads, cpl: leads > 0 ? inversion / leads : null };
}

/**
 * Las noticias de pauta: semana contra semana, mes contra mes, récords de las
 * últimas 12 semanas y el objetivo que fijó una persona. `hasta` es el último
 * día completo; `donde` se agrega cuando se dejó afuera una plataforma (" en Meta").
 */
export function novedadesDePauta(dias: DiaPauta[], hasta: string, opts: { objetivo?: number | null; donde?: string } = {}): Novedad[] {
  const out: Novedad[] = [];
  const en = opts.donde ?? "";
  const semanas = Array.from({ length: 12 }, (_, k) => bloque(dias, sumarDias(hasta, -7 * k - 6), sumarDias(hasta, -7 * k)));
  const [esta, pasada] = semanas;
  const mes = bloque(dias, sumarDias(hasta, -29), hasta);
  const mesAnt = bloque(dias, sumarDias(hasta, -59), sumarDias(hasta, -30));
  const rango = (b: Bloque) => `del ${ddmm(b.desde)} al ${ddmm(b.hasta)}`;

  // Récords: la mejor semana en 3 meses, con historia suficiente para que "récord" signifique algo.
  const previas = semanas.slice(1);
  const conHistoria = previas.filter((s) => s.leads > 0).length >= MIN.semanasHistoria;
  let recordConsultas = false;
  let recordCosto = false;
  if (conHistoria && esta.leads >= MIN.leadsSemana && esta.leads > Math.max(...previas.map((s) => s.leads))) {
    recordConsultas = true;
    out.push({
      tipo: "mejor_semana", area: "pauta", fuerza: 3,
      titular: `La mejor semana de consultas de los últimos 3 meses${en}`,
      detalle: `${entero(esta.leads)} consultas ${rango(esta)}. La mejor de las 11 semanas anteriores había traído ${entero(Math.max(...previas.map((s) => s.leads)))}.`,
    });
  }
  const previasConCosto = previas.filter((s) => s.leads >= MIN.leadsSemana && s.cpl != null);
  if (previasConCosto.length >= MIN.semanasHistoria - 2 && esta.leads >= MIN.leadsSemana && esta.cpl != null && esta.cpl < Math.min(...previasConCosto.map((s) => s.cpl!))) {
    recordCosto = true;
    out.push({
      tipo: "mejor_costo", area: "pauta", fuerza: 3,
      titular: `El costo por consulta más bajo de los últimos 3 meses${en}`,
      detalle: `${pesos(esta.cpl)} por consulta ${rango(esta)} (${entero(esta.leads)} consultas). El mejor de las semanas anteriores había sido ${pesos(Math.min(...previasConCosto.map((s) => s.cpl!)))}.`,
    });
  }

  // Semana contra semana y mes contra mes, con las dos guardas.
  const comparar = (a: Bloque, b: Bloque, minLeads: number, periodo: "semana" | "mes") => {
    if (b.leads < minLeads || a.leads < minLeads || a.cpl == null || b.cpl == null) return;
    const subaLeads = a.leads / b.leads - 1;
    const cambioCosto = a.cpl / b.cpl - 1;
    const queAntes = periodo === "semana" ? "la semana anterior" : "los 30 días anteriores";
    if (subaLeads >= MIN.subaConsultas && cambioCosto <= MIN.costoToleradoAlSubir && !(periodo === "semana" && recordConsultas)) {
      out.push({
        tipo: `consultas_suben_${periodo}`, area: "pauta", fuerza: 1 + subaLeads,
        titular: periodo === "semana" ? `Llegaron ${pct(subaLeads)} más consultas que la semana pasada${en}` : `Las consultas crecieron ${pct(subaLeads)} en el último mes${en}`,
        detalle: `${entero(a.leads)} consultas ${rango(a)}, contra ${entero(b.leads)} ${queAntes}.`,
      });
    }
    if (-cambioCosto >= MIN.bajaCosto && subaLeads >= -MIN.caidaToleradaAlBajar && !(periodo === "semana" && recordCosto)) {
      out.push({
        tipo: `costo_baja_${periodo}`, area: "pauta", fuerza: 1 - cambioCosto,
        titular: periodo === "semana" ? `Cada consulta cuesta ${pct(-cambioCosto)} menos que la semana pasada${en}` : `El costo por consulta bajó ${pct(-cambioCosto)} en el último mes${en}`,
        detalle: `${pesos(a.cpl)} por consulta ${rango(a)}, contra ${pesos(b.cpl)} ${queAntes}.`,
      });
    }
  };
  comparar(esta, pasada, MIN.leadsSemana, "semana");
  comparar(mes, mesAnt, MIN.leadsMes, "mes");

  if (opts.objetivo && opts.objetivo > 0 && mes.leads >= MIN.leadsSemana && mes.cpl != null && mes.cpl <= opts.objetivo) {
    out.push({
      tipo: "debajo_objetivo", area: "pauta", fuerza: 1.5,
      titular: `Cada consulta está costando menos que el objetivo acordado${en}`,
      detalle: `${pesos(mes.cpl)} por consulta en los últimos 30 días (${entero(mes.leads)} consultas), con un objetivo de ${pesos(opts.objetivo)}.`,
    });
  }
  return out;
}

// ── Web (Search Console) ─────────────────────────────────────────────────

type DiaWeb = Parameters<typeof sumarVentana>[0][number];

/** 28 días contra 28, solo con todos los días medidos. */
export function novedadesDeWeb(dias: DiaWeb[], ahora = new Date()): Novedad[] {
  const hasta = ultimoDiaCompleto("gsc", ahora);
  const nada = { desde: "9999-12-31", hasta: "9999-12-31" };
  const a = sumarVentana(dias, { desde: sumarDias(hasta, -27), hasta }, nada);
  const b = sumarVentana(dias, { desde: sumarDias(hasta, -55), hasta: sumarDias(hasta, -28) }, nada);
  if (a.diasConDato.gsc !== 28 || b.diasConDato.gsc !== 28) return [];
  const out: Novedad[] = [];
  if (a.clics != null && b.clics != null && b.clics >= MIN.clicsGoogle && a.clics / b.clics - 1 >= MIN.subaGoogle) {
    const s = a.clics / b.clics - 1;
    out.push({
      tipo: "google_visitas", area: "web", fuerza: 1 + s,
      titular: `${pct(s)} más visitas a la web desde Google`,
      detalle: `${entero(a.clics)} visitas desde la búsqueda de Google en los últimos 28 días, contra ${entero(b.clics)} en los 28 anteriores.`,
    });
  }
  if (a.impresiones != null && b.impresiones != null && b.impresiones >= MIN.impresionesGoogle && a.impresiones / b.impresiones - 1 >= MIN.subaVisibilidad) {
    const s = a.impresiones / b.impresiones - 1;
    out.push({
      tipo: "google_visibilidad", area: "web", fuerza: 0.8 + s / 2,
      titular: `Google muestra la web ${pct(s)} más veces`,
      detalle: `La web apareció ${entero(a.impresiones)} veces en resultados de Google en los últimos 28 días, contra ${entero(b.impresiones)} en los 28 anteriores.`,
    });
  }
  return out;
}

// ── Orgánico ─────────────────────────────────────────────────────────────

export interface PostMedido { fecha: string; reacciones: number; comentarios: number; compartidos: number; texto: string; red: "instagram" | "facebook" }

/**
 * La publicación de las últimas 2 semanas que más se destacó contra lo habitual
 * de la cuenta (mediana de 90 días). Cuenta interacciones reales (reacciones,
 * comentarios y compartidos), no un puntaje; y en cuentas chicas, donde lo
 * habitual es casi cero, no dice "338 veces": dice "más de 10 veces".
 */
export function novedadDeOrganico(posts: PostMedido[], hasta: string): Novedad | null {
  if (posts.length < MIN.postsHistoria) return null;
  const total = (p: PostMedido) => p.reacciones + p.comentarios + p.compartidos;
  const habitual = mediana(posts.map(total));
  if (habitual <= 0) return null;
  const desde = sumarDias(hasta, -(MIN.diasPost - 1));
  const mejor = posts.filter((p) => p.fecha >= desde && p.fecha <= hasta).sort((x, y) => total(y) - total(x))[0];
  if (!mejor || total(mejor) < MIN.interaccionesPost || total(mejor) / habitual < MIN.indicePost) return null;
  const indice = total(mejor) / habitual;
  const record = posts.every((p) => p === mejor || total(p) < total(mejor));
  const texto = mejor.texto.length > 90 ? `${mejor.texto.slice(0, 90).trimEnd()}…` : mejor.texto;
  const cuantos = (n: number, una: string, varias: string) => `${entero(n)} ${n === 1 ? una : varias}`;
  const partes = [
    cuantos(mejor.reacciones, "reacción", "reacciones"),
    mejor.comentarios ? cuantos(mejor.comentarios, "comentario", "comentarios") : null,
    mejor.compartidos ? `compartida ${cuantos(mejor.compartidos, "vez", "veces")}` : null,
  ].filter(Boolean);
  return {
    tipo: "post_destacado", area: "organico", fuerza: 1 + Math.min(indice, 10) / 5 + (record ? 0.5 : 0),
    titular: record
      ? "La publicación con más interacción de los últimos 3 meses"
      : `Una publicación tuvo ${indice >= 10 ? "más de 10 veces" : veces(indice)} la interacción habitual`,
    detalle: `La del ${ddmm(mejor.fecha)} en ${mejor.red === "instagram" ? "Instagram" : "Facebook"}${texto ? ` («${texto}»)` : ""}: ${partes.join(", ")}. Una publicación típica de la cuenta tiene ${cuantos(habitual, "interacción", "interacciones")}.`,
  };
}

// ── Optimizaciones medidas ───────────────────────────────────────────────

export interface AccionMedida { kind: string; entityType: string | null; nombre: string; antes: number; despues: number }

/** Un cambio nuestro tras el cual el costo por consulta de la cuenta bajó (lo midió action-outcomes). */
export function novedadDeOptimizacion(a: AccionMedida): Novedad | null {
  if (!(a.antes > 0 && a.despues > 0 && a.despues < a.antes)) return null;
  const baja = 1 - a.despues / a.antes;
  const que = a.kind === "set_budget"
    ? `ajustar el presupuesto de «${a.nombre}»`
    : a.kind === "add_negative_keywords"
      ? `filtrar búsquedas que no servían en «${a.nombre}»`
      : a.kind === "pause_keywords"
        ? "pausar palabras clave que no traían consultas"
        : `pausar ${a.entityType === "adset" ? "el conjunto" : "la campaña"} «${a.nombre}»`;
  return {
    tipo: "optimizacion", area: "pauta", fuerza: 1.2 + baja,
    titular: `Después de ${que}, cada consulta cuesta ${pct(baja)} menos`,
    detalle: `Costo por consulta de toda la cuenta: ${pesos(a.antes)} la semana anterior al cambio y ${pesos(a.despues)} la semana siguiente.`,
  };
}

// ── Junta, ordena y arma el mensaje ──────────────────────────────────────

/** Las que van: ordenadas por fuerza, una por tipo, hasta `max`. */
export function elegir(novedades: Novedad[], max = 4): Novedad[] {
  const vistos = new Set<string>();
  return [...novedades].sort((a, b) => b.fuerza - a.fuerza).filter((n) => !vistos.has(n.tipo) && vistos.add(n.tipo)).slice(0, max);
}

/** El texto para pegar en el WhatsApp del cliente. */
export function mensajeParaCliente(cliente: string, novedades: Novedad[]): string | null {
  if (novedades.length === 0) return null;
  return [`*Novedades de ${cliente}* 📈`, "", ...novedades.map((n) => `• *${n.titular}.* ${n.detalle}`), "", "_Datos de las plataformas al día de ayer._"].join("\n");
}

// ── Lectura ──────────────────────────────────────────────────────────────

export interface NovedadesCliente { clientId: string; cliente: string; slug: string; novedades: Novedad[]; mensaje: string | null }

const filasDe = <T>(r: unknown): T[] => (r as { rows?: T[] }).rows ?? (r as T[]);

/** Publicaciones con sus interacciones reales desde `desde`. Las mismas métricas que contenido-analisis.ts. */
async function publicaciones(db: Db, desde: string, clientId?: string): Promise<Array<PostMedido & { clientId: string }>> {
  const v = (m: string) => sql<string | null>`max(case when ${organicPostInsights.metric} = ${m} then ${organicPostInsights.value} end)`;
  const filas = await db
    .select({
      clientId: organicPosts.clientId, permalink: organicPosts.permalinkUrl, fecha: organicPosts.createdTime, texto: organicPosts.message,
      reacciones: v("post_reactions_by_type_total"), comentarios: v("post_comments"), compartidos: v("post_shares"),
    })
    .from(organicPosts)
    .innerJoin(organicPostInsights, eq(organicPostInsights.postId, organicPosts.id))
    .where(and(gte(organicPosts.createdTime, new Date(`${desde}T03:00:00Z`)), clientId ? eq(organicPosts.clientId, clientId) : sql`${organicPosts.clientId} is not null`))
    .groupBy(organicPosts.id);
  return filas.map((f) => ({
    clientId: f.clientId as string,
    fecha: f.fecha ? diaLocal(f.fecha) : "",
    reacciones: Number(f.reacciones ?? 0),
    comentarios: Number(f.comentarios ?? 0),
    compartidos: Number(f.compartidos ?? 0),
    texto: (f.texto ?? "").replace(/\s+/g, " ").trim(),
    red: /instagram\.com/.test(f.permalink ?? "") ? ("instagram" as const) : ("facebook" as const),
  }));
}

/** Las buenas noticias de un cliente o de todos los activos. */
export async function novedades(db: Db, f: { clientId?: string } = {}, ahora = new Date()): Promise<NovedadesCliente[]> {
  const hasta = sumarDias(diaLocal(ahora), -1);
  const desde = sumarDias(hasta, -83);
  const delCliente = f.clientId ? sql`and client_id = ${f.clientId}` : sql``;

  const [lista, pautaR, salud, props, acciones, pubs] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, slug: clients.slug, metadata: clients.metadata }).from(clients)
      .where(f.clientId ? eq(clients.id, f.clientId) : eq(clients.status, "active")),
    db.execute(sql`
      select client_id, platform, date::text as fecha, sum(spend)::float8 as inversion, sum(leads)::int as leads, sum(clicks)::int as clics
      from ads_insights a
      where date between ${desde} and ${hasta} and client_id is not null ${delCliente} and ${cuentaEnPesos(sql`a.ad_account_id`)}
      group by 1, 2, 3`),
    saludFuentes(db, f.clientId ? { clientId: f.clientId } : {}),
    db.select({ clientId: webPropiedades.clientId, gscSitio: webPropiedades.gscSitio, ultimoError: webPropiedades.ultimoError }).from(webPropiedades),
    db.select({ clientId: agentActions.clientId, kind: agentActions.kind, entityType: agentActions.entityType, detail: agentActions.detail, outcome: agentActions.outcome })
      .from(agentActions)
      .where(and(gte(agentActions.createdAt, new Date(ahora.getTime() - 45 * 86_400_000)), sql`${agentActions.outcome}->>'verdict' = 'improved'`, f.clientId ? eq(agentActions.clientId, f.clientId) : sql`true`)),
    publicaciones(db, sumarDias(hasta, -89), f.clientId),
  ]);

  const pauta = filasDe<{ client_id: string; platform: string; fecha: string; inversion: number; leads: number; clics: number }>(pautaR);
  const conGsc = props.filter((p) => p.gscSitio && !(p.ultimoError ?? "").split(" · ").some((x) => x.startsWith("Search Console:"))).map((p) => p.clientId);
  const ids = lista.map((c) => c.id);
  const diasWeb = conGsc.length
    ? await db.select().from(webDiario).where(and(inArray(webDiario.clientId, conGsc.filter((id) => ids.includes(id))), gte(webDiario.fecha, sumarDias(hasta, -70))))
    : [];

  return lista.map((c) => {
    const n: Novedad[] = [];

    // Pauta: sin fuentes atrasadas o fallando (un hueco de datos parecería una suba),
    // y sin las plataformas cuyas "conversiones" no son consultas.
    const fuentes = salud.filter((s) => s.clientId === c.id && (s.fuente === "meta_ads" || s.fuente === "google_ads"));
    if (!fuentes.some((s) => s.estado === "fallando" || s.estado === "atrasada")) {
      const filas = pauta.filter((p) => p.client_id === c.id);
      const plataformas = [...new Set(filas.map((p) => p.platform))];
      const dudosas = plataformas.filter((pl) => {
        const t = filas.filter((p) => p.platform === pl);
        return conversionesDudosas(pl, t.reduce((s, p) => s + p.leads, 0), t.reduce((s, p) => s + p.clics, 0));
      });
      const usadas = plataformas.filter((pl) => !dudosas.includes(pl));
      const porDia = new Map<string, DiaPauta>();
      for (const p of filas) {
        if (!usadas.includes(p.platform)) continue;
        const d = porDia.get(p.fecha) ?? { fecha: p.fecha, inversion: 0, leads: 0 };
        d.inversion += Number(p.inversion);
        d.leads += Number(p.leads);
        porDia.set(p.fecha, d);
      }
      const meta = (c.metadata ?? {}) as Record<string, unknown>;
      const objetivo = Number(meta.cplObjetivo) > 0 ? Number(meta.cplObjetivo) : null;
      const donde = dudosas.length && usadas.length === 1 ? ` en ${usadas[0] === "meta" ? "Meta" : "Google"}` : "";
      if (!dudosas.length || usadas.length) n.push(...novedadesDePauta([...porDia.values()], hasta, { objetivo: dudosas.length ? null : objetivo, donde }));
    }

    if (conGsc.includes(c.id)) {
      n.push(...novedadesDeWeb(diasWeb.filter((d) => d.clientId === c.id).map((d) => ({ ...d, fecha: String(d.fecha) })), ahora));
    }

    const post = novedadDeOrganico(pubs.filter((p) => p.clientId === c.id), hasta);
    if (post) n.push(post);

    for (const a of acciones.filter((x) => x.clientId === c.id)) {
      const o = (a.outcome ?? {}) as { clientCplBefore?: number | null; clientCplAfter?: number | null };
      const d = (a.detail ?? {}) as { name?: string; nombre?: string };
      const nov = novedadDeOptimizacion({
        kind: a.kind, entityType: a.entityType, nombre: String(d.name ?? d.nombre ?? "").trim(),
        antes: Number(o.clientCplBefore ?? 0), despues: Number(o.clientCplAfter ?? 0),
      });
      if (nov) n.push(nov);
    }

    const elegidas = elegir(n);
    const cliente = c.name.trim();
    return { clientId: c.id, cliente, slug: c.slug, novedades: elegidas, mensaje: mensajeParaCliente(cliente, elegidas) };
  });
}

let cache: { at: number; data: NovedadesCliente[] } | null = null;

/** Las de toda la agencia, guardadas una hora: los datos son de días completos. */
export async function novedadesAgencia(db: Db): Promise<NovedadesCliente[]> {
  if (cache && Date.now() - cache.at < 60 * 60_000) return cache.data;
  const data = (await novedades(db)).filter((c) => c.novedades.length > 0);
  cache = { at: Date.now(), data };
  return data;
}
