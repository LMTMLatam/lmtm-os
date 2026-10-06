// LMTM-OS: el botón. Ejecuta la acción de una decisión por la ruta que ya
// tiene guardas, y nada más.
//
// Acá no se escribe en Meta, Google ni ClickUp por cuenta propia: cada tipo de
// acción llama a la MISMA función que llama el agente, con `approved: true`
// porque el click de una persona es la firma. La firma no saltea nada más: el
// tope de paso, el enfriamiento, la propiedad de la entidad y el chequeo de
// ganador se vuelven a aplicar contra el estado de HOY. Si el mundo cambió
// entre que se propuso y el click, la acción se rechaza y el motivo queda
// escrito en la decisión.
//
// ENSAYO: valida todo sin escribir. En Google va con validateOnly; en Meta, que
// no tiene esa opción, se corta justo antes de la llamada que escribe, ya
// habiendo pasado todas las guardas. Es el modo con el que se prueba esto:
// nunca se ejercita una ruta de pauta de verdad para "ver si anda".

import type { Db } from "@paperclipai/db";
import type { Accion, DecisionFila, ResultadoEjecucion } from "./tipos.js";
import { validarSubida } from "./reglas/pauta.js";
import { presupuestoEnBase, ultimoCambioPresupuesto } from "./motor-datos.js";

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

export async function ejecutarAccion(
  db: Db,
  d: Pick<DecisionFila, "clientId" | "que" | "porque"> & { accion: Accion },
  opts: { ensayo: boolean },
): Promise<ResultadoEjecucion> {
  const at = new Date().toISOString();
  const { ensayo } = opts;
  const { clientId, accion } = d;
  const fin = (ok: boolean, detalle: string, efecto?: Record<string, unknown>): ResultadoEjecucion => ({
    ok,
    detalle,
    ensayo,
    at,
    ...(efecto ? { efecto } : {}),
  });

  try {
    if (accion.tipo === "presupuesto") {
      // El ritmo de escalar (20% y 3 días) es más estricto que el tope de
      // ads-budget (30% y 24 h), y se mide contra el presupuesto de HOY en la
      // base (lo mismo que mira ads-budget en Meta), no contra el que había
      // cuando se propuso.
      const hoy = await presupuestoEnBase(db, accion.entityType, accion.entityId);
      if (hoy != null && accion.anterior != null && Math.abs(hoy - accion.anterior) > 1) {
        // Alguien lo movió a mano después de la propuesta: "subir a $1.200"
        // sobre un presupuesto que ya está en $1.500 sería BAJARLO.
        return fin(false, `El presupuesto cambió desde que se propuso (era ${pesos(accion.anterior)}, ahora ${pesos(hoy)}). La decisión se recalcula en la próxima corrida.`);
      }
      if (hoy != null && accion.nuevoDiario > hoy) {
        const motivo = validarSubida(hoy, accion.nuevoDiario, await ultimoCambioPresupuesto(db, accion.entityId));
        if (motivo) return fin(false, motivo);
      }
      const { setBudget } = await import("../services/ads-budget.js");
      const r = await setBudget(db, {
        clientId,
        entityType: accion.entityType,
        entityId: accion.entityId,
        nuevoDiario: accion.nuevoDiario,
        approved: !ensayo,
        ensayo,
      });
      if (!r.ok) return fin(false, r.error ?? "No se pudo cambiar el presupuesto.");
      return fin(
        true,
        `${ensayo ? "Ensayo OK: " : ""}presupuesto de "${r.entidad?.nombre ?? accion.entityId}" ${ensayo ? "pasaría" : "pasó"} de ${pesos(r.anterior ?? 0)} a ${pesos(r.nuevo ?? accion.nuevoDiario)} por día.`,
        { anterior: r.anterior ?? null, nuevo: r.nuevo ?? accion.nuevoDiario },
      );
    }

    if (accion.tipo === "mover_presupuesto") {
      const { shiftBudget } = await import("../services/ads-budget.js");
      const r = await shiftBudget(db, { clientId, desde: accion.desde, hacia: accion.hacia, monto: accion.monto, approved: !ensayo, ensayo });
      if (!r.ok) return fin(false, r.error ?? "No se pudo mover el presupuesto.");
      return fin(
        true,
        `${ensayo ? "Ensayo OK: se moverían" : "Movidos"} ${pesos(accion.monto)} por día entre las dos entidades.`,
        {
          desde: { anterior: r.desde?.anterior ?? null, nuevo: r.desde?.nuevo ?? null },
          hacia: { anterior: r.hacia?.anterior ?? null, nuevo: r.hacia?.nuevo ?? null },
        },
      );
    }

    if (accion.tipo === "duplicar") {
      const { duplicateWinner } = await import("../services/ads-duplicar.js");
      // duplicateWinner no tiene ensayo: sin `approved` corre todas las guardas
      // (enfriamiento, propiedad, ganador) y se detiene en la firma. Eso ES el
      // ensayo, y no escribe nada.
      const r = await duplicateWinner(db, { clientId, adsetId: accion.adsetId, approved: !ensayo });
      if (ensayo) {
        return r.approvalRequired
          ? fin(true, "Ensayo OK: el conjunto es ganador y se puede duplicar. La copia nacería pausada.")
          : fin(false, r.error ?? "No pasó las guardas.");
      }
      if (!r.ok) return fin(false, r.error ?? "No se pudo duplicar.");
      if (!r.nacioPausada) {
        // No es un éxito a medias: es algo gastando sin que nadie lo decidiera.
        return fin(false, `Copia ${r.copiaId} creada PERO no pude confirmar que quedara pausada. Revisarla YA en Meta.`, { copiaId: r.copiaId });
      }
      return fin(true, `Copia ${r.copiaId} creada y pausada, con el mismo presupuesto.`, { copiaId: r.copiaId, nacioPausada: true });
    }

    if (accion.tipo === "pausar") {
      const { pauseAdEntity } = await import("../services/ads-actions.js");
      const r = await pauseAdEntity(db, { clientId, entityType: accion.entityType, entityId: accion.entityId, approved: !ensayo });
      if (ensayo) {
        return r.approvalRequired
          ? fin(true, `Ensayo OK: "${r.entity?.name ?? accion.entityId}" es de este cliente y se puede pausar.`)
          : fin(false, r.error ?? "No pasó las guardas.");
      }
      return r.ok ? fin(true, `Pausado: "${r.entity?.name ?? accion.entityId}".`) : fin(false, r.error ?? "No se pudo pausar.");
    }

    // tarea
    const { crearTareaEnListaDelCliente } = await import("../services/clickup-sync.js");
    const porque = d.porque?.resumen ? `\n\n**Por qué:** ${d.porque.resumen}` : "";
    const r = await crearTareaEnListaDelCliente(db, clientId, {
      lista: { buscar: /decisiones/i, nombre: "✅ Decisiones" },
      titulo: accion.titulo,
      markdown: `${accion.descripcion ?? d.que}${porque}\n\n_Creada desde Hoy, en LMTM-OS._`,
      ensayo,
    });
    if (!r.ok) return fin(false, r.error ?? "No se pudo crear la tarea en ClickUp.");
    return fin(true, ensayo ? `Ensayo OK: ${r.detalle ?? "la tarea se puede crear."}` : "Tarea creada en ClickUp.", r.url ? { url: r.url } : undefined);
  } catch (e) {
    // Que explote acá no puede tumbar la decisión: el motivo queda a la vista.
    return fin(false, `Error al ejecutar: ${e instanceof Error ? e.message : String(e)}`);
  }
}
