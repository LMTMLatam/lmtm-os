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
  const r = { mejoraron: 0, igual: 0, empeoraron: 0, midiendo: 0 };
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
 * Puro. Clics de Google por semana de dos grupos de webs (las que tocaron los agentes y las que no), cada grupo en base
 * 100 = su promedio de las semanas antes del corte. Cada web cuenta recién desde la semana siguiente a su primer clic:
 * antes Google no estaba conectado (0 o vacío) y sumarla haría parecer que «creció» (20/11: las webs de los agentes se
 * conectaron el 19/10 y el gráfico mostraba un salto que no era de los agentes). Ventana común: desde que la última web
 * con agentes empezó a medir; las de afuera entran solo si ya medían. Solo semanas completas, al menos dos antes del
 * corte y una después; si no, no hay comparación.
 */
export function indexarSemanas(filas: Array<{ clientId: string; semana: string; conAgentes: boolean; clics: number | null; dias: number }>, corte: string) {
  const semanas = [...new Set(filas.map((f) => f.semana))].sort();
  const primerClic = new Map<string, string>();
  for (const f of [...filas].sort((a, b) => a.semana.localeCompare(b.semana))) if ((f.clics ?? 0) > 0 && !primerClic.has(f.clientId)) primerClic.set(f.clientId, f.semana);
  const desdeDe = new Map([...primerClic].map(([id, s]) => [id, semanas[semanas.indexOf(s) + 1]] as const).filter(([, s]) => s));
  const con = new Set(filas.filter((f) => f.conAgentes).map((f) => f.clientId));
  const inicios = [...desdeDe].filter(([id]) => con.has(id)).map(([, s]) => s!);
  if (inicios.length === 0) return [];
  const desde = inicios.sort().at(-1)!;
  const incluidos = new Set([...desdeDe].filter(([, s]) => s! <= desde).map(([id]) => id));
  const ventana = semanas.filter((s) => s >= desde && filas.filter((f) => f.semana === s && incluidos.has(f.clientId)).every((f) => f.dias >= 7));
  const suma = (s: string, conAgentes: boolean) => filas.filter((f) => f.semana === s && f.conAgentes === conAgentes && incluidos.has(f.clientId)).reduce((t, f) => t + (f.clics ?? 0), 0);
  const antes = ventana.filter((s) => s < corte);
  if (antes.length < 2 || antes.length === ventana.length) return [];
  const base = (c: boolean) => antes.reduce((t, s) => t + suma(s, c), 0) / antes.length;
  const bCon = base(true);
  const bSin = base(false);
  if (!bCon || !bSin) return [];
  return ventana.map((s) => ({ semana: s, conAgentes: Math.round((suma(s, true) / bCon) * 100), sinAgentes: Math.round((suma(s, false) / bSin) * 100) }));
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
        select w.client_id::text as "clientId", date_trunc('week', w.fecha)::date::text as semana, (w.client_id in (select client_id from tocadas)) as "conAgentes",
               sum(w.gsc_clics)::int as clics, count(distinct w.fecha)::int as dias
        from web_diario w
        where w.fecha >= current_date - 84
        group by 1, 2, 3`)) as unknown as Filas<{ clientId: string; semana: string; conAgentes: boolean; clics: number | null; dias: number }>,
    );
    semanas = indexarSemanas(filas, primeraWeb);
  }

  // Google Ads (20/11): negativas y keywords nuevas se hacen solas en la hora; pausar keywords espera a una persona.
  const [google] = filasDe(
    (await db.execute(sql`
      select count(*) filter (where tipo in ('pauta:negativas', 'pauta:sumar_keywords'))::int as "enCola",
             count(*) filter (where tipo = 'pauta:pausar_keywords')::int as esperan
      from decisiones where estado in ('abierta', 'aprobada') and accion->'resultado' is null
        and tipo in ('pauta:negativas', 'pauta:pausar_keywords', 'pauta:sumar_keywords')`)) as unknown as Filas<{ enCola: number; esperan: number }>,
  );

  return {
    pauta: impactoPauta(pauta),
    web: { ...cambiosWeb(web), primerCambio: primeraWeb, semanas },
    google: google ?? { enCola: 0, esperan: 0 },
  };
}
