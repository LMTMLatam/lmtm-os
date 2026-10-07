// LMTM-OS: "ya corrió hoy", leído del registro y no de la memoria.
//
// Los monitores guardaban el día de la última corrida en una variable, así que
// cada deploy los volvía a correr. El 06/10 hubo una docena de deploys y la
// cadena de publicación, los disparos de Make y la contaminación salieron seis
// veces cada uno; script-health abrió tres veces la misma tarea para SRP en una
// hora y se la mandó por WhatsApp a diseño las tres veces.

import type { Db } from "@paperclipai/db";
import { syncLogs } from "@paperclipai/db";
import { eq, sql } from "drizzle-orm";
import { diaLocal } from "../avisos/politica.js";

/**
 * ¿Le toca correr hoy (Buenos Aires) a este trabajo? Si sí, deja la marca en
 * `sync_logs` antes de devolver, así una segunda llamada el mismo día da false.
 * Si no se puede leer el registro, no corre: repetir avisos es peor que
 * saltear un día.
 */
export async function tocaHoy(db: Db, trabajo: string, ahora = new Date()): Promise<boolean> {
  try {
    const [r] = await db
      .select({ at: sql<string | null>`max(${syncLogs.createdAt})` })
      .from(syncLogs)
      .where(eq(syncLogs.jobName, trabajo));
    if (r?.at && diaLocal(new Date(r.at)) === diaLocal(ahora)) return false;
    await db.insert(syncLogs).values({ jobName: trabajo, platform: "lmtm", status: "completed", completedAt: ahora });
    return true;
  } catch (e) {
    console.warn(`[una-vez-por-dia] ${trabajo}: no se pudo leer el registro, no corre`, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Lo mismo que tocaHoy pero cada `dias` días (corridos desde la última marca).
 * Para trabajos semanales que no tienen que esperar a un día fijo.
 */
export async function tocaCadaDias(db: Db, trabajo: string, dias: number, ahora = new Date()): Promise<boolean> {
  try {
    const [r] = await db
      .select({ at: sql<string | null>`max(${syncLogs.createdAt})` })
      .from(syncLogs)
      .where(eq(syncLogs.jobName, trabajo));
    if (r?.at && ahora.getTime() - new Date(r.at).getTime() < dias * 86_400_000) return false;
    await db.insert(syncLogs).values({ jobName: trabajo, platform: "lmtm", status: "completed", completedAt: ahora });
    return true;
  } catch (e) {
    console.warn(`[una-vez-por-dia] ${trabajo}: no se pudo leer el registro, no corre`, e instanceof Error ? e.message : e);
    return false;
  }
}
