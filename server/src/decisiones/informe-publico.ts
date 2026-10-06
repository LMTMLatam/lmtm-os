// LMTM-OS: lo que ve el cliente en su link (/public/dashboards/:slug).
//
// Antes el link era un tablero de 9 pestañas armado sumando `ads_insights` a
// mano, con números que no resisten una pregunta: visitas a la página
// calculadas como clics × 0,6, frecuencia sumando alcances diarios, ROAS con
// conversiones de Google que en varias cuentas son cualquier acción. Ahora es
// un informe: cuánto costó cada consulta contra el objetivo, cómo viene,
// por campaña, lo que necesitamos del cliente y la narrativa de la semana que
// publicó una persona. Todo número sale de `metricas` (A2).

import type { Db } from "@paperclipai/db";
import { clients, decisiones } from "@paperclipai/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { metricasCliente } from "../metricas/index.js";
import { metricasCampanas } from "../metricas/campanas.js";
import { noSeMidePorCpl } from "../metricas/eval-propuestas.js";
import { esTerminoDeMarca } from "../services/ads-keywords.js";
import {
  esSemanaValida,
  estadoContraObjetivo,
  renderizarNarrativa,
  semanaAnterior,
  ultimaSemana,
  type EstadoObjetivo,
  type Narrativa,
  type NumerosInforme,
} from "./informe.js";
import { fraseParaCliente, informePublicado, numerosDeSemana } from "./informes-store.js";
import { conCache } from "./informe-cache.js";

export interface SemanaTendencia {
  desde: string;
  inversion: number | null;
  leads: number | null;
  cpl: number | null;
}

export interface CampanaInforme {
  nombre: string;
  plataforma: "meta" | "google";
  inversion: number;
  leads: number;
  cpl: number | null;
  estado: EstadoObjetivo;
  /** Google contando como consulta lo que no es: el número no es comparable. */
  leadsDudosos: boolean;
}

export interface InformePublico {
  semana: { desde: string; hasta: string };
  /** Hasta dónde se puede ir para atrás con las flechas. */
  primeraSemana: string;
  numeros: NumerosInforme;
  /** Contra qué se compara: el costo por calificado cuando hay CRM, si no el costo por consulta. */
  medida: "calificado" | "lead";
  estado: EstadoObjetivo;
  tendencia: SemanaTendencia[];
  campanas: CampanaInforme[] | null;
  pedidos: string[];
  narrativa: Narrativa | null;
  publicadoAt: string | null;
}

const SEMANAS_TENDENCIA = 8;

/** La semana que se va a mostrar: la pedida si es válida, si no la última completa. */
export function semanaParaMostrar(semanaPedida: string | undefined, ahora = new Date()): string {
  return semanaPedida && esSemanaValida(semanaPedida, ahora) ? semanaPedida : ultimaSemana(ahora).desde;
}

/** Lo mismo que `informePublico`, guardado 5 minutos por cliente y semana (ver informe-cache.ts). */
export function informePublicoCacheado(db: Db, clientId: string, semanaPedida?: string): Promise<InformePublico> {
  const desde = semanaParaMostrar(semanaPedida);
  return conCache(clientId, desde, () => informePublico(db, clientId, desde));
}

export async function informePublico(db: Db, clientId: string, semanaPedida?: string, ahora = new Date()): Promise<InformePublico> {
  const desde = semanaParaMostrar(semanaPedida, ahora);
  const publicado = await informePublicado(db, clientId, desde);

  // Lo publicado se muestra con los números con los que se auditó: si la
  // ingesta corrigió un día después, el cliente no ve un texto que diga una
  // cosa y una tarjeta que diga otra.
  const numeros = publicado?.numeros ?? (await numerosDeSemana(db, clientId, desde));
  const semana = { desde: numeros.desde, hasta: numeros.hasta };
  const medida = numeros.costoPorCalificado != null ? "calificado" : "lead";
  // Con conversiones de Google que no son consultas, el costo por consulta
  // del total no se compara con nada: "En el objetivo" sería falso.
  const estado = numeros.leadsDudosos && medida === "lead" ? "sin_dato" : estadoContraObjetivo(medida === "calificado" ? numeros.costoPorCalificado : numeros.cpl, numeros.objetivo);

  // Tendencia: la semana pedida y las 7 anteriores, cada una de metricasCliente().
  const semanas: Array<{ desde: string; hasta: string }> = [semana];
  while (semanas.length < SEMANAS_TENDENCIA) semanas.push(semanaAnterior(semanas[semanas.length - 1]));
  const tendencia = (
    await Promise.all(
      semanas.map(async (s) => {
        const m = await metricasCliente(db, clientId, s);
        return { desde: s.desde, inversion: m.inversion, leads: m.leads, cpl: m.cpl };
      }),
    )
  ).reverse();
  // La semana publicada se dibuja con los números con los que se auditó: si
  // no, la barra y el texto de arriba podrían decir dos cosas distintas.
  if (publicado) {
    const i = tendencia.findIndex((t) => t.desde === numeros.desde);
    if (i >= 0) tendencia[i] = { desde: numeros.desde, inversion: numeros.inversion, leads: numeros.leads, cpl: numeros.cpl };
  }

  // Cada campaña se mide contra el objetivo de SU plataforma, y solo si su CPL
  // la mide: la misma vara que el evaluador de pauta (noSeMidePorCpl). Con el
  // objetivo total, el cliente veía "muy arriba" su campaña de marca, Google
  // contra un objetivo sacado de Meta, y campañas de tráfico y catálogo.
  const [porCampana, objMeta, objGoogle, [cli]] = await Promise.all([
    metricasCampanas(db, clientId, semana),
    metricasCliente(db, clientId, { ...semana, plataforma: "meta" }),
    metricasCliente(db, clientId, { ...semana, plataforma: "google" }),
    db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)),
  ]);
  const vara = {
    tcpl: { meta: objMeta.objetivo.tcpl, google: objGoogle.objetivo.tcpl },
    esMarca: (n: string) => /\b(brand|marca)\b/i.test(n) || esTerminoDeMarca(cli?.name ?? "", n),
  };
  const campanas = porCampana
    ? porCampana
        .filter((c) => c.inversion > 0)
        .sort((a, b) => b.inversion - a.inversion)
        .map((c): CampanaInforme => ({
          nombre: c.nombre?.trim() || "Campaña sin nombre",
          plataforma: c.plataforma,
          inversion: c.inversion,
          leads: c.leads,
          cpl: c.cpl,
          estado: noSeMidePorCpl(c, vara) ? "sin_dato" : estadoContraObjetivo(c.cpl, vara.tcpl[c.plataforma]),
          leadsDudosos: c.leadsDudosos,
        }))
    : null;

  // Lo que necesitamos del cliente HOY (no lo de hace una semana): decisiones
  // abiertas de las reglas que le tocan a él, dichas sin el detalle interno.
  const abiertas = await db
    .select({ que: decisiones.que })
    .from(decisiones)
    .where(and(
      eq(decisiones.clientId, clientId),
      inArray(decisiones.estado, ["abierta", "aprobada"]),
      eq(decisiones.responsable, "cliente"),
      sql`${decisiones.creadaPor} like 'regla:%'`,
    ))
    .orderBy(sql`${decisiones.arsPorDia} desc nulls last`);
  const narrativa = publicado ? renderizarNarrativa(publicado.narrativa, publicado.numeros) : null;
  const pedidos = [...new Set([...(narrativa?.pedidos ?? []), ...abiertas.map((a) => fraseParaCliente(a.que)).filter((x): x is string => !!x)])].slice(0, 4);

  return {
    semana,
    primeraSemana: semanas[semanas.length - 1].desde,
    numeros,
    medida,
    estado,
    tendencia,
    campanas,
    pedidos,
    narrativa,
    publicadoAt: publicado?.publicadoAt ? new Date(publicado.publicadoAt).toISOString() : null,
  };
}
