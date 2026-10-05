// LMTM-OS: la cartera entera en una tabla, cruzada.
//
// EL PROBLEMA QUE RESUELVE
// El análisis existía y estaba enterrado. `ads-deep-analysis.ts` ya comparaba el
// CPL de un cliente contra su rubro, miraba el mix de formatos y el CPL por
// edad — pero todo eso vivía DENTRO de la ficha de un cliente, una por una. No
// había forma de mirar los 59 juntos y ver cuál se despegó del rubro, cuál
// empeoró contra sí mismo, y cuál tiene plata parada. Textual del jefe: "no
// está integrado, no está cruzado, no tengo un análisis profundo de esto".
//
// Cruzar no es poner más columnas: es que cada fila traiga las TRES comparaciones
// que hacen falta para decidir —contra el rubro, contra su propio pasado, y
// contra lo que se está perdiendo por no hacer nada— y que de ahí salga una
// próxima acción.
//
// EL DÍA EN CURSO NO CUENTA
// `ads_insights` de hoy está a medio sincronizar: medido un 13/9 a media mañana
// tenía 3 clientes y $744 contra 16 clientes y $375.628 de ayer. Incluirlo ya
// rompió dos cálculos distintos (plata parada inflada 2×, una alerta de saldo
// que avisaba tarde). Las dos ventanas terminan ayer, y el corte sale de la
// misma constante que usa `costo-de-no-hacer` para que los dos números de la
// misma fila no se contradigan.

import type { Db } from "@paperclipai/db";
import { adsCreatives, adsInsights, clients, learnings } from "@paperclipai/db";
import { and, eq, sql } from "drizzle-orm";
import { costoPorCliente } from "./costo-de-no-hacer.js";
import { DIAS_IGNORADOS } from "./costo-de-no-hacer.js";

/** Ventana de comparación, en días completos. */
export const DIAS_VENTANA = 30;

/** Mínimo de impresiones para que una comparación signifique algo. */
export const MINIMO_IMPRESIONES = 500;

export interface FilaCartera {
  clientId: string;
  nombre: string;
  slug: string;
  rubro: string | null;
  inversion30d: number;
  leads30d: number;
  cpl: number | null;
  /** % contra el CPL promedio del rubro. Negativo = mejor que el rubro. */
  deltaRubroPct: number | null;
  cplRubro: number | null;
  /** % contra sus propios 30 días previos. Negativo = mejoró. */
  deltaPropioPct: number | null;
  cplPrevio: number | null;
  formatoDominante: string | null;
  formatoDominantePct: number | null;
  plataParadaPorDia: number;
  proximaAccion: Accion;
}

export interface Accion {
  /** Qué hacer, en una línea. */
  texto: string;
  /** Para ordenar y pintar: cuanto más alto, más urgente. */
  prioridad: number;
  tono: "critico" | "alerta" | "oportunidad" | "neutro";
}

const SIN_ACCION: Accion = { texto: "Sin acción", prioridad: 0, tono: "neutro" };

/**
 * Qué hacer con este cliente, según los tres cruces.
 *
 * Pura a propósito: es la columna que convierte la tabla en decisiones, y la
 * que más se va a querer discutir y ajustar. Que se pueda leer y probar entera
 * sin DB es la diferencia entre poder cambiarla y tenerle miedo.
 *
 * El orden importa: lo primero que matchea gana. La plata parada va arriba de
 * todo porque es lo único que se está perdiendo HOY, mientras el resto describe
 * eficiencia.
 */
export function decidirAccion(f: {
  inversion30d: number;
  leads30d: number;
  cpl: number | null;
  deltaRubroPct: number | null;
  deltaPropioPct: number | null;
  formatoDominantePct: number | null;
  plataParadaPorDia: number;
  impresiones30d: number;
}): Accion {
  if (f.plataParadaPorDia > 0) {
    return {
      texto: `Reactivar: $${Math.round(f.plataParadaPorDia).toLocaleString("es-AR")} por día parados`,
      prioridad: 100,
      tono: "critico",
    };
  }

  // Sin pauta contratada NO es un problema: es un estado. Pintarlo en rojo fue
  // el bug que puso 40 de 58 clientes en alerta y volvió inútil el semáforo.
  if (f.inversion30d <= 0) {
    return { texto: "Sin pauta en el período", prioridad: 0, tono: "neutro" };
  }

  if (f.leads30d === 0) {
    return { texto: "Gasta y no trae leads: revisar conversión y seguimiento", prioridad: 90, tono: "critico" };
  }

  // Debajo del mínimo de impresiones ninguna comparación significa nada: un
  // umbral que decide sobre la FALTA de datos no puede afirmar nada.
  if (f.impresiones30d < MINIMO_IMPRESIONES) {
    return { texto: "Muy poco volumen para comparar todavía", prioridad: 10, tono: "neutro" };
  }

  if (f.deltaPropioPct != null && f.deltaPropioPct >= 25) {
    return { texto: `Se encareció ${f.deltaPropioPct}% contra sus propios 30 días previos`, prioridad: 80, tono: "alerta" };
  }

  if (f.deltaRubroPct != null && f.deltaRubroPct >= 25) {
    return { texto: `CPL ${f.deltaRubroPct}% arriba del rubro: revisar creatividad y segmentación`, prioridad: 70, tono: "alerta" };
  }

  if (f.deltaRubroPct != null && f.deltaRubroPct <= -15) {
    return { texto: `CPL ${Math.abs(f.deltaRubroPct)}% mejor que el rubro: es momento de escalar presupuesto`, prioridad: 60, tono: "oportunidad" };
  }

  if (f.formatoDominantePct != null && f.formatoDominantePct >= 70) {
    return { texto: `${f.formatoDominantePct}% de los avisos son del mismo formato: diversificar`, prioridad: 40, tono: "alerta" };
  }

  return SIN_ACCION;
}

/** Variación porcentual, redondeada. `null` cuando no se puede comparar. */
export function variacionPct(actual: number | null, referencia: number | null): number | null {
  if (actual == null || referencia == null || referencia <= 0) return null;
  return Math.round(((actual - referencia) / referencia) * 100);
}

function clasificarFormato(raw: unknown): string {
  const creative = (raw as { creative?: Record<string, unknown> } | null)?.creative ?? {};
  const spec = (creative.object_story_spec ?? {}) as Record<string, unknown>;
  if (spec.video_data) return "video";
  const link = spec.link_data as Record<string, unknown> | undefined;
  if (link?.child_attachments) return "carrusel";
  if (link) return "imagen";
  if (spec.photo_data) return "imagen";
  return "otro";
}

/** La cartera entera, cruzada y ordenada por lo que más urge. */
export async function cartera(db: Db): Promise<{ filas: FilaCartera[]; desde: string; hasta: string }> {
  const finVentana = DIAS_IGNORADOS;
  const inicioActual = DIAS_IGNORADOS + DIAS_VENTANA;
  const inicioPrevio = DIAS_IGNORADOS + DIAS_VENTANA * 2;
  const dias = (n: number) => sql.raw(String(n));

  const activos = await db
    .select({ id: clients.id, name: clients.name, slug: clients.slug, industry: clients.industry })
    .from(clients)
    .where(eq(clients.status, "active"));
  if (activos.length === 0) return { filas: [], desde: "", hasta: "" };

  // Las dos ventanas en UNA consulta: 59 clientes × 2 ventanas serían 118
  // consultas, y esta tabla se abre a cada rato.
  const metricas = await db
    .select({
      clientId: adsInsights.clientId,
      spendActual: sql<string>`coalesce(sum(${adsInsights.spend}) filter (
        where ${adsInsights.date} > (current_date - ${dias(inicioActual)}::int)
          and ${adsInsights.date} <= (current_date - ${dias(finVentana)}::int)), 0)`,
      leadsActual: sql<number>`coalesce(sum(${adsInsights.leads}) filter (
        where ${adsInsights.date} > (current_date - ${dias(inicioActual)}::int)
          and ${adsInsights.date} <= (current_date - ${dias(finVentana)}::int)), 0)::int`,
      imprActual: sql<number>`coalesce(sum(${adsInsights.impressions}) filter (
        where ${adsInsights.date} > (current_date - ${dias(inicioActual)}::int)
          and ${adsInsights.date} <= (current_date - ${dias(finVentana)}::int)), 0)::int`,
      spendPrevio: sql<string>`coalesce(sum(${adsInsights.spend}) filter (
        where ${adsInsights.date} > (current_date - ${dias(inicioPrevio)}::int)
          and ${adsInsights.date} <= (current_date - ${dias(inicioActual)}::int)), 0)`,
      leadsPrevio: sql<number>`coalesce(sum(${adsInsights.leads}) filter (
        where ${adsInsights.date} > (current_date - ${dias(inicioPrevio)}::int)
          and ${adsInsights.date} <= (current_date - ${dias(inicioActual)}::int)), 0)::int`,
    })
    .from(adsInsights)
    .where(sql`${adsInsights.date} > (current_date - ${dias(inicioPrevio)}::int)`)
    .groupBy(adsInsights.clientId);
  const porCliente = new Map(metricas.map((m) => [m.clientId, m]));

  // Benchmarks del rubro. OJO: scope es `niche_benchmark`, NO `niche`.
  const bms = await db
    .select({ scopeKey: learnings.scopeKey, evidence: learnings.evidence })
    .from(learnings)
    .where(eq(learnings.scope, "niche_benchmark"));
  const benchPorRubro = new Map(
    bms.map((b) => [b.scopeKey, (b.evidence ?? null) as { avgCpl?: number; idealCpl?: number } | null]),
  );

  // Mix de formatos: una sola pasada por todos los creativos.
  const creativos = await db
    .select({ clientId: adsCreatives.clientId, status: adsCreatives.status, raw: adsCreatives.raw })
    .from(adsCreatives);
  const formatoPorCliente = new Map<string, { dominante: string; pct: number }>();
  const agrupados = new Map<string, Array<{ status: string | null; raw: unknown }>>();
  for (const c of creativos) {
    if (!c.clientId) continue;
    const arr = agrupados.get(c.clientId) ?? [];
    arr.push({ status: c.status, raw: c.raw });
    agrupados.set(c.clientId, arr);
  }
  for (const [clientId, todos] of agrupados) {
    const activosC = todos.filter((c) => /active/i.test(String(c.status ?? "")));
    const base = activosC.length >= 3 ? activosC : todos;
    if (base.length < 3) continue;
    const mix: Record<string, number> = {};
    for (const c of base) {
      const f = clasificarFormato(c.raw);
      mix[f] = (mix[f] ?? 0) + 1;
    }
    const [dom, n] = Object.entries(mix).sort((a, b) => b[1] - a[1])[0];
    formatoPorCliente.set(clientId, { dominante: dom, pct: Math.round((n / base.length) * 100) });
  }

  const costos = await costoPorCliente(db).catch(() => new Map());

  const filas: FilaCartera[] = activos.map((c) => {
    const m = porCliente.get(c.id);
    const inversion30d = Math.round(Number(m?.spendActual ?? 0));
    const leads30d = Number(m?.leadsActual ?? 0);
    const impresiones30d = Number(m?.imprActual ?? 0);
    const spendPrevio = Number(m?.spendPrevio ?? 0);
    const leadsPrevio = Number(m?.leadsPrevio ?? 0);

    const cpl = leads30d > 0 ? Math.round(inversion30d / leads30d) : null;
    const cplPrevio = leadsPrevio > 0 ? Math.round(spendPrevio / leadsPrevio) : null;

    const bench = c.industry ? benchPorRubro.get(c.industry) : null;
    const cplRubro = bench?.avgCpl ?? null;

    const fmt = formatoPorCliente.get(c.id) ?? null;
    const plataParadaPorDia = costos.get(c.id)?.arsPorDia ?? 0;

    const deltaRubroPct = variacionPct(cpl, cplRubro);
    const deltaPropioPct = variacionPct(cpl, cplPrevio);

    return {
      clientId: c.id,
      nombre: c.name,
      slug: c.slug,
      rubro: c.industry,
      inversion30d,
      leads30d,
      cpl,
      deltaRubroPct,
      cplRubro,
      deltaPropioPct,
      cplPrevio,
      formatoDominante: fmt?.dominante ?? null,
      formatoDominantePct: fmt?.pct ?? null,
      plataParadaPorDia,
      proximaAccion: decidirAccion({
        inversion30d,
        leads30d,
        cpl,
        deltaRubroPct,
        deltaPropioPct,
        formatoDominantePct: fmt?.pct ?? null,
        plataParadaPorDia,
        impresiones30d,
      }),
    };
  });

  // Por lo que más urge, y a igual urgencia por la que mueve más plata.
  filas.sort((a, b) => b.proximaAccion.prioridad - a.proximaAccion.prioridad || b.inversion30d - a.inversion30d);

  const fecha = (atras: number) => new Date(Date.now() - atras * 86_400_000).toISOString().slice(0, 10);
  return { filas, desde: fecha(inicioActual), hasta: fecha(finVentana) };
}
