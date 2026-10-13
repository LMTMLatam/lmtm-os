// LMTM-OS: cuentas de pauta que quedaron sin conexión (13/10).
//
// Borrar una conexión deja sus cuentas con connection_id null a propósito
// (migración 0111: el vínculo cuenta↔cliente sobrevive para re-vincularlo). Pero
// nadie las re-vinculaba: el 13/10 alguien reconectó Google (se creó una
// conexión nueva porque el nombre no coincidía), borró la vieja, y las 21
// cuentas de Google de 20 clientes quedaron sueltas. El sync las salta en
// silencio: esa noche no habría entrado un solo dato de Google.
//
// Regla: una cuenta suelta se vincula a la conexión activa de su plataforma
// SOLO si hay exactamente una (en su empresa). Con dos o más no se adivina.

import type { Db } from "@paperclipai/db";
import { sql } from "drizzle-orm";

/** Vincula las cuentas sueltas. Devuelve cuántas por plataforma. Idempotente. */
export async function vincularCuentasSueltas(db: Db, opts: { platform?: string } = {}): Promise<Record<string, number>> {
  const filtro = opts.platform ? sql`and m.platform = ${opts.platform}` : sql``;
  const r = await db.execute(sql`
    update ads_account_mappings m
       set connection_id = c.id, updated_at = now()
      from (
        select company_id, platform, (array_agg(id))[1] as id
          from ads_connections
         where status = 'active'
         group by company_id, platform
        having count(*) = 1
      ) c
     where m.connection_id is null
       and m.company_id = c.company_id
       and m.platform = c.platform
       ${filtro}
    returning m.platform`);
  const filas = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<{ platform: string }>;
  const out: Record<string, number> = {};
  for (const f of filas) out[f.platform] = (out[f.platform] ?? 0) + 1;
  return out;
}

/**
 * Antes de borrar una conexión: sus cuentas pasan a otra conexión activa de la
 * misma plataforma y empresa, si hay exactamente una. Devuelve cuántas pasaron.
 */
export async function pasarCuentasAntesDeBorrar(db: Db, conexionId: string): Promise<number> {
  const r = await db.execute(sql`
    update ads_account_mappings m
       set connection_id = otra.id, updated_at = now()
      from ads_connections vieja,
           lateral (
             select (array_agg(o.id))[1] as id, count(*) as n
               from ads_connections o
              where o.company_id = vieja.company_id and o.platform = vieja.platform
                and o.status = 'active' and o.id <> vieja.id
           ) otra
     where vieja.id = ${conexionId}
       and m.connection_id = vieja.id
       and otra.n = 1
    returning m.id`);
  return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])).length;
}
