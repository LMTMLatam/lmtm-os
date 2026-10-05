// LMTM-OS: qué hacer con la tabla después de correr las reglas. Puro.
//
// Las reglas corren todos los días y vuelven a encontrar lo mismo. Sin esto,
// la tabla se llenaría de duplicados (el cementerio de siempre) o, al revés,
// algo resuelto seguiría pidiendo atención. Las cuatro respuestas posibles:
//
//   la regla lo encontró y no hay decisión viva      → insertar
//   la regla lo encontró y hay una abierta/aprobada  → actualizar los números
//   la regla NO lo encontró y había una abierta       → vencer (dejó de aplicar)
//   la regla NO lo encontró y había una ejecutada     → VERIFICAR, si el dato es
//                                                       posterior a la ejecución
//
// Y la que hace honesto el ciclo: si la regla lo SIGUE encontrando con datos
// posteriores a la ejecución, pasado un margen, la decisión vuelve a abierta.
// "Lo hice" no alcanza; el número tiene que moverse.
//
// Si una regla no pudo mirar (Make caído, una API que no contestó), no se toca
// nada de lo suyo: no ver no es lo mismo que estar bien.

import { deMenor } from "../services/ads-budget.js";
import type { Accion, EstadoDecision, Propuesta, ResultadoEjecucion, ResultadoRegla } from "./tipos.js";

export interface Viva {
  id: string;
  clave: string;
  estado: EstadoDecision;
  creadaPor: string;
  ejecutadaAt: Date | null;
  venceAt: Date | null;
  accion: (Accion & { resultado?: ResultadoEjecucion }) | null;
}

export interface ResultadoConFecha extends ResultadoRegla {
  /** Hasta cuándo llegan los datos con los que corrió la regla. */
  datosHasta: Date;
}

export type Operacion =
  | { op: "insertar"; propuesta: Propuesta }
  | { op: "actualizar"; id: string; propuesta: Propuesta }
  | { op: "verificar"; id: string }
  | { op: "no_confirmada"; id: string; propuesta: Propuesta | null; nota: string }
  | { op: "vencer"; id: string; motivo: "dejo_de_aplicar" | "plazo" }
  | { op: "sin_confirmacion"; id: string };

/** Margen después de ejecutar antes de declarar que no sirvió. */
export const GRACIA_DIAS: Record<"tarea" | "plataforma" | "manual", number> = {
  // Un reemplazo de anuncio o un escenario de Make tardan días en estar.
  tarea: 7,
  // Un cambio en Meta o Google se ve en el próximo sync.
  plataforma: 2,
  // Lo que alguien marcó como hecho a mano.
  manual: 3,
};

const DIA = 86_400_000;

/**
 * Lo ejecutado que en este plazo ningún dato confirmó ni desmintió se cierra
 * como vencido (no como verificado: nadie lo pudo probar). Mismo plazo que la
 * cola humana usa para cerrar lo bloqueado que nadie tocó.
 */
export const PLAZO_SIN_CONFIRMACION_DIAS = 21;

/** Las acciones de plataforma tienen su propia verificación: mirar el cambio en la cuenta. */
export function verificaPorEfecto(accion: Viva["accion"]): boolean {
  if (!accion?.resultado?.ok || accion.resultado.ensayo) return false;
  return accion.tipo === "presupuesto" || accion.tipo === "pausar" || accion.tipo === "duplicar" || accion.tipo === "mover_presupuesto";
}

function gracia(accion: Viva["accion"]): number {
  if (!accion) return GRACIA_DIAS.manual;
  return accion.tipo === "tarea" ? GRACIA_DIAS.tarea : GRACIA_DIAS.plataforma;
}

const fecha = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * `descartadas`: clave → cuándo la descartó una persona por última vez.
 *
 * Un descarte se respeta: si la regla sigue encontrando lo mismo, no se vuelve
 * a abrir hasta que pase su plazo (`venceEnDias`). Sin esto, "descartar" duraba
 * hasta la próxima corrida y la persona tenía que descartar lo mismo todos los
 * días, que es exactamente el ruido que hace que se deje de mirar.
 */
export function planificar(
  vivas: Viva[],
  resultados: ResultadoConFecha[],
  ahora = new Date(),
  descartadas: Map<string, Date> = new Map(),
): Operacion[] {
  const ops: Operacion[] = [];
  const porClave = new Map(vivas.map((v) => [v.clave, v]));
  const tocadas = new Set<string>();

  for (const r of resultados) {
    if (!r.evaluada) continue;
    const vistas = new Set<string>();

    for (const p of r.propuestas) {
      // Dos propuestas con la misma clave en la misma corrida: gana la primera.
      if (vistas.has(p.clave)) continue;
      vistas.add(p.clave);
      const v = porClave.get(p.clave);
      if (!v) {
        const descartada = descartadas.get(p.clave);
        if (descartada && ahora.getTime() - descartada.getTime() < p.venceEnDias * DIA) continue;
        ops.push({ op: "insertar", propuesta: p });
        continue;
      }
      tocadas.add(v.id);
      if (v.estado === "abierta" || v.estado === "aprobada") {
        ops.push({ op: "actualizar", id: v.id, propuesta: p });
      } else if (v.estado === "ejecutada" && !verificaPorEfecto(v.accion) && v.ejecutadaAt) {
        const limite = v.ejecutadaAt.getTime() + gracia(v.accion) * DIA;
        if (r.datosHasta.getTime() > limite) {
          ops.push({
            op: "no_confirmada",
            id: v.id,
            propuesta: p,
            nota: `Se marcó hecha el ${fecha(v.ejecutadaAt)} y el dato sigue igual.`,
          });
        }
      }
    }

    // Lo de esta regla que ya no apareció.
    const prefijo = `regla:${r.regla}`;
    for (const v of vivas) {
      if (v.creadaPor !== prefijo || vistas.has(v.clave)) continue;
      tocadas.add(v.id);
      if (v.estado === "abierta" || v.estado === "aprobada") {
        ops.push({ op: "vencer", id: v.id, motivo: "dejo_de_aplicar" });
      } else if (v.estado === "ejecutada" && !verificaPorEfecto(v.accion)) {
        // Solo con datos POSTERIORES a la ejecución: el problema se fue
        // después de que alguien hizo algo.
        if (v.ejecutadaAt && r.datosHasta.getTime() > v.ejecutadaAt.getTime()) {
          ops.push({ op: "verificar", id: v.id });
        }
      }
    }
  }

  const conOperacion = new Set(ops.filter((o): o is Extract<Operacion, { id: string }> => "id" in o).map((o) => o.id));
  for (const v of vivas) {
    // Plazo vencido: lo que nadie tocó y ninguna regla volvió a afirmar.
    if (!tocadas.has(v.id) && (v.estado === "abierta" || v.estado === "aprobada") && v.venceAt && v.venceAt.getTime() < ahora.getTime()) {
      ops.push({ op: "vencer", id: v.id, motivo: "plazo" });
    }
    // Ejecutada hace demasiado sin que nada la confirme: una tarea de un
    // agente que ninguna regla mira, un presupuesto de Google que el sync no
    // trae. Viva para siempre sería un cementerio y además taparía su clave.
    if (
      v.estado === "ejecutada" &&
      !conOperacion.has(v.id) &&
      v.ejecutadaAt &&
      ahora.getTime() - v.ejecutadaAt.getTime() > PLAZO_SIN_CONFIRMACION_DIAS * DIA
    ) {
      ops.push({ op: "sin_confirmacion", id: v.id });
    }
  }
  return ops;
}

// ── Verificación por efecto (acciones sobre la cuenta de pauta) ────────────

export interface FilaEntidad {
  /** Cuándo la trajo el último sync. */
  syncedAt: Date;
  platform: string;
  status: string | null;
  /** Lo que guarda la tabla: en Meta, centavos. */
  dailyBudget: number | null;
}

export type VeredictoEfecto = { veredicto: "verificar" } | { veredicto: "no_confirmada"; nota: string } | { veredicto: "esperar" };

/**
 * ¿La cuenta muestra el cambio que se ejecutó?
 *
 * Solo se juzga con una fila sincronizada DESPUÉS de la ejecución. Antes de
 * eso, lo que hay en la tabla es la foto vieja y no dice nada.
 */
export function verificarEfecto(
  accion: NonNullable<Viva["accion"]>,
  ejecutadaAt: Date,
  fila: FilaEntidad | null,
  ahora = new Date(),
): VeredictoEfecto {
  const vencido = ahora.getTime() - ejecutadaAt.getTime() > GRACIA_DIAS.plataforma * DIA;
  if (!fila || fila.syncedAt.getTime() <= ejecutadaAt.getTime()) {
    if (accion.tipo === "duplicar" && !fila && vencido) {
      return { veredicto: "no_confirmada", nota: "La copia no apareció en la cuenta después del sync." };
    }
    return { veredicto: "esperar" };
  }
  if (accion.tipo === "presupuesto") {
    // Google no trae presupuestos en el sync: sin dato no se afirma nada.
    if (fila.platform !== "meta" || fila.dailyBudget == null) return { veredicto: "esperar" };
    const pesos = deMenor(fila.dailyBudget);
    if (Math.abs(pesos - accion.nuevoDiario) <= 1) return { veredicto: "verificar" };
    return {
      veredicto: "no_confirmada",
      nota: `La cuenta muestra $${Math.round(pesos).toLocaleString("es-AR")} por día, no $${Math.round(accion.nuevoDiario).toLocaleString("es-AR")}.`,
    };
  }
  if (accion.tipo === "pausar") {
    if (/paused/i.test(fila.status ?? "")) return { veredicto: "verificar" };
    return { veredicto: "no_confirmada", nota: `La cuenta la muestra en "${fila.status ?? "sin estado"}", no pausada.` };
  }
  if (accion.tipo === "duplicar") {
    // La copia existe y está pausada, que es como tiene que nacer.
    if (/paused/i.test(fila.status ?? "")) return { veredicto: "verificar" };
    return { veredicto: "no_confirmada", nota: `La copia está en "${fila.status ?? "sin estado"}": tenía que nacer pausada. Revisarla en Meta.` };
  }
  return { veredicto: "esperar" };
}
