// LMTM-OS: publicaciones trabadas en Make, a la vista y con un botón (plan 15/11, fase 5).
//
// Del 12 al 14/11 se trabaron 22 posts de Instagram en 19 clientes (adjuntos de
// ClickUp privados) y se vieron por los mails de Make, no en el panel. Esto lista
// cada ejecución incompleta sin resolver con su causa en castellano, y reprocesa
// la que una persona elija: Make la retoma desde el paso que falló (no repite las
// redes que ya salieron). Reprocesar PUBLICA en la cuenta del cliente: lo decide
// una persona desde el panel, nunca un agente.

import type { Db } from "@paperclipai/db";
import { clients } from "@paperclipai/db";
import { clienteReal } from "./intel-common.js";

export interface Trabada { dlqId: string; scenarioId: number; escenario: string; clientId: string | null; cliente: string; creada: string; motivo: string; causa: string; intentos: number | null }

/** Las incompletas sin resolver de los últimos `dias`, de todos los escenarios. */
export async function publicacionesTrabadas(db: Db, dias = 14, ahora = new Date()): Promise<{ trabadas: Trabada[]; ciego: boolean }> {
  const make = await import("./make.js");
  if (!make.makeConfigured()) return { trabadas: [], ciego: true };
  const { explicarFalla } = await import("./salud-posteos.js");
  let escenarios: Awaited<ReturnType<typeof make.makeListScenarios>>;
  try { escenarios = await make.makeListScenarios(); } catch { return { trabadas: [], ciego: true }; }
  const lista = await db.select({ id: clients.id, name: clients.name }).from(clients).where(clienteReal());
  const desde = ahora.getTime() - dias * 86_400_000;
  const out: Trabada[] = [];
  for (const sc of escenarios.filter((s) => (s.dlqCount ?? 0) > 0)) {
    const cli = lista.find((c) => make.matchScenario(c.name, [sc])?.id === sc.id) ?? null;
    let incompletas: Awaited<ReturnType<typeof make.makeIncompletas>> = [];
    try { incompletas = await make.makeIncompletas(sc.id); } catch { continue; }
    for (const x of incompletas.filter((i) => !i.resolved && Date.parse(i.created) >= desde)) {
      out.push({
        dlqId: x.id, scenarioId: sc.id, escenario: sc.name, clientId: cli?.id ?? null, cliente: (cli?.name ?? sc.name).trim(),
        creada: x.created, motivo: (x.reason ?? "").slice(0, 200), causa: explicarFalla(x.reason), intentos: x.attempts ?? null,
      });
    }
  }
  return { trabadas: out.sort((a, b) => b.creada.localeCompare(a.creada)), ciego: false };
}

/** Reprocesa UNA incompleta (Make la retoma desde el paso que falló). */
export async function reprocesarTrabada(dlqId: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!/^[0-9a-f]{32}$/i.test(dlqId)) return { ok: false, motivo: "Id de Make inválido." };
  const token = process.env.MAKE_API_TOKEN?.trim();
  if (!token) return { ok: false, motivo: "Make no está configurado en el servidor." };
  const base = (process.env.MAKE_API_BASE?.trim() || "https://us2.make.com/api/v2").replace(/\/$/, "");
  const r = await fetch(`${base}/dlqs/${dlqId}/retry`, { method: "POST", headers: { Authorization: `Token ${token}` } }).catch(() => null);
  if (!r) return { ok: false, motivo: "Make no respondió." };
  if (!r.ok) return { ok: false, motivo: `Make respondió ${r.status}: ${(await r.text()).slice(0, 160)}` };
  return { ok: true };
}
