// LMTM-OS: el trabajo de los agentes en un solo lugar (pedido 15/10: "que los
// agentes, en base a lo que hacen en Google, campañas, Analytics y mejoras de
// SEO, vayan dejando todo en un sector, y los resultados de las optimizaciones
// en los dashboards, para ver el trabajo real").
//
// No hay tabla nueva: todo ya quedaba escrito, pero en cinco lugares que
// ninguna pantalla juntaba.
//   · agent_actions: lo que se cambió de verdad en Meta y Google, con el
//     resultado medido a los 7 días (action-outcomes.ts).
//   · approvals (accion_pauta): lo propuesto que espera a una persona, y el
//     porqué de lo que se ejecutó.
//   · decisiones de las reglas de pauta, web, Search Console y Analytics.
//   · agente_trabajos: los análisis del runner.
//   · agent_deliverables (informes, investigaciones, specs de campaña) e
//     informes_semanales.
// Acá se leen y salen con una sola forma.

import type { Db } from "@paperclipai/db";
import { agentDeliverables, agenteTrabajos, agents, approvals, clients, decisiones, informesSemanales, webDiario } from "@paperclipai/db";
import { and, gte, inArray, or, sql } from "drizzle-orm";
import { KINDS_EVALUABLES } from "./action-outcomes.js";
import { sumarDias, ultimoDiaCompleto } from "./google-web.js";
import { diaLocal } from "../avisos/politica.js";

export type AreaTrabajo = "pauta" | "web" | "contenido" | "analisis" | "informe";
export type EstadoItem = "hecho" | "propuesto" | "descartado";
export type Plataforma = "meta" | "google" | "search_console" | "analytics";

export interface Resultado {
  estado: "midiendo" | "medido" | "sin_datos";
  /** cpl y ctr: de la cuenta, semana antes contra semana después. clics y eventos: 28 días contra 28. */
  metrica: "cpl" | "ctr" | "clics_google" | "eventos_clave";
  antes: number | null;
  despues: number | null;
  veredicto: "mejoro" | "igual" | "empeoro" | null;
  /** Desde qué día hay medición, mientras se espera. */
  seMideEl: string | null;
}

export interface ItemTrabajo {
  id: string;
  clientId: string | null;
  cliente: string | null;
  clienteSlug: string | null;
  fecha: string;
  area: AreaTrabajo;
  plataforma: Plataforma | null;
  estado: EstadoItem;
  /** Quién lo hizo o lo propuso, dicho para una persona. */
  quien: string;
  /** Se hizo solo (piloto automático), sin que nadie lo apruebe. */
  automatico: boolean;
  que: string;
  porque: string | null;
  siguiente: string | null;
  resultado: Resultado | null;
  enlace: string | null;
}

// ── Puro ─────────────────────────────────────────────────────────────────

type Forma = "hizo" | "hicimos" | "hacer";
const VERBOS: Record<string, [string, string, string]> = {
  pausar: ["Pausó", "Pausamos", "Pausar"],
  cambiar: ["Cambió", "Cambiamos", "Cambiar"],
  sumar: ["Sumó", "Sumamos", "Sumar"],
  duplicar: ["Duplicó", "Duplicamos", "Duplicar"],
};
const verbo = (v: keyof typeof VERBOS, f: Forma) => VERBOS[v][f === "hizo" ? 0 : f === "hicimos" ? 1 : 2];
const plural = (n: number, una: string, varias: string) => (n === 1 ? una : varias);
const pesos = (n: unknown) => `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`;

/**
 * Un cambio ejecutado, dicho para una persona: "Pausó la campaña «X»". En
 * `hacer` va sin números (el informe del cliente rechaza cifras fuera de las
 * comillas: no pasan por sus marcadores) y en `hicimos` es lo que lee el cliente.
 */
export function fraseAccion(
  a: { kind: string; entityType: string | null; detail: Record<string, unknown> | null; campana?: string | null },
  forma: Forma = "hizo",
): string {
  const d = a.detail ?? {};
  const nombre = String(d.name ?? d.nombre ?? "").trim();
  // Meta les pone a los conjuntos "Nuevo conjunto de anuncios…": sin la campaña no se sabe cuál es.
  const campana = a.entityType === "adset" && a.campana?.trim() ? ` de la campaña «${a.campana.trim()}»` : "";
  const de = nombre ? ` «${nombre}»${campana}` : "";
  const ent = a.entityType === "adset" ? "el conjunto" : a.entityType === "ad" ? "el anuncio" : "la campaña";
  const lista = (xs: unknown) => (Array.isArray(xs) ? xs.map(String) : []);
  const conCifras = forma !== "hacer";
  switch (a.kind) {
    case "pause_ad_entity":
      return `${verbo("pausar", forma)} ${ent}${de}`;
    case "set_budget":
      return `${verbo("cambiar", forma)} el presupuesto ${ent.replace(/^el /, "del ").replace(/^la /, "de la ")}${de}${conCifras && d.anterior != null && d.nuevo != null ? `: ${pesos(d.anterior)} → ${pesos(d.nuevo)} por día` : ""}`;
    case "add_negative_keywords": {
      const t = lista(d.terminos);
      if (!conCifras) return `${verbo("sumar", forma)} palabras negativas en la campaña${de}`;
      return `${verbo("sumar", forma)} ${t.length} ${plural(t.length, "palabra negativa", "palabras negativas")} en la campaña${de}${t.length ? `: ${t.slice(0, 6).join(", ")}${t.length > 6 ? "…" : ""}` : ""}`;
    }
    case "pause_keywords": {
      const t = lista(d.pausadas);
      if (!conCifras) return `${verbo("pausar", forma)} palabras clave en Google`;
      return `${verbo("pausar", forma)} ${t.length} ${plural(t.length, "palabra clave", "palabras clave")} en Google${t.length ? `: ${t.slice(0, 6).join(", ")}${t.length > 6 ? "…" : ""}` : ""}`;
    }
    case "duplicate_winner":
      return `${verbo("duplicar", forma)} el conjunto${de}${conCifras && d.nacioPausada ? " (la copia nace pausada)" : ""}`;
    default:
      return a.kind;
  }
}

/** Lo que dejó medido action-outcomes.ts sobre un cambio, o cuándo se va a medir. */
export function resultadoDeAccion(kind: string, outcome: Record<string, unknown> | null, hecha: Date): Resultado | null {
  if (!(KINDS_EVALUABLES as readonly string[]).includes(kind)) return null;
  const vacio = { antes: null, despues: null, veredicto: null, seMideEl: null };
  // La evaluación corre una vez por día sobre lo que cumplió 7 días completos.
  if (!outcome) return { ...vacio, estado: "midiendo", metrica: "cpl", seMideEl: sumarDias(diaLocal(hecha), 8) };
  const o = outcome as { verdict?: string; clientCplBefore?: number | null; clientCplAfter?: number | null; clientCtrBefore?: number | null; clientCtrAfter?: number | null };
  if (o.verdict === "insufficient_data" || !o.verdict) return { ...vacio, estado: "sin_datos", metrica: "cpl" };
  const conCpl = o.clientCplBefore != null && o.clientCplAfter != null;
  return {
    estado: "medido",
    metrica: conCpl ? "cpl" : "ctr",
    antes: (conCpl ? o.clientCplBefore : o.clientCtrBefore) ?? null,
    despues: (conCpl ? o.clientCplAfter : o.clientCtrAfter) ?? null,
    veredicto: o.verdict === "improved" ? "mejoro" : o.verdict === "worse" ? "empeoro" : "igual",
    seMideEl: null,
  };
}

/** Días antes y después de una mejora de la web que se comparan. */
export const VENTANA_WEB = 28;

/**
 * Qué pasó con los clics desde Google (o los eventos clave de Analytics) los
 * 28 días después de hecha una mejora, contra los 28 de antes. Solo con todos
 * los días medidos: un día sin dato no es un día sin visitas.
 */
export function resultadoWeb(
  dias: Array<{ fecha: string; gscClics: number | null; gaEventosClave: number | null }>,
  hechaEl: string,
  metrica: "clics_google" | "eventos_clave",
  ahora = new Date(),
): Resultado {
  const fuente = metrica === "clics_google" ? "gsc" : "ga";
  const antesV = { desde: sumarDias(hechaEl, -VENTANA_WEB), hasta: sumarDias(hechaEl, -1) };
  const despuesV = { desde: sumarDias(hechaEl, 1), hasta: sumarDias(hechaEl, VENTANA_WEB) };
  const base = { metrica, antes: null, despues: null, veredicto: null, seMideEl: null };
  if (ultimoDiaCompleto(fuente, ahora) < despuesV.hasta) {
    return { ...base, estado: "midiendo", seMideEl: sumarDias(despuesV.hasta, fuente === "gsc" ? 3 : 2) };
  }
  const suma = (v: { desde: string; hasta: string }) => {
    let n = 0;
    let s = 0;
    for (const d of dias) {
      const x = metrica === "clics_google" ? d.gscClics : d.gaEventosClave;
      if (d.fecha >= v.desde && d.fecha <= v.hasta && x != null) {
        n += 1;
        s += Number(x);
      }
    }
    return n === VENTANA_WEB ? s : null;
  };
  const a = suma(antesV);
  const b = suma(despuesV);
  if (a == null || b == null) return { ...base, estado: "sin_datos" };
  const veredicto = a === 0 ? (b > 0 ? "mejoro" : "igual") : b > a * 1.1 ? "mejoro" : b < a * 0.9 ? "empeoro" : "igual";
  return { ...base, estado: "medido", antes: a, despues: b, veredicto };
}

/** De qué se trata cada familia de decisiones. null = no es trabajo de optimización (cadena, saldo, cobertura…). */
export function areaDeDecision(tipo: string): { area: AreaTrabajo; plataforma: Plataforma | null } | null {
  if (tipo === "web:caida_google" || tipo === "contenido:busquedas") return { area: "web", plataforma: "search_console" };
  if (tipo === "web:sin_conversiones" || tipo === "pauta:landing") return { area: "web", plataforma: "analytics" };
  if (tipo.startsWith("web:")) return { area: "web", plataforma: null };
  if (tipo.startsWith("pauta:")) return { area: "pauta", plataforma: null };
  if (tipo.startsWith("contenido:")) return { area: "contenido", plataforma: null };
  return null;
}

export interface ResumenTrabajo {
  hechos: number;
  propuestos: number;
  automaticos: number;
  medidos: number;
  mejoraron: number;
  igual: number;
  empeoraron: number;
  midiendo: number;
  porArea: Record<AreaTrabajo, { hechos: number; propuestos: number }>;
}

export function resumirTrabajo(items: ItemTrabajo[]): ResumenTrabajo {
  const vacio = () => ({ hechos: 0, propuestos: 0 });
  const r: ResumenTrabajo = {
    hechos: 0, propuestos: 0, automaticos: 0, medidos: 0, mejoraron: 0, igual: 0, empeoraron: 0, midiendo: 0,
    porArea: { pauta: vacio(), web: vacio(), contenido: vacio(), analisis: vacio(), informe: vacio() },
  };
  for (const i of items) {
    if (i.estado === "hecho") {
      r.hechos += 1;
      r.porArea[i.area].hechos += 1;
    } else if (i.estado === "propuesto") {
      r.propuestos += 1;
      r.porArea[i.area].propuestos += 1;
    }
    if (i.automatico) r.automaticos += 1;
    if (i.resultado?.estado === "midiendo") r.midiendo += 1;
    if (i.resultado?.estado === "medido") {
      r.medidos += 1;
      if (i.resultado.veredicto === "mejoro") r.mejoraron += 1;
      else if (i.resultado.veredicto === "empeoro") r.empeoraron += 1;
      else r.igual += 1;
    }
  }
  return r;
}

// ── Lectura ──────────────────────────────────────────────────────────────

type Filas<T> = T[] | { rows?: T[] };
const filasDe = <T>(r: unknown): T[] => (r as { rows?: T[] }).rows ?? (r as T[]);
const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : new Date(0).toISOString());
const texto = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
const ROLES: Record<string, string> = { "media-buyer": "Media buyer", estratega: "Estratega", contenido: "Contenido" };

interface FilaAccion {
  id: string;
  client_id: string | null;
  kind: string;
  entity_type: string | null;
  detail: Record<string, unknown> | null;
  outcome: Record<string, unknown> | null;
  created_at: string | Date;
  agente: string | null;
  plataforma: string | null;
  campana: string | null;
  justificacion: string | null;
  decision_note: string | null;
  decided_by_user_id: string | null;
}

/** Los cambios ejecutados en las cuentas, con el porqué de su aprobación (si la hubo). */
async function accionesEjecutadas(db: Db, f: { clientId?: string; desde: Date; hasta?: Date }): Promise<FilaAccion[]> {
  const r = await db.execute(sql`
    select aa.id, aa.client_id, aa.kind, aa.entity_type, aa.detail, aa.outcome, aa.created_at,
           ag.name as agente, coalesce(aa.detail->>'plataforma', c.platform, s.platform) as plataforma, sc.name as campana,
           ap.justificacion, ap.decision_note, ap.decided_by_user_id
    from agent_actions aa
    left join agents ag on ag.id = aa.agent_id
    left join ads_campaigns c on aa.entity_type = 'campaign' and c.id = aa.entity_id
    left join ads_adsets s on aa.entity_type = 'adset' and s.id = aa.entity_id
    left join ads_campaigns sc on sc.id = s.campaign_id
    left join lateral (
      select p.payload->>'justificacion' as justificacion, p.decision_note, p.decided_by_user_id
      from approvals p
      where p.type = 'accion_pauta' and p.status = 'approved'
        and p.payload->>'clientId' = aa.client_id::text
        and aa.entity_id in (p.payload->'accion'->>'entityId', p.payload->'accion'->'desde'->>'entityId', p.payload->'accion'->'hacia'->>'entityId')
      order by abs(extract(epoch from (coalesce(p.decided_at, p.updated_at) - aa.created_at)))
      limit 1
    ) ap on true
    where aa.created_at >= ${f.desde.toISOString()}::timestamptz
      ${f.hasta ? sql`and aa.created_at < ${f.hasta.toISOString()}::timestamptz` : sql``}
      ${f.clientId ? sql`and aa.client_id = ${f.clientId}` : sql``}
    order by aa.created_at desc
    limit 300
  `);
  return filasDe<FilaAccion>(r as Filas<FilaAccion>);
}

function plataformaDeAccion(a: FilaAccion): Plataforma | null {
  if (a.plataforma === "meta" || a.plataforma === "google") return a.plataforma;
  return a.kind === "add_negative_keywords" || a.kind === "pause_keywords" ? "google" : null;
}

/**
 * Todo lo que hicieron y propusieron los agentes (y las reglas que los
 * alimentan) en los últimos `dias`, de un cliente o de toda la agencia.
 */
export async function trabajoDeAgentes(db: Db, f: { clientId?: string; dias?: number }, ahora = new Date()): Promise<ItemTrabajo[]> {
  const dias = Math.min(Math.max(f.dias ?? 30, 1), 120);
  const desde = new Date(ahora.getTime() - dias * 86_400_000);
  const porCliente = <T>(col: T) => (f.clientId ? sql`${col} = ${f.clientId}` : sql`true`);

  const [acciones, propuestas, decs, analisis, entregas, informes, nombres] = await Promise.all([
    accionesEjecutadas(db, { clientId: f.clientId, desde }),
    db.select({
      id: approvals.id, status: approvals.status, payload: approvals.payload, createdAt: approvals.createdAt,
      decidedAt: approvals.decidedAt, decisionNote: approvals.decisionNote, agente: agents.name,
    }).from(approvals).leftJoin(agents, sql`${agents.id} = ${approvals.requestedByAgentId}`).where(and(
      sql`${approvals.type} = 'accion_pauta'`,
      inArray(approvals.status, ["pending", "revision_requested", "rejected"]),
      gte(approvals.createdAt, desde),
      f.clientId ? sql`${approvals.payload}->>'clientId' = ${f.clientId}` : sql`true`,
    )).limit(300),
    db.select().from(decisiones).where(and(
      or(sql`${decisiones.tipo} like 'pauta:%'`, sql`${decisiones.tipo} like 'web:%'`, sql`${decisiones.tipo} like 'contenido:%'`),
      inArray(decisiones.estado, ["abierta", "aprobada", "ejecutada", "verificada", "descartada"]),
      or(gte(decisiones.createdAt, desde), gte(decisiones.ejecutadaAt, desde)),
      porCliente(decisiones.clientId),
    )).limit(400),
    db.select({ id: agenteTrabajos.id, rol: agenteTrabajos.rol, clientId: agenteTrabajos.clientId, resultado: agenteTrabajos.resultado, finishedAt: agenteTrabajos.finishedAt })
      .from(agenteTrabajos)
      .where(and(sql`${agenteTrabajos.estado} = 'hecho'`, gte(agenteTrabajos.finishedAt, desde), porCliente(agenteTrabajos.clientId)))
      .limit(300),
    db.select({ id: agentDeliverables.id, kind: agentDeliverables.kind, title: agentDeliverables.title, clientId: agentDeliverables.clientId, createdAt: agentDeliverables.createdAt, agente: agents.name })
      .from(agentDeliverables).leftJoin(agents, sql`${agents.id} = ${agentDeliverables.agentId}`)
      .where(and(inArray(agentDeliverables.kind, ["report", "research", "campaign_spec"]), gte(agentDeliverables.createdAt, desde), porCliente(agentDeliverables.clientId)))
      .limit(200),
    db.select({ id: informesSemanales.id, clientId: informesSemanales.clientId, semana: informesSemanales.semana, estado: informesSemanales.estado, escritoPor: informesSemanales.escritoPor, updatedAt: informesSemanales.updatedAt, publicadoAt: informesSemanales.publicadoAt })
      .from(informesSemanales)
      .where(and(gte(informesSemanales.updatedAt, desde), porCliente(informesSemanales.clientId))),
    db.select({ id: clients.id, name: clients.name, slug: clients.slug }).from(clients),
  ]);
  const nombre = new Map(nombres.map((c) => [c.id, c]));
  const cliente = (id: string | null) => (id ? nombre.get(id)?.name.trim() ?? null : null);
  const slug = (id: string | null) => (id ? nombre.get(id)?.slug ?? null : null);
  const items: ItemTrabajo[] = [];

  for (const a of acciones) {
    const automatico = (a.decision_note ?? "").startsWith("Ejecutada sola");
    items.push({
      id: `accion:${a.id}`,
      clientId: a.client_id,
      cliente: cliente(a.client_id),
      clienteSlug: slug(a.client_id),
      fecha: iso(a.created_at),
      area: "pauta",
      plataforma: plataformaDeAccion(a),
      estado: "hecho",
      quien: automatico ? "Piloto automático" : a.decided_by_user_id ? `${a.agente ?? "Agente"}, con OK del equipo` : a.agente ?? "Agente",
      automatico,
      que: fraseAccion({ kind: a.kind, entityType: a.entity_type, detail: a.detail, campana: a.campana }),
      porque: texto(a.justificacion),
      siguiente: null,
      resultado: resultadoDeAccion(a.kind, a.outcome, new Date(a.created_at)),
      enlace: null,
    });
  }

  for (const p of propuestas) {
    const pl = p.payload as { clientId?: string; resumen?: string; justificacion?: string };
    const descartada = p.status === "rejected";
    items.push({
      id: `propuesta:${p.id}`,
      clientId: pl.clientId ?? null,
      cliente: cliente(pl.clientId ?? null),
      clienteSlug: slug(pl.clientId ?? null),
      fecha: iso(descartada ? p.decidedAt ?? p.createdAt : p.createdAt),
      area: "pauta",
      plataforma: null,
      estado: descartada ? "descartado" : "propuesto",
      quien: p.agente ?? "Agente",
      automatico: false,
      que: texto(pl.resumen) ?? "Cambio de pauta",
      porque: descartada ? texto(p.decisionNote) ?? texto(pl.justificacion) : texto(pl.justificacion),
      siguiente: null,
      resultado: null,
      // Se deciden en Hoy (Propuestas de los agentes).
      enlace: descartada ? null : "/hoy",
    });
  }

  // Las mejoras de la web hechas se miden contra Search Console o Analytics.
  const webHechas = decs.filter((d) => (d.estado === "ejecutada" || d.estado === "verificada") && d.ejecutadaAt && areaDeDecision(d.tipo)?.area === "web");
  const diasWeb = webHechas.length
    ? await db.select({ clientId: webDiario.clientId, fecha: webDiario.fecha, gscClics: webDiario.gscClics, gaEventosClave: webDiario.gaEventosClave })
        .from(webDiario)
        .where(and(inArray(webDiario.clientId, [...new Set(webHechas.map((d) => d.clientId))]), gte(webDiario.fecha, sumarDias(diaLocal(desde), -VENTANA_WEB))))
    : [];

  for (const d of decs) {
    const tema = areaDeDecision(d.tipo);
    if (!tema) continue;
    const hecha = d.estado === "ejecutada" || d.estado === "verificada";
    const porque = d.porque as { resumen?: string };
    const accion = d.accion as { descripcion?: string } | null;
    const agenteId = d.creadaPor.startsWith("agente:") ? d.creadaPor.slice(7) : null;
    items.push({
      id: `decision:${d.id}`,
      clientId: d.clientId,
      cliente: cliente(d.clientId),
      clienteSlug: slug(d.clientId),
      fecha: iso(hecha ? d.ejecutadaAt ?? d.updatedAt : d.estado === "descartada" ? d.updatedAt : d.createdAt),
      area: tema.area,
      plataforma: tema.plataforma,
      estado: hecha ? "hecho" : d.estado === "descartada" ? "descartado" : "propuesto",
      quien: agenteId ? ROLES[agenteId] ?? "Agente" : tema.plataforma === "search_console" ? "Search Console" : tema.plataforma === "analytics" ? "Analytics" : "Sistema",
      automatico: false,
      que: d.que,
      porque: d.estado === "descartada" ? texto(d.motivoDescarte) ?? texto(porque?.resumen) : texto(porque?.resumen),
      siguiente: hecha ? null : texto(accion?.descripcion),
      resultado: hecha && tema.area === "web" && d.ejecutadaAt
        ? resultadoWeb(diasWeb.filter((x) => x.clientId === d.clientId).map((x) => ({ fecha: String(x.fecha), gscClics: x.gscClics, gaEventosClave: x.gaEventosClave })), diaLocal(d.ejecutadaAt), tema.plataforma === "analytics" ? "eventos_clave" : "clics_google", ahora)
        : null,
      enlace: null,
    });
  }

  for (const t of analisis) {
    const r = (t.resultado ?? {}) as { resumen?: string; causa?: string; siguientePaso?: { que?: string } };
    if (!texto(r.resumen)) continue;
    items.push({
      id: `analisis:${t.id}`,
      clientId: t.clientId,
      cliente: cliente(t.clientId),
      clienteSlug: slug(t.clientId),
      fecha: iso(t.finishedAt),
      area: "analisis",
      plataforma: null,
      estado: "hecho",
      quien: ROLES[t.rol] ?? t.rol,
      automatico: false,
      que: texto(r.resumen)!,
      porque: texto(r.causa),
      siguiente: texto(r.siguientePaso?.que),
      resultado: null,
      enlace: `/agentes/${t.id}`,
    });
  }

  for (const e of entregas) {
    items.push({
      id: `entrega:${e.id}`,
      clientId: e.clientId,
      cliente: cliente(e.clientId),
      clienteSlug: slug(e.clientId),
      fecha: iso(e.createdAt),
      area: e.kind === "campaign_spec" ? "pauta" : e.kind === "report" ? "informe" : "analisis",
      plataforma: null,
      estado: "hecho",
      quien: e.agente ?? "Agente",
      automatico: false,
      que: e.title,
      porque: null,
      siguiente: null,
      resultado: null,
      enlace: null,
    });
  }

  for (const i of informes) {
    const publicado = i.estado === "publicado";
    items.push({
      id: `informe:${i.id}`,
      clientId: i.clientId,
      cliente: cliente(i.clientId),
      clienteSlug: slug(i.clientId),
      fecha: iso(publicado ? i.publicadoAt ?? i.updatedAt : i.updatedAt),
      area: "informe",
      plataforma: null,
      estado: publicado ? "hecho" : "propuesto",
      quien: i.escritoPor.startsWith("agente:") ? ROLES[i.escritoPor.slice(7)] ?? "Agente" : "Borrador automático",
      automatico: false,
      que: `Informe semanal del cliente, semana del ${String(i.semana)}${publicado ? " (publicado)" : ` (${i.estado}, falta que una persona lo publique)`}`,
      porque: null,
      siguiente: null,
      resultado: null,
      enlace: null,
    });
  }

  return items.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * Lo que ve el cliente en su dashboard: solo los cambios ejecutados en su
 * cuenta y, si ya se midió, qué pasó con su costo por consulta. Ni el porqué
 * interno (se escribe para el equipo, con jerga) ni quién lo hizo.
 */
export async function optimizacionesPublicas(db: Db, clientId: string, since: string, until: string) {
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (!fecha.test(since) || !fecha.test(until)) return [];
  // Del día `since` a `until` inclusive, en horario de Buenos Aires.
  const desde = new Date(`${since}T03:00:00Z`);
  const hasta = new Date(`${sumarDias(until, 1)}T03:00:00Z`);
  const filas = await accionesEjecutadas(db, { clientId, desde, hasta });
  return filas.map((a) => ({
    fecha: iso(a.created_at),
    plataforma: plataformaDeAccion(a),
    que: fraseAccion({ kind: a.kind, entityType: a.entity_type, detail: a.detail, campana: a.campana }, "hicimos"),
    resultado: resultadoDeAccion(a.kind, a.outcome, new Date(a.created_at)),
  }));
}
