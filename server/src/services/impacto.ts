// LMTM-OS: lo que cambió por el trabajo de los agentes, antes y después (pedido de Naza 20/11: «que haya cosas que
// muestren que está sirviendo el equipo de agentes: comparativas de lo que era antes y después de pasar por los
// agentes; Google Ads, webs, SEO, reflejado en visual»).
//
// Solo lo que se puede medir de verdad:
//  · Pauta: cada cambio real en una cuenta (agent_actions) se mide a los días con el costo por consulta del cliente
//    antes y después (services/action-outcomes.ts). Acá se juntan por cliente y se cuentan los veredictos.
//  · Webs: los cambios de los agentes en webs (agent_actions web_*) por tipo, y los clics de Google por semana de las
//    webs que tocaron contra las que no, indexados a 100 en las semanas antes del primer cambio.
//  · Google Ads: lo que espera aprobación (no hay cambios ejecutados que medir todavía).

import type { Db } from "@paperclipai/db";
import { sql } from "drizzle-orm";

export interface AccionMedida {
  clientId: string;
  cliente: string;
  slug: string;
  kind: string;
  createdAt: string;
  outcome: Record<string, unknown> | null;
}

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : null);

/** Puro. Veredictos de los cambios de pauta y, por cliente, el costo por consulta antes del primer cambio medido y después del último. */
export function impactoPauta(acciones: AccionMedida[]) {
  const r = { mejoraron: 0, igual: 0, empeoraron: 0, midiendo: 0, pausado: { gastoSemana: 0, consultasSemana: 0 } };
  const porCliente = new Map<string, { cliente: string; slug: string; cambios: number; primera: AccionMedida; ultima: AccionMedida }>();
  const orden = [...acciones].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const a of orden) {
    const o = a.outcome;
    if (!o) {
      r.midiendo += 1;
      continue;
    }
    if (o.verdict === "improved") r.mejoraron += 1;
    else if (o.verdict === "worse") r.empeoraron += 1;
    else r.igual += 1;
    if (a.kind === "pause_ad_entity") {
      r.pausado.gastoSemana += num(o.entitySpend7dBefore) ?? 0;
      r.pausado.consultasSemana += num(o.entityLeads7dBefore) ?? 0;
    }
    if (num(o.clientCplBefore) == null || num(o.clientCplAfter) == null) continue;
    const c = porCliente.get(a.clientId);
    if (c) {
      c.cambios += 1;
      c.ultima = a;
    } else porCliente.set(a.clientId, { cliente: a.cliente, slug: a.slug, cambios: 1, primera: a, ultima: a });
  }
  const clientes = [...porCliente.values()]
    .map((c) => ({ cliente: c.cliente, slug: c.slug, cambios: c.cambios, cplAntes: num(c.primera.outcome!.clientCplBefore)!, cplDespues: num(c.ultima.outcome!.clientCplAfter)! }))
    .sort((a, b) => b.cambios - a.cambios);
  return { ...r, clientes };
}

const TIPO_WEB: Record<string, string> = {
  web_quitar_spam: "Spam quitado",
  web_reemplazar_texto: "Textos corregidos",
  web_actualizar_plugins: "Actualizaciones",
  web_actualizar_temas: "Actualizaciones",
  web_actualizar_wordpress: "Actualizaciones",
  web_version_php: "Actualizaciones",
  web_instalar_ssl: "Seguridad",
  web_forzar_https: "Seguridad",
  web_bajar_administrador: "Seguridad",
  web_desactivar_plugin: "Seguridad",
};

/** Puro. Los cambios de web agrupados por lo que resuelven. */
export function cambiosWeb(filas: Array<{ kind: string; clientId: string }>) {
  const porTipo = new Map<string, number>();
  for (const f of filas) {
    const t = TIPO_WEB[f.kind] ?? "Otros";
    porTipo.set(t, (porTipo.get(t) ?? 0) + 1);
  }
  return {
    webs: new Set(filas.map((f) => f.clientId)).size,
    total: filas.length,
    porTipo: [...porTipo.entries()].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
  };
}

/**
 * Puro. Clics de Google por semana de dos grupos de webs, cada grupo en base 100 = su promedio de las semanas antes del
 * corte. Solo semanas completas (7 días con dato en los dos grupos): la última suele venir a medias.
 */
export function indexarSemanas(filas: Array<{ semana: string; conAgentes: boolean; clics: number; dias: number }>, corte: string) {
  const semanas = [...new Set(filas.map((f) => f.semana))].sort();
  const de = (s: string, con: boolean) => filas.find((f) => f.semana === s && f.conAgentes === con);
  const completas = semanas.filter((s) => (de(s, true)?.dias ?? 0) >= 7 && (de(s, false)?.dias ?? 0) >= 7);
  const base = (con: boolean) => {
    const antes = completas.filter((s) => s < corte).map((s) => de(s, con)!.clics);
    return antes.length ? antes.reduce((t, x) => t + x, 0) / antes.length : null;
  };
  const bCon = base(true);
  const bSin = base(false);
  if (!bCon || !bSin) return [];
  return completas.map((s) => ({ semana: s, conAgentes: Math.round((de(s, true)!.clics / bCon) * 100), sinAgentes: Math.round((de(s, false)!.clics / bSin) * 100) }));
}

type Filas<T> = T[] | { rows?: T[] };
const filasDe = <T>(r: Filas<T>): T[] => (Array.isArray(r) ? r : (r.rows ?? []));

export async function impactoDeAgentes(db: Db) {
  const acciones = filasDe(
    (await db.execute(sql`
      select aa.client_id as "clientId", c.name as cliente, c.slug, aa.kind, aa.created_at::text as "createdAt", aa.outcome
      from agent_actions aa join clients c on c.id = aa.client_id
      order by aa.created_at`)) as unknown as Filas<AccionMedida>,
  );
  const pauta = acciones.filter((a) => !a.kind.startsWith("web_"));
  const web = acciones.filter((a) => a.kind.startsWith("web_"));
  const primeraWeb = web.length ? web[0].createdAt.slice(0, 10) : null;

  // Webs: clics de Google por semana (lunes), las que tocaron los agentes contra las que no, 12 semanas.
  let semanas: ReturnType<typeof indexarSemanas> = [];
  if (primeraWeb) {
    const filas = filasDe(
      (await db.execute(sql`
        with tocadas as (select distinct client_id from agent_actions where kind like 'web_%')
        select date_trunc('week', w.fecha)::date::text as semana, (w.client_id in (select client_id from tocadas)) as "conAgentes",
               sum(w.gsc_clics)::int as clics, count(distinct w.fecha)::int as dias
        from web_diario w
        where w.fecha >= current_date - 84
        group by 1, 2`)) as unknown as Filas<{ semana: string; conAgentes: boolean; clics: number; dias: number }>,
    );
    semanas = indexarSemanas(filas, primeraWeb);
  }

  // Google Ads: lo que espera una persona (no hay cambios ejecutados que medir).
  const [google] = filasDe(
    (await db.execute(sql`
      select count(*)::int as abiertas, coalesce(sum(ars_por_dia), 0)::float as "arsPorDia"
      from decisiones where estado = 'abierta' and tipo in ('pauta:negativas', 'pauta:pausar_keywords', 'pauta:sumar_keywords')`)) as unknown as Filas<{ abiertas: number; arsPorDia: number }>,
  );

  return {
    pauta: impactoPauta(pauta),
    web: { ...cambiosWeb(web), primerCambio: primeraWeb, semanas },
    google: google ?? { abiertas: 0, arsPorDia: 0 },
  };
}
