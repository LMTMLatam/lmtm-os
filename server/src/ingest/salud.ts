// LMTM-OS: salud de las fuentes de datos, por cliente y fuente.
//
// El panel mostraba "0" igual para tres cosas distintas: una cuenta sin
// conectar, un sync que falla todas las noches y una pauta pausada. Con eso se
// escondieron fallas reales (Google con 403 durante semanas) y se inventaron
// otras: HANSHI parecía "112 días a ciegas" y en realidad las noches en que el
// sync anduvo tampoco trajeron datos — la pauta estaba pausada.
//
// Por eso acá la falta de un dato nunca se lee sola: primero se mira si hay
// conexión, después si el sync corre y termina bien, y recién entonces qué
// trajo. Se calcula en el momento (sin tabla propia), así que no puede quedar
// desactualizado respecto de lo que dice la base.

import type { Db } from "@paperclipai/db";
import { sql } from "drizzle-orm";

export type Fuente = "meta_ads" | "google_ads" | "organico";
export type EstadoFuente = "sin_conexion" | "fallando" | "sin_entrega" | "atrasada" | "ok";

export interface SaludFuente {
  clientId: string;
  cliente: string;
  fuente: Fuente;
  estado: EstadoFuente;
  /** YYYY-MM-DD: último día con datos (pauta) o último post publicado (orgánico). */
  ultimoDato: string | null;
  /** ISO: último sync que terminó bien para esta fuente. */
  ultimaCorridaOk: string | null;
  /** Corridas fallidas consecutivas, las más recientes (peor cuenta del cliente). */
  fallasSeguidas: number;
  /** ISO: primera de esas fallas consecutivas. */
  fallandoDesde: string | null;
  ultimoError: string | null;
  /** Una frase para una persona. */
  detalle: string;
}

/** Una corrida del sync de una cuenta, vista desde una fuente. */
export interface Corrida {
  ok: boolean;
  /** ISO */
  at: string;
  error: string | null;
}

export interface HechosFuente {
  fuente: Fuente;
  /** Hay cuenta mapeada con credencial (y, para orgánico, con página). */
  conectada: boolean;
  /** Corridas por cuenta, la más reciente primero. */
  cuentas: Array<{ cuenta: string; corridas: Corrida[] }>;
  /** YYYY-MM-DD */
  ultimoDato: string | null;
  /** Orgánico: ISO de la última vez que se refrescaron métricas. Es el efecto
   *  real del sync: la fecha de los posts no se actualiza nunca porque el
   *  insert ignora los repetidos. */
  ultimoRefresco?: string | null;
}

// El sync corre una vez por día; 36 h deja margen para un día movido sin
// confundirlo con "no corrió".
export const HORAS_SIN_CORRIDA = 36;
// Pauta: el día de hoy está a medio sincronizar y ayer puede tardar; 3 días sin
// filas con el sync andando ya es "no hubo entrega".
export const DIAS_SIN_DATO_PAUTA = 3;
// Orgánico: un mes sin publicar es la señal, no una semana floja.
export const DIAS_SIN_POST = 30;

const HORA = 3600_000;
const DIA = 24 * HORA;

function fechaCorta(iso: string): string {
  // DD/MM, que es como lo lee el equipo.
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function errorCorto(e: string | null): string | null {
  if (!e) return null;
  const plano = e.replace(/\s+/g, " ").trim();
  // Meta y Google entierran el motivo en un JSON: se rescata el "message" y,
  // si hay, el código HTTP del principio ("→ 403"), que es lo que se busca.
  const msg = plano.match(/"message"\s*:\s*"([^"]+)"/)?.[1];
  const http = plano.match(/→\s*(\d{3})/)?.[1];
  if (msg) return (http ? `${http}: ${msg}` : msg).slice(0, 160);
  return plano.slice(0, 160);
}

const NOMBRE: Record<Fuente, string> = {
  meta_ads: "Meta",
  google_ads: "Google Ads",
  organico: "orgánico",
};

/**
 * Decide el estado de una fuente a partir de los hechos. Pura: todo lo que
 * depende del reloj entra por `ahora`.
 */
export function estadoFuente(
  h: HechosFuente,
  ahora: Date,
): Omit<SaludFuente, "clientId" | "cliente" | "fuente"> {
  const base = { ultimoDato: h.ultimoDato, ultimaCorridaOk: null as string | null, fallasSeguidas: 0, fallandoDesde: null as string | null, ultimoError: null as string | null };

  if (!h.conectada) {
    const detalle = h.fuente === "organico"
      ? "No tiene página de Facebook/Instagram asociada."
      : `No tiene cuenta de ${NOMBRE[h.fuente]} conectada.`;
    return { ...base, estado: "sin_conexion", detalle };
  }

  // Última corrida buena entre todas las cuentas.
  let ultimaOk: string | null = null;
  for (const c of h.cuentas) {
    const ok = c.corridas.find((r) => r.ok);
    if (ok && (!ultimaOk || ok.at > ultimaOk)) ultimaOk = ok.at;
  }
  base.ultimaCorridaOk = ultimaOk;

  // Fallando: la corrida más reciente de alguna cuenta falló. Se reporta la
  // peor cuenta (la que más corridas seguidas lleva fallando).
  let peor: { n: number; desde: string; error: string | null } | null = null;
  for (const c of h.cuentas) {
    let n = 0;
    while (n < c.corridas.length && !c.corridas[n].ok) n++;
    if (n > 0 && (!peor || n > peor.n)) {
      peor = { n, desde: c.corridas[n - 1].at, error: c.corridas[0].error };
    }
  }
  if (peor) {
    const ult = h.ultimoDato ? ` Último dato: ${fechaCorta(h.ultimoDato)}.` : "";
    const err = errorCorto(peor.error);
    return {
      ...base,
      estado: "fallando",
      fallasSeguidas: peor.n,
      fallandoDesde: peor.desde,
      ultimoError: err,
      detalle: `El sync de ${NOMBRE[h.fuente]} falla hace ${peor.n} ${peor.n === 1 ? "corrida" : "corridas seguidas"} (desde el ${fechaCorta(peor.desde)})${err ? `: ${err.replace(/\.$/, "")}.` : "."}${ult}`,
    };
  }

  // Atrasada: hay conexión y nada falla, pero el efecto no llega. En pauta, que
  // el sync no haya corrido bien hace rato; en orgánico, que no se refresquen
  // las métricas (eso es lo que el sync hace de verdad en cada corrida).
  const refresco = h.fuente === "organico" ? (h.ultimoRefresco ?? null) : ultimaOk;
  const sinRefresco = !refresco || ahora.getTime() - Date.parse(refresco) > HORAS_SIN_CORRIDA * HORA;
  if (sinRefresco && !(h.fuente === "organico" && !h.ultimoDato)) {
    let detalle: string;
    if (h.fuente === "organico") {
      const post = h.ultimoDato ? ` Último post registrado: ${fechaCorta(h.ultimoDato)}.` : "";
      detalle = refresco
        ? `Las métricas de la página no se actualizan desde el ${fechaCorta(refresco)}.${post}`
        : `Las métricas de la página nunca se sincronizaron.${post}`;
    } else {
      detalle = refresco
        ? `El sync de ${NOMBRE[h.fuente]} no termina bien desde el ${fechaCorta(refresco)}.`
        : `El sync de ${NOMBRE[h.fuente]} nunca terminó bien.`;
    }
    return { ...base, estado: "atrasada", detalle };
  }

  // Sin entrega: el sync anda pero no trae datos nuevos. No es una falla.
  const umbral = h.fuente === "organico" ? DIAS_SIN_POST : DIAS_SIN_DATO_PAUTA;
  const viejo = !h.ultimoDato || ahora.getTime() - Date.parse(`${h.ultimoDato}T00:00:00Z`) > umbral * DIA;
  if (viejo) {
    let detalle: string;
    if (h.fuente === "organico") {
      detalle = h.ultimoDato
        ? `La página no publica desde el ${fechaCorta(h.ultimoDato)}.`
        : "La página no tiene publicaciones sincronizadas.";
    } else {
      detalle = h.ultimoDato
        ? `El sync anda, pero no hay entrega desde el ${fechaCorta(h.ultimoDato)} (pauta pausada o sin saldo).`
        : "El sync anda, pero la cuenta nunca tuvo entrega registrada.";
    }
    return { ...base, estado: "sin_entrega", detalle };
  }

  return { ...base, estado: "ok", detalle: `Al día (último dato: ${fechaCorta(h.ultimoDato!)}).` };
}

type Fila = Record<string, unknown>;
function filas(r: unknown): Fila[] {
  // postgres.js devuelve el array; node-postgres, { rows }.
  return (Array.isArray(r) ? r : ((r as { rows?: Fila[] })?.rows ?? [])) as Fila[];
}
const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string | Date).toISOString());

/**
 * Salud de las fuentes de los clientes activos (o de uno solo). Solo lectura.
 */
export async function saludFuentes(db: Db, opts: { clientId?: string } = {}): Promise<SaludFuente[]> {
  const soloCliente = opts.clientId ? sql`and c.id = ${opts.clientId}` : sql``;
  const ahora = new Date();

  const [clientes, mappings, logs, pauta, organico] = await Promise.all([
    db.execute(sql`select c.id, trim(c.name) as nombre from clients c where c.status = 'active' ${soloCliente} order by 2`),
    db.execute(sql`
      select m.client_id, m.platform, m.ad_account_id, m.page_id
      from ads_account_mappings m join clients c on c.id = m.client_id
      where c.status = 'active' and m.connection_id is not null ${soloCliente}`),
    // Últimas 30 corridas por cuenta en 60 días: alcanza para contar fallas
    // seguidas sin traer todo el historial.
    db.execute(sql`
      select client_id, platform, cuenta, ok, at, error, err_organico from (
        select s.client_id, s.platform, s.metadata->>'adAccountId' as cuenta,
               s.status = 'completed' as ok, s.completed_at as at, s.error,
               s.metadata->'partesFallidas'->>'organico' as err_organico,
               row_number() over (partition by s.client_id, s.platform, s.metadata->>'adAccountId'
                                  order by s.completed_at desc) as rn
        from sync_logs s join clients c on c.id = s.client_id
        where s.job_name = 'ads-autosync' and s.completed_at > now() - interval '60 days'
          and c.status = 'active' ${soloCliente}
      ) t where rn <= 30
      order by client_id, platform, cuenta, at desc`),
    db.execute(sql`
      select i.client_id, i.platform, to_char(max(i.date), 'YYYY-MM-DD') as ultimo
      from ads_insights i join clients c on c.id = i.client_id
      where c.status = 'active' ${soloCliente}
      group by 1, 2`),
    db.execute(sql`
      select p.client_id,
             to_char(max(p.created_time), 'YYYY-MM-DD') as ultimo_post,
             max(oi.synced_at) as ultimo_refresco
      from organic_posts p
      join clients c on c.id = p.client_id
      left join organic_post_insights oi on oi.post_id = p.id
      where c.status = 'active' ${soloCliente}
      group by 1`),
  ]);

  const map = filas(mappings);
  const ultimoPauta = new Map(filas(pauta).map((r) => [`${r.client_id}|${r.platform}`, (r.ultimo as string) ?? null]));
  const org = new Map(filas(organico).map((r) => [r.client_id as string, r]));

  // Corridas por cliente|plataforma|cuenta, ya ordenadas de la más reciente.
  const corridas = new Map<string, Array<Corrida & { errOrganico: string | null }>>();
  for (const r of filas(logs)) {
    const k = `${r.client_id}|${r.platform}|${r.cuenta ?? ""}`;
    if (!corridas.has(k)) corridas.set(k, []);
    corridas.get(k)!.push({ ok: r.ok === true, at: iso(r.at)!, error: (r.error as string) ?? null, errOrganico: (r.err_organico as string) ?? null });
  }

  const out: SaludFuente[] = [];
  for (const c of filas(clientes)) {
    const clientId = c.id as string;
    const cliente = c.nombre as string;
    for (const fuente of ["meta_ads", "google_ads", "organico"] as Fuente[]) {
      const plataforma = fuente === "google_ads" ? "google" : "meta";
      const cuentasM = map.filter((m) => m.client_id === clientId && m.platform === plataforma
        && (fuente !== "organico" || m.page_id != null));
      const cuentas = cuentasM.map((m) => {
        const cs = corridas.get(`${clientId}|${plataforma}|${m.ad_account_id}`) ?? [];
        return {
          cuenta: m.ad_account_id as string,
          corridas: fuente === "organico"
            // Para el orgánico, una corrida cuenta como buena solo si el sync
            // de la cuenta terminó Y la parte orgánica no anotó error.
            ? cs.map((r) => ({
                ok: r.ok && !r.errOrganico,
                at: r.at,
                // Se acorta acá para que el "antes del orgánico" no se pierda
                // cuando errorCorto rescata el mensaje del JSON.
                error: r.errOrganico ?? (r.ok ? null : `no llegó a correr, falló antes el sync de la cuenta (${errorCorto(r.error) ?? "sin detalle"})`),
              }))
            : cs.map(({ ok, at, error }) => ({ ok, at, error })),
        };
      });
      const o = org.get(clientId);
      const hechos: HechosFuente = {
        fuente,
        conectada: cuentasM.length > 0,
        cuentas,
        ultimoDato: fuente === "organico" ? ((o?.ultimo_post as string) ?? null) : (ultimoPauta.get(`${clientId}|${plataforma}`) ?? null),
        ultimoRefresco: fuente === "organico" ? iso(o?.ultimo_refresco) : undefined,
      };
      out.push({ clientId, cliente, fuente, ...estadoFuente(hechos, ahora) });
    }
  }
  return out;
}
