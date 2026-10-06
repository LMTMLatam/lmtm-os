// LMTM-OS: corrige las propuestas de pauta de un agente contra los números y el
// playbook. Es el evaluador del piloto en sombra (A4): el agente propone, una
// persona decide, y esto dice si la propuesta tenía con qué sostenerse — aunque
// nadie la haya mirado todavía.
//
// No juzga el criterio fino (eso lo hace la persona al aprobar o descartar):
// marca lo que es objetivamente indefendible con los números que había.
//
// Tres trampas que la primera versión cometía y que un media buyer también
// puede cometer (por eso están acá):
// - medir por CPL una campaña cuyo objetivo no es leads (tráfico, alcance,
//   ventas de catálogo): "0 leads" es lo esperable, no un fracaso;
// - comparar Google contra un objetivo sacado de Meta: no son comparables;
// - cortar la campaña de marca por CPL: protege la búsqueda del propio nombre.

import type { MetricasCampana } from "./campanas.js";
import type { AccionPauta } from "../services/ads-propuestas.js";

/** Playbook de pauta: por debajo de 3 × TCPL de gasto no hay datos para decidir. */
export const GASTO_MINIMO_EN_TCPL = 3;
/** Reemplazar cuando el costo por lead pasa 1,5 × TCPL. */
export const CPL_REEMPLAZO_EN_TCPL = 1.5;
/** Escalar de a 20% como máximo. */
export const ESCALON_MAXIMO = 0.2;
/** Objetivos de Meta que no buscan leads: su CPL no dice nada. */
export const OBJETIVOS_SIN_LEADS = new Set(["OUTCOME_TRAFFIC", "OUTCOME_AWARENESS", "OUTCOME_SALES", "LINK_CLICKS", "REACH", "BRAND_AWARENESS", "PRODUCT_CATALOG_SALES"]);

export interface ContextoEval {
  /** Objetivo de CPL por plataforma (metricasCliente con `plataforma`). */
  tcpl: { meta: number | null; google: number | null };
  /** ¿Es la campaña de marca del cliente? */
  esMarca?: (nombreCampana: string) => boolean;
}

export interface Veredicto {
  ok: boolean;
  fallas: string[];
}

interface Numeros { inversion: number; leads: number; cpl: number | null; presupuestoDiario: number | null }

function buscar(campanas: MetricasCampana[], entityType: "campaign" | "adset", id: string): { campana: MetricasCampana; numeros: Numeros } | null {
  for (const c of campanas) {
    if (entityType === "campaign" && c.campaignId === id) return { campana: c, numeros: c };
    const a = c.conjuntos.find((x) => x.adsetId === id);
    if (entityType === "adset" && a) return { campana: c, numeros: a };
  }
  return null;
}

/**
 * Lo que impide juzgar por CPL a esta campaña, o null si se puede. Exportada
 * para que todo lo que compara una campaña contra el objetivo (el motor de
 * decisiones, el informe del cliente) use la misma vara que el evaluador.
 */
export function noSeMidePorCpl(c: MetricasCampana, ctx: ContextoEval): string | null {
  if (c.leadsDudosos) return "decide sobre leads de Google que no son confiables";
  if (c.objetivoCampana && OBJETIVOS_SIN_LEADS.has(c.objetivoCampana)) return `su objetivo es ${c.objetivoCampana}, no leads: el CPL no la mide`;
  if (c.nombre && ctx.esMarca?.(c.nombre)) return "es la campaña de marca: no se corta por CPL";
  if (ctx.tcpl[c.plataforma] == null) return `sin objetivo de CPL en ${c.plataforma} no hay contra qué medir`;
  return null;
}

/** Pura. `campanas` y `ctx` son los de la ventana que vio el agente. */
export function evaluarPropuesta(accion: AccionPauta, campanas: MetricasCampana[], ctx: ContextoEval): Veredicto {
  const fallas: string[] = [];
  const noEsta = { ok: false, fallas: ["la entidad no está entre las campañas del cliente en la ventana"] };

  if (accion.accion === "pause") {
    const e = buscar(campanas, accion.entityType, accion.entityId);
    if (!e) return noEsta;
    const impide = noSeMidePorCpl(e.campana, ctx);
    if (impide) fallas.push(impide);
    else {
      const tcpl = ctx.tcpl[e.campana.plataforma]!;
      const n = e.numeros;
      if (n.inversion < GASTO_MINIMO_EN_TCPL * tcpl) {
        fallas.push(`gastó ${Math.round(n.inversion)}, menos de ${GASTO_MINIMO_EN_TCPL} × objetivo (${Math.round(GASTO_MINIMO_EN_TCPL * tcpl)}): todavía no hay datos`);
      } else if (n.leads > 0 && n.cpl != null && n.cpl <= CPL_REEMPLAZO_EN_TCPL * tcpl) {
        fallas.push(`CPL ${Math.round(n.cpl)} dentro de ${CPL_REEMPLAZO_EN_TCPL} × objetivo (${Math.round(CPL_REEMPLAZO_EN_TCPL * tcpl)}): no hay motivo de pausa`);
      }
    }
  }

  if (accion.accion === "set_budget") {
    const e = buscar(campanas, accion.entityType, accion.entityId);
    if (!e) return noEsta;
    const actual = e.numeros.presupuestoDiario;
    if (actual != null && accion.nuevoDiario > actual) {
      if (accion.nuevoDiario > actual * (1 + ESCALON_MAXIMO) + 1) {
        fallas.push(`sube ${Math.round((accion.nuevoDiario / actual - 1) * 100)}%: el playbook escala de a ${ESCALON_MAXIMO * 100}% como máximo`);
      }
      const impide = noSeMidePorCpl(e.campana, ctx);
      const tcpl = ctx.tcpl[e.campana.plataforma];
      if (impide && !impide.startsWith("es la campaña de marca")) fallas.push(impide);
      else if (!impide && tcpl != null && (e.numeros.cpl == null || e.numeros.cpl > tcpl)) {
        fallas.push(`escala algo con CPL ${e.numeros.cpl == null ? "sin leads" : Math.round(e.numeros.cpl)} por encima del objetivo (${Math.round(tcpl)})`);
      }
    }
  }

  if (accion.accion === "shift_budget") {
    const desde = buscar(campanas, accion.desde.entityType, accion.desde.entityId);
    const hacia = buscar(campanas, accion.hacia.entityType, accion.hacia.entityId);
    if (!desde || !hacia) return { ok: false, fallas: ["alguna de las dos entidades no está entre las campañas del cliente"] };
    if (desde.campana.plataforma !== hacia.campana.plataforma) fallas.push("compara CPL entre Meta y Google, que no son comparables");
    else {
      const impide = noSeMidePorCpl(desde.campana, ctx) ?? noSeMidePorCpl(hacia.campana, ctx);
      if (impide) fallas.push(impide);
      else if (desde.numeros.cpl != null && hacia.numeros.cpl != null && hacia.numeros.cpl >= desde.numeros.cpl) {
        fallas.push(`mueve plata hacia lo más caro (CPL ${Math.round(hacia.numeros.cpl)} vs ${Math.round(desde.numeros.cpl)})`);
      }
    }
  }

  return { ok: fallas.length === 0, fallas };
}
