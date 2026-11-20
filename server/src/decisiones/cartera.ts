// LMTM-OS: la Cartera, todos los clientes activos en una lectura (/cartera).
//
// Había cuatro carteras: la tabla de Pauta (TablaCartera), el semáforo de
// Growth, el de Operación y las tarjetas de Clientes, cada una con su suma de
// `ads_insights` y su vara (el semáforo usaba el ideal del rubro como si fuera
// el objetivo del cliente). Ésta lee `metricas` y `decisiones`: por cliente, la
// semana contra SU objetivo, si estamos viendo sus datos, la próxima decisión
// y si el informe de la semana está. Ordenada por la plata en riesgo.

import type { Db } from "@paperclipai/db";
import { clients, informesSemanales } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { estadoContraObjetivo, numerosDeMetricas, semanaAnterior, ultimaSemana, type EstadoObjetivo, type NumerosInforme } from "./informe.js";
import type { EstadoInforme } from "./informes-store.js";
import { listarDecisiones, type DecisionConCliente } from "./store.js";
import type { EstadoFuente, Fuente } from "../ingest/salud.js";
import { metricasCliente } from "../metricas/index.js";

export interface FilaCartera {
  clientId: string;
  cliente: string;
  slug: string;
  /** Suma de la plata por día de lo que hay para decidir. null = nada medido (no es 0). */
  plataEnRiesgo: number | null;
  semana: Pick<NumerosInforme, "inversion" | "leads" | "cpl" | "objetivo" | "objetivoFuente" | "leadsDudosos"> & { cplAnterior: number | null };
  estado: EstadoObjetivo;
  /** Fuentes de pauta con problemas (fallando, atrasada, desconectada con datos). */
  fuentesConProblemas: Array<{ fuente: Fuente; estado: EstadoFuente }>;
  sinPauta: boolean;
  decisiones: number;
  proxima: Pick<DecisionConCliente, "id" | "que" | "arsPorDia" | "responsable"> | null;
  informe: EstadoInforme | null;
}

export interface Cartera {
  semana: { desde: string; hasta: string };
  clientes: FilaCartera[];
  /** Clientes cuyas métricas no se pudieron leer: se dicen, no se esconden. */
  sinLeer: string[];
}

const PESO_ESTADO: Record<EstadoObjetivo, number> = { muy_arriba: 0, arriba: 1, sin_dato: 2, en_objetivo: 3 };

/** Orden: plata en riesgo, después los más lejos del objetivo, después por nombre. Puro. */
export function ordenarCartera(filas: FilaCartera[]): FilaCartera[] {
  return [...filas].sort(
    (a, b) =>
      (b.plataEnRiesgo ?? -1) - (a.plataEnRiesgo ?? -1) ||
      PESO_ESTADO[a.estado] - PESO_ESTADO[b.estado] ||
      a.cliente.localeCompare(b.cliente, "es"),
  );
}

/**
 * Puro salvo el reloj. Guarda el resultado de `calcular` por `clave` durante `ms`, y guarda la PROMESA: dos pedidos
 * que llegan juntos con el caché vacío esperan el mismo cálculo. Si falla, no queda guardado.
 */
export function recordar<T>(ms: number, ahora: () => number = Date.now) {
  let memo: { clave: string; at: number; valor: Promise<T> } | null = null;
  return (clave: string, calcular: () => Promise<T>): Promise<T> => {
    if (memo && memo.clave === clave && ahora() - memo.at < ms) return memo.valor;
    const valor = calcular();
    memo = { clave, at: ahora(), valor };
    valor.catch(() => {
      if (memo?.valor === valor) memo = null;
    });
    return valor;
  };
}

type MetricasFila = { n: NumerosInforme; frescura: Awaited<ReturnType<typeof metricasCliente>>["frescura"] } | { error: true };

/**
 * Auditoría 20/11: cada lectura de la cartera eran ~600 consultas (59 clientes × 2 semanas × 5). Las métricas cambian
 * con el sync diario; las decisiones y los informes, todo el día. Lo de métricas se guarda 30 min; lo demás se lee
 * fresco en cada pedido (dos consultas).
 */
const metricasGuardadas = recordar<Map<string, MetricasFila>>(30 * 60_000);

async function metricasDeLaCartera(db: Db, semana: ReturnType<typeof ultimaSemana>, activos: Array<{ id: string; name: string }>) {
  const porCliente = new Map<string, MetricasFila>();
  // De a pocos clientes por vez: son ~59 y cada uno son dos lecturas de métricas.
  for (let i = 0; i < activos.length; i += 6) {
    await Promise.all(
      activos.slice(i, i + 6).map(async (c) => {
        try {
          // Una lectura de la semana y otra de la anterior; la frescura viene en la primera.
          const [m, ant] = await Promise.all([metricasCliente(db, c.id, semana), metricasCliente(db, c.id, semanaAnterior(semana))]);
          porCliente.set(c.id, { n: numerosDeMetricas(semana, m, ant), frescura: m.frescura });
        } catch (e) {
          console.warn(`[cartera] sin métricas de ${c.name.trim()}:`, e instanceof Error ? e.message : e);
          porCliente.set(c.id, { error: true });
        }
      }),
    );
  }
  return porCliente;
}

export async function datosDeCartera(db: Db, ahora = new Date()): Promise<Cartera> {
  const semana = ultimaSemana(ahora);
  const [activos, vivas, informes] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, slug: clients.slug }).from(clients).where(eq(clients.status, "active")),
    listarDecisiones(db, { estados: ["abierta", "aprobada"], limite: 1000 }),
    db.select({ clientId: informesSemanales.clientId, estado: informesSemanales.estado }).from(informesSemanales).where(eq(informesSemanales.semana, semana.desde)),
  ]);
  const porCliente = new Map<string, DecisionConCliente[]>();
  for (const d of vivas) porCliente.set(d.clientId, [...(porCliente.get(d.clientId) ?? []), d]);
  const informePor = new Map(informes.map((i) => [i.clientId, i.estado as EstadoInforme]));

  // La clave lleva los clientes activos: si se suma o se da de baja uno, se recalcula.
  const metricas = await metricasGuardadas(`${semana.desde}|${activos.map((c) => c.id).sort().join(",")}`, () => metricasDeLaCartera(db, semana, activos));
  const sinLeer: string[] = [];
  const filas: FilaCartera[] = [];
  {
    const lote = activos.map((c) => {
      const m = metricas.get(c.id);
      if (!m || "error" in m) {
        sinLeer.push(c.name.trim());
        return null;
      }
      return { c, n: m.n, frescura: m.frescura };
    });
    for (const x of lote) {
      if (!x) continue;
      const ds = porCliente.get(x.c.id) ?? [];
      const conPlata = ds.filter((d) => d.arsPorDia != null);
      const proxima = ds[0] ?? null; // listarDecisiones ya viene ordenada por plata
      filas.push({
        clientId: x.c.id,
        cliente: x.c.name.trim(),
        slug: x.c.slug,
        plataEnRiesgo: conPlata.length ? conPlata.reduce((s, d) => s + (d.arsPorDia ?? 0), 0) : null,
        semana: {
          inversion: x.n.inversion,
          leads: x.n.leads,
          cpl: x.n.cpl,
          objetivo: x.n.objetivo,
          objetivoFuente: x.n.objetivoFuente,
          leadsDudosos: x.n.leadsDudosos,
          cplAnterior: x.n.anterior.cpl,
        },
        // Con conversiones de Google que no son consultas, el costo del total no se compara.
        estado: x.n.leadsDudosos ? "sin_dato" : estadoContraObjetivo(x.n.cpl, x.n.objetivo, { gasto: x.n.inversion, consultas: x.n.leads }),
        fuentesConProblemas: x.frescura
          .filter((f) => f.fuente !== "organico")
          .filter((f) => f.estado === "fallando" || f.estado === "atrasada" || (f.estado === "sin_conexion" && f.ultimoDato != null))
          .map((f) => ({ fuente: f.fuente, estado: f.estado })),
        sinPauta: x.n.inversion == null,
        decisiones: ds.length,
        proxima: proxima ? { id: proxima.id, que: proxima.que, arsPorDia: proxima.arsPorDia, responsable: proxima.responsable } : null,
        informe: informePor.get(x.c.id) ?? null,
      });
    }
  }
  return { semana, clientes: ordenarCartera(filas), sinLeer };
}
