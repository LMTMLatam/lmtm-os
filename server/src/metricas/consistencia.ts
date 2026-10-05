// LMTM-OS: chequeo diario de que lo guardado coincide con lo que dijo Meta.
//
// Así se encontraron los leads inflados 43% y las 190.978 ventas falsas:
// recalculando desde `ads_insights.raw` y comparando con la columna. Era un
// método manual; ahora corre todos los días. Si un escritor nuevo (o uno viejo
// que vuelve) usa otra fórmula, se nota al día siguiente y no tres meses después.

import type { Db } from "@paperclipai/db";
import { sql } from "drizzle-orm";

export interface Consistencia {
  filas: number;
  leadsMal: number;
  conversionesMal: number;
  /** Filas sin client_id o sin raw: invisibles para el panel o imposibles de auditar. */
  huerfanas: number;
}

/** Recalcula leads y compras desde raw con las mismas reglas que meta.ts. */
export async function chequeoConsistencia(db: Db): Promise<Consistencia> {
  const r = await db.execute(sql`
    with acc as (
      select i.leads, i.conversions, i.client_id, i.raw,
        coalesce((select sum((x->>'value')::numeric) from jsonb_array_elements(coalesce(i.raw->'actions','[]'::jsonb)) x
                  where x->>'action_type' = 'onsite_conversion.messaging_conversation_started_7d'), 0) as conv,
        coalesce((select max((x->>'value')::numeric) from jsonb_array_elements(coalesce(i.raw->'actions','[]'::jsonb)) x
                  where x->>'action_type' in ('lead','onsite_conversion.lead_grouped','leadgen_other')), 0) as form,
        coalesce((select max((x->>'value')::numeric) from jsonb_array_elements(coalesce(i.raw->'actions','[]'::jsonb)) x
                  where x->>'action_type' in ('omni_purchase','purchase','onsite_web_purchase','onsite_web_app_purchase',
                    'onsite_app_purchase','onsite_conversion.purchase','offsite_conversion.fb_pixel_purchase','web_in_store_purchase')), 0) as compras
      from ads_insights i
      where i.platform = 'meta'
    )
    select count(*) as filas,
           count(*) filter (where leads <> (case when conv > 0 then conv else form end)) as leads_mal,
           count(*) filter (where conversions <> compras) as conversiones_mal,
           count(*) filter (where client_id is null or raw = '{}'::jsonb) as huerfanas
    from acc`);
  const f = (Array.isArray(r) ? r[0] : (r as { rows?: Record<string, unknown>[] }).rows?.[0]) ?? {};
  return {
    filas: Number(f.filas ?? 0),
    leadsMal: Number(f.leads_mal ?? 0),
    conversionesMal: Number(f.conversiones_mal ?? 0),
    huerfanas: Number(f.huerfanas ?? 0),
  };
}

/** Texto del aviso, o null si está todo bien. Pura. */
export function avisoInconsistencia(c: Consistencia): string | null {
  if (c.leadsMal === 0 && c.conversionesMal === 0 && c.huerfanas === 0) return null;
  const partes: string[] = [];
  if (c.leadsMal) partes.push(`${c.leadsMal} filas con leads distintos a lo que dijo Meta`);
  if (c.conversionesMal) partes.push(`${c.conversionesMal} con ventas distintas`);
  if (c.huerfanas) partes.push(`${c.huerfanas} sin cliente o sin dato crudo`);
  return `Los números de pauta no cierran: ${partes.join(", ")} (de ${c.filas}). Algo está escribiendo ads_insights con otra fórmula. Revisar antes de mandar informes.`;
}

/** Corre el chequeo y avisa al equipo si algo no cierra (nivel 4: urgente, no plata). */
export async function avisarSiNoCierra(db: Db): Promise<Consistencia & { avisado: boolean }> {
  const c = await chequeoConsistencia(db);
  const texto = avisoInconsistencia(c);
  if (!texto) return { ...c, avisado: false };
  const { avisarAlEquipo } = await import("../services/wa-embudo.js");
  const r = await avisarAlEquipo(db, { origen: "consistencia-metricas", clave: `consistencia:${new Date().toISOString().slice(0, 10)}`, texto, nivel: 4 });
  return { ...c, avisado: r.estado === "enviado" };
}
