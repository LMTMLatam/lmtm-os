// LMTM-OS: el runner propio de agentes (fase C2). Reemplaza heartbeats,
// issues y wakeups de paperclip por una cola de trabajos que nacen de hechos.
//
// Se prende con LMTM_RUNNER=1. Mientras tanto los agentes de paperclip siguen
// como estaban: el runner corre en paralelo, rol por rol.

import type { Db } from "@paperclipai/db";
import { encolarDecisiones, rescatarColgados, tomar } from "./cola.js";
import { correrTrabajo } from "./correr.js";

let reloj: ReturnType<typeof setInterval> | null = null;
let enCurso = 0;

export function iniciarRunner(db: Db, opts: { serverPort: number }): void {
  if (reloj || process.env.LMTM_RUNNER !== "1") return;
  const concurrencia = Math.max(1, Number(process.env.LMTM_RUNNER_CONCURRENCIA) || 2);

  const tick = async () => {
    try {
      await rescatarColgados(db);
      const nuevos = await encolarDecisiones(db);
      if (nuevos > 0) console.log(`[agentes] ${nuevos} trabajo(s) nuevo(s) por decisiones`);
      while (enCurso < concurrencia) {
        const t = await tomar(db);
        if (!t) break;
        enCurso += 1;
        console.log(`[agentes] corre ${t.rol} ${t.id} (${t.motivo})`);
        void correrTrabajo(db, t, opts)
          .catch((e) => console.warn(`[agentes] ${t.id} falló fuera del runner:`, e instanceof Error ? e.message : e))
          .finally(() => {
            enCurso -= 1;
          });
      }
    } catch (e) {
      console.warn("[agentes] tick falló:", e instanceof Error ? e.message : e);
    }
  };
  reloj = setInterval(() => void tick(), 60_000);
  setTimeout(() => void tick(), 30_000);
  console.log(`[agentes] runner prendido (concurrencia ${concurrencia})`);
}
