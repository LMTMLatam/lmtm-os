// LMTM-OS: la pantalla Cliente en una lectura (pestaña "Resumen" de /c/:slug).
//
// Lo que el equipo necesita para decidir sobre UN cliente: cómo viene contra
// el objetivo (costo por consulta, o por calificada cuando haya CRM, no CTR),
// el embudo del mes, qué hay para decidir y qué se hizo, y el informe de la
// semana listo para publicar. Reemplaza a "Plan de acción" (un semáforo y una
// narrativa de modelo sin control). Todo número sale de `metricas`.

import type { Db } from "@paperclipai/db";
import { publicDashboards } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { metricasCliente } from "../metricas/index.js";
import { estadoContraObjetivo, renderizarNarrativa, ultimaSemana, type EstadoObjetivo, type Narrativa, type NumerosInforme } from "./informe.js";
import { listarInformes, numerosDeSemana, type EstadoInforme } from "./informes-store.js";
import { listarDecisiones, type DecisionConCliente } from "./store.js";

export interface EmbudoCliente {
  desde: string;
  hasta: string;
  inversion: number | null;
  leads: number | null;
  calificados: number | null;
  ventas: number | null;
  cpl: number | null;
  costoPorCalificado: number | null;
  costoPorVenta: number | null;
}

export interface ResumenCliente {
  semana: NumerosInforme;
  estado: EstadoObjetivo;
  medida: "calificado" | "lead";
  embudo: EmbudoCliente;
  decisiones: DecisionConCliente[];
  hechas: DecisionConCliente[];
  informe: {
    id: string;
    semana: string;
    estado: EstadoInforme;
    escritoPor: string;
    fallas: string[];
    texto: Narrativa;
    publicadoAt: string | null;
  } | null;
  /** El link que tiene el cliente (el slug no cambia). null = no tiene uno activo. */
  linkPublico: string | null;
}

const sumarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function resumenDeCliente(db: Db, clientId: string, ahora = new Date()): Promise<ResumenCliente> {
  const s = ultimaSemana(ahora);
  // El embudo, de los últimos 30 días completos: una semana tiene muy pocas
  // ventas para leer una tasa.
  const v30 = { desde: sumarDias(s.hasta, -29), hasta: s.hasta };
  const [semana, m30, vivas, hechas, informes, [link]] = await Promise.all([
    numerosDeSemana(db, clientId, s.desde),
    metricasCliente(db, clientId, v30),
    listarDecisiones(db, { clientId }),
    listarDecisiones(db, { clientId, estados: ["verificada"], limite: 100 }),
    listarInformes(db, clientId, 1),
    db.select({ slug: publicDashboards.slug }).from(publicDashboards).where(and(eq(publicDashboards.clientId, clientId), eq(publicDashboards.enabled, true))).limit(1),
  ]);
  const medida = semana.costoPorCalificado != null ? "calificado" : "lead";
  const i = informes[0] && informes[0].semana === s.desde ? informes[0] : null;
  return {
    semana,
    medida,
    estado:
      semana.leadsDudosos && medida === "lead"
        ? "sin_dato"
        : medida === "calificado"
          ? estadoContraObjetivo(semana.costoPorCalificado, semana.objetivo)
          : estadoContraObjetivo(semana.cpl, semana.objetivo, { gasto: semana.inversion, consultas: semana.leads }),
    embudo: {
      ...v30,
      inversion: m30.inversion,
      leads: m30.leads,
      calificados: m30.leadsCalificados,
      ventas: m30.ventas,
      cpl: m30.cpl,
      costoPorCalificado: m30.costoPorCalificado,
      costoPorVenta: m30.costoPorVenta,
    },
    decisiones: vivas.filter((d) => d.estado !== "ejecutada"),
    // Lo más reciente primero: la lista viene ordenada por plata, y algo viejo
    // y caro taparía lo que se hizo esta semana.
    hechas: [...vivas.filter((d) => d.estado === "ejecutada"), ...hechas]
      .sort((a, b) => (b.ejecutadaAt ? Date.parse(String(b.ejecutadaAt)) : 0) - (a.ejecutadaAt ? Date.parse(String(a.ejecutadaAt)) : 0))
      .slice(0, 6),
    informe: i
      ? {
          id: i.id,
          semana: i.semana,
          estado: i.estado,
          escritoPor: i.escritoPor,
          fallas: i.auditoria?.fallas ?? [],
          texto: renderizarNarrativa(i.narrativa, i.numeros),
          publicadoAt: i.publicadoAt ? new Date(i.publicadoAt).toISOString() : null,
        }
      : null,
    linkPublico: link ? `/public/dashboards/${link.slug}` : null,
  };
}
