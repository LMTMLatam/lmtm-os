// LMTM-OS: auditoría de keywords de Google Ads (pedido 18/8).
//
// QUÉ HACE
// Lee el informe de términos de búsqueda —lo que la gente REALMENTE escribió en
// Google antes de que se le mostrara el anuncio— y lo cruza con las keywords
// activas. De ahí salen cuatro cosas concretas:
//
//   1. Negativas: términos que gastaron plata y no trajeron una sola conversión.
//   2. Keywords nuevas: búsquedas que SÍ convirtieron y todavía no son keyword.
//   3. Keywords a pausar: keywords que gastan sin convertir.
//   4. Concordancia: keywords en amplia que se comen el presupuesto.
//
// NO TOCA LA CUENTA. Devuelve una lista de pasos para que el equipo la aplique.
// Es la misma regla que el resto del sistema: nada se ejecuta sin que una
// persona lo apruebe. Además, agregar una negativa mal puesta apaga tráfico
// bueno y eso no se recupera.
//
// El texto que se le entrega al equipo es un PASO A PASO, no una tabla de datos
// (pedido explícito del usuario 18/8: "que deriven cosas al equipo, específicas
// y derechas, no con datos, con guías paso a paso").

import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsConnections, clients, competitors, webRanking } from "@paperclipai/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { searchStream } from "./ads/providers/google.js";
import { withFreshAccessToken } from "./ads/token-refresh.js";
import { cruzarConBusquedas, loCubre, palabrasClave, terminosDeLaCompetencia, websDeCompetidores, type TerminoCompetencia } from "./competencia-web.js";
import { conversionesDudosas } from "../metricas/index.js";
import { hostDe } from "./google-web.js";
import { issueService } from "./issues.js";
import { resolveCompanyId } from "./intel-common.js";

/** Google devuelve la plata en micros: 1.000.000 micros = 1 unidad de moneda. */
const MICROS = 1_000_000;

/** Gasto mínimo para proponer una negativa. Debajo de esto el término no llegó
 *  a costar nada y bloquearlo es ruido — o peor, apaga una búsqueda que recién
 *  empieza a aprender. */
const GASTO_MIN_NEGATIVA = 3000;

/** Clics mínimos para afirmar que un término "no convierte". Con 2 clics no se
 *  sabe nada; es la diferencia entre una decisión y una corazonada. */
const CLICS_MIN = 8;

export interface TerminoBusqueda {
  termino: string;
  keyword: string | null;
  campana: string;
  /** Para agregar la negativa en ESA campaña. */
  campaignId: string;
  /** Para sumarlo como keyword en el grupo donde convirtió. */
  adGroupId: string;
  clics: number;
  impresiones: number;
  costo: number;
  conversiones: number;
}

export interface KeywordActiva {
  texto: string;
  concordancia: string;
  campana: string;
  clics: number;
  costo: number;
  conversiones: number;
  qualityScore: number | null;
}

export interface AuditoriaKeywords {
  cliente: string;
  cuenta: string;
  desde: string;
  /** Ventana analizada, en días. */
  dias: number;
  terminos: number;
  /** Clics de todos los términos: con las conversiones da la tasa de la cuenta. */
  clicsTotal: number;
  gastoTotal: number;
  conversionesTotal: number;
  negativas: TerminoBusqueda[];
  nuevas: TerminoBusqueda[];
  pausar: KeywordActiva[];
  ampliaCara: KeywordActiva[];
  /** Plata que se libera si se aplican las negativas propuestas. */
  ahorroMensual: number;
  /** Gasto en búsquedas DE MARCA que no registraron conversión. No es
   *  desperdicio: es la medida de cuánto no está viendo el píxel. */
  gastoMarcaSinConversion: number;
  cruceSeo: CruceSeo;
}

/**
 * Search Console y Google Ads, cada uno con lo que el otro no sabe (pedido de Marcos 23/11:
 * «que el SEO y las palabras clave de Google Ads se nutran entre sí»). Search Console sabe
 * qué busca la gente que encuentra la web gratis; Google Ads, qué búsqueda termina en consulta.
 */
export interface CruceSeo {
  /** false = el cliente no tiene búsquedas de Search Console: no hay con qué cruzar. */
  conSearchConsole: boolean;
  /** SEO → Ads: búsquedas con demanda donde la web sale abajo y ninguna keyword las cubre. */
  paraAds: Array<{ consulta: string; impresiones: number; posicion: number; pagina: string | null }>;
  /** Ads → SEO: búsquedas pagas que convierten y la web no aparece en la primera página. */
  paraSeo: Array<{ termino: string; conversiones: number; costo: number; posicion: number | null }>;
  /** Competencia → pauta y SEO: términos que repiten varios competidores en su web (competencia-web.ts) y el
   *  cliente no cubre con ninguna keyword ni tiene en la primera página. */
  deCompetencia: Array<{ termino: string; competidores: number; hosts: string[] }>;
}

/** Impresiones en 28 días para proponer una búsqueda como keyword: debajo es ruido. */
const IMPRESIONES_MIN_CRUCE = 50;
// shortcut: lista fija de portales vistos en las cuentas (23/11); si una cuenta compra otro, sumarlo acá.
const PORTALES = ["zonaprop", "argenprop", "mercadolibre", "properati", "booking", "despegar", "tripadvisor", "airbnb"];

const palabrasDe = (s: string) => normalizar(s).split(/[^a-z0-9]+/).filter((p) => p.length >= 3);

/** Puro. `consultas` son las filas de web_ranking tipo «consulta» (una por búsqueda y página). */
export function cruzarSeoConAds(
  consultas: Array<{ clave: string; detalle: string | null; posicion: number | null; impresiones: number | null }>,
  terminos: Array<Pick<TerminoBusqueda, "termino" | "conversiones" | "costo">>,
  keywords: Array<Pick<KeywordActiva, "texto">>,
  esMarca: (s: string) => boolean,
  competencia: TerminoCompetencia[] = [],
  /** El término nombra a un competidor o a un portal: en orgánico no se posiciona el nombre de otro. */
  otraMarca: (s: string) => boolean = () => false,
): CruceSeo {
  // Lo cubre la pauta si una keyword entra entera en el término (en frase o amplia se muestra) o si ya
  // se le mostró un anuncio a una búsqueda que lo trae.
  const kwsRaiz = keywords.map((k) => palabrasClave(k.texto)).filter((p) => p.length > 0);
  const buscado = terminos.map((t) => t.termino);
  const enPauta = (t: TerminoCompetencia) => kwsRaiz.some((kw) => kw.every((p) => t.palabras.includes(p))) || loCubre(t, buscado);
  const deCompetencia = cruzarConBusquedas(competencia, consultas)
    .filter((t, i) => (t.posicionDelCliente == null || t.posicionDelCliente > 10) && !esMarca(t.termino) && !enPauta(competencia[i]))
    .map((t) => ({ termino: t.termino, competidores: t.competidores, hosts: t.hosts }))
    .slice(0, 10);

  // Una búsqueda puede rankear con varias páginas: vale la que más se mostró.
  const organico = new Map<string, { consulta: string; impresiones: number; posicion: number; pagina: string | null; tope: number }>();
  for (const c of consultas) {
    if (c.posicion == null) continue;
    const k = normalizar(c.clave);
    const x = organico.get(k) ?? { consulta: c.clave, impresiones: 0, posicion: c.posicion, pagina: c.detalle, tope: -1 };
    if ((c.impresiones ?? 0) > x.tope) { x.tope = c.impresiones ?? 0; x.posicion = c.posicion; x.pagina = c.detalle; }
    x.impresiones += c.impresiones ?? 0;
    organico.set(k, x);
  }
  if (organico.size === 0) return { conSearchConsole: false, paraAds: [], paraSeo: [], deCompetencia };

  // En frase o en amplia, una keyword cubre toda búsqueda que traiga sus palabras.
  const kws = keywords.map((k) => palabrasDe(k.texto)).filter((p) => p.length > 0);
  const yaSeMuestra = new Set(terminos.map((t) => normalizar(t.termino)));
  const paraAds = [...organico.entries()]
    .filter(([k, o]) => {
      // Menos de 4 letras («ma», 613 impresiones en MA PROPIEDADES) no dice qué se busca.
      if (o.impresiones < IMPRESIONES_MIN_CRUCE || o.posicion <= 5 || k.length < 4 || esMarca(o.consulta) || yaSeMuestra.has(k)) return false;
      const palabras = new Set(palabrasDe(o.consulta));
      return !kws.some((kw) => kw.every((p) => palabras.has(p)));
    })
    .map(([, o]) => ({ consulta: o.consulta, impresiones: o.impresiones, posicion: o.posicion, pagina: o.pagina }))
    .sort((a, b) => b.impresiones - a.impresiones)
    .slice(0, 12);

  // El mismo término sale una vez por campaña y grupo: se suma.
  const pagos = new Map<string, { termino: string; conversiones: number; costo: number }>();
  for (const t of terminos) {
    const k = normalizar(t.termino);
    const x = pagos.get(k) ?? { termino: t.termino, conversiones: 0, costo: 0 };
    x.conversiones += t.conversiones;
    x.costo += t.costo;
    pagos.set(k, x);
  }
  const paraSeo = [...pagos.entries()]
    .filter(([k, t]) => t.conversiones >= 1 && !esMarca(t.termino) && !otraMarca(t.termino) && (organico.get(k)?.posicion ?? 99) > 10)
    .map(([k, t]) => ({ termino: t.termino, conversiones: Math.round(t.conversiones * 10) / 10, costo: Math.round(t.costo), posicion: organico.get(k)?.posicion ?? null }))
    .sort((a, b) => b.conversiones - a.conversiones)
    .slice(0, 12);

  return { conSearchConsole: true, paraAds, paraSeo, deCompetencia };
}

/** Minúsculas y sin acentos, para comparar términos con el nombre del cliente. */
const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/**
 * ¿El término de búsqueda nombra a la propia marca?
 *
 * Se compara contra las palabras del nombre del cliente de 4 letras o más: las
 * cortas ("de", "sa", "srl") aparecen en cualquier búsqueda y darían falsos
 * positivos que esconderían desperdicio real.
 */
export function esTerminoDeMarca(nombreCliente: string, termino: string, variantes: string[] = []): boolean {
  // Palabras del rubro que vienen en el nombre pero no son la marca (12/11:
  // «propiedades» hacía marca de COSA a «espora propiedades», y «grupo» a
  // cualquier búsqueda de grupos).
  const nombre = normalizar(nombreCliente);
  const propias = nombre.split(/\s+/).filter((p) => p.length >= 4 && !PALABRAS_GENERICAS.has(p));
  // Si el nombre es todo palabras del rubro, la marca es el nombre entero.
  const tokens = [...(propias.length ? propias : [nombre.replace(/[^a-z0-9]/g, "")].filter((x) => x.length >= 4)), ...variantes.map(normalizar)];
  if (tokens.length === 0) return false;
  const t = normalizar(termino);
  // También sin espacios: "distri llantas" es la marca Distrillantas escrita
  // separada, y la auditoría la proponía como negativa (13/10).
  const junto = t.replace(/[^a-z0-9]/g, "");
  return tokens.some((tok) => t.includes(tok) || junto.includes(tok));
}

const PALABRAS_GENERICAS = new Set([
  "propiedades", "inmobiliaria", "grupo", "hotel", "apart", "desarrollos", "global", "industrial", "materiales",
  "agencia", "construcciones", "servicios", "soluciones", "argentina", "latam",
]);

/** Variantes de la marca cargadas a mano (clients.metadata.marcaVariantes): la
 *  marca mal escrita («imbelt» para INBELT) también es marca. */
export function variantesDeMarca(metadata: unknown): string[] {
  const v = (metadata as { marcaVariantes?: unknown } | null)?.marcaVariantes;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length >= 4) : [];
}

/**
 * ¿La CAMPAÑA es de marca? Por el nombre de la campaña, no por el del cliente:
 * casi todas las campañas llevan el nombre del cliente («Search Inbelt
 * refurbished» compra búsquedas genéricas y figuraba como de marca, 12/11). Es
 * de marca si lo dice («brand», «branding», «marca», «institucional») o si se
 * llama solo como el cliente.
 */
export function esCampanaDeMarca(nombreCliente: string, nombreCampana: string): boolean {
  const c = normalizar(nombreCampana);
  if (/\b(brand|branding|marca|institucional)\b/.test(c)) return true;
  const sinRuido = c.replace(/\b(search|busqueda|lmtm|google|ads|meta|n\d+|#\d+|\d{4})\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  return sinRuido.length > 0 && sinRuido === normalizar(nombreCliente).replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Google devuelve una fila por término Y por keyword que lo activó: «inmobiliaria rosario» salía 5 veces en la
 * misma lista (MA PROPIEDADES 23/11) y un término partido en filas chicas no llegaba al piso de las negativas.
 * Se suma por término dentro de su grupo de anuncios; queda la keyword que más gastó. Puro.
 */
export function sumarTerminos(filas: TerminoBusqueda[]): TerminoBusqueda[] {
  const m = new Map<string, { t: TerminoBusqueda; tope: number }>();
  for (const f of filas) {
    const k = `${normalizar(f.termino).replace(/\s+/g, " ")}|${f.campaignId}|${f.adGroupId}`;
    const x = m.get(k);
    if (!x) { m.set(k, { t: { ...f }, tope: f.costo }); continue; }
    x.t.clics += f.clics; x.t.impresiones += f.impresiones; x.t.costo += f.costo; x.t.conversiones += f.conversiones;
    if (f.costo > x.tope) { x.tope = f.costo; x.t.keyword = f.keyword; }
  }
  return [...m.values()].map((x) => x.t);
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown): string => (typeof v === "string" ? v : "");

function anidado(row: Record<string, unknown>, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), row);
}

/**
 * Conexión + customer id de Google del cliente, o null si no está mapeado.
 * Se refresca el access token antes de usarlo: la auditoría corre a demanda y
 * el token guardado suele estar vencido.
 */
async function conexionGoogle(db: Db, clientId: string) {
  // Un cliente puede tener varias cuentas de Google mapeadas. Antes se tomaba la
  // primera: en BOERO era la vacía y la auditoría decía «cuenta limpia» mientras
  // la otra gastaba $512.591 (12/11). Se usa la que más gastó en 30 días.
  const mapeos = await db.select()
    .from(adsAccountMappings)
    .where(and(eq(adsAccountMappings.clientId, clientId), eq(adsAccountMappings.platform, "google")));
  const gastos = await db.execute(sql`
    select regexp_replace(ad_account_id, '^act_|-', '', 'g') cuenta, sum(spend) gasto
    from ads_insights where client_id = ${clientId} and platform = 'google' and date >= current_date - 30
    group by 1`);
  const gastoDe = new Map(((Array.isArray(gastos) ? gastos : (gastos as { rows?: unknown[] }).rows ?? []) as Array<{ cuenta: string; gasto: string }>)
    .map((g) => [g.cuenta, Number(g.gasto)]));
  const [m] = [...mapeos].sort((a, b) =>
    (gastoDe.get(b.adAccountId.replace(/^act_|-/g, "")) ?? 0) - (gastoDe.get(a.adAccountId.replace(/^act_|-/g, "")) ?? 0));
  if (!m?.connectionId) return null;
  const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, m.connectionId));
  if (!conn) return null;
  // Se reusa el helper del aggregator en vez de refrescar a mano: además de
  // pedir el token nuevo, lo PERSISTE en la conexión. Refrescando por afuera se
  // obtenía un 401 (18/8) porque el objeto quedaba con el access token viejo.
  const fresca = await withFreshAccessToken(db, conn);
  // Si el refresh dejó la conexión marcada en error, no tiene sentido pegarle a
  // la API: devuelve un 401 que parece un problema de la cuenta y no lo es.
  const [estado] = await db.select({ status: adsConnections.status, lastError: adsConnections.lastError })
    .from(adsConnections).where(eq(adsConnections.id, conn.id));
  if (estado?.status === "error" && /refresh token ya no sirve/i.test(estado.lastError ?? "")) {
    throw new Error("La conexión de Google Ads está caída: hay que volver a autorizarla desde Integraciones. Hasta entonces no se puede auditar ninguna cuenta.");
  }
  return { conn: fresca, customerId: m.adAccountId.replace(/^act_/, "").replace(/-/g, "") };
}

/**
 * Corre la auditoría de una cuenta.
 *
 * `dias` mira hacia atrás: 30 es el default porque menos que eso no junta
 * conversiones suficientes para decidir, y más arrastra campañas ya cambiadas.
 */
export async function auditarKeywords(db: Db, clientId: string, dias = 30): Promise<AuditoriaKeywords | null> {
  const [cliente] = await db.select({ name: clients.name, metadata: clients.metadata }).from(clients).where(eq(clients.id, clientId));
  const ctx = await conexionGoogle(db, clientId);
  if (!cliente || !ctx) return null;
  const { conn, customerId } = ctx;
  const variantes = variantesDeMarca(cliente.metadata);

  // Hasta ayer: el día de hoy está a medio cargar.
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
  const hasta = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const rango = `segments.date BETWEEN '${desde}' AND '${hasta}'`;

  // searchStream ya resuelve developer-token, login-customer-id y el refresh
  // ante un 401 a mitad de job — no hay que repetir nada de eso acá.
  const filasTerminos = await searchStream(conn, customerId, `
    SELECT search_term_view.search_term, segments.keyword.info.text, campaign.id, campaign.name, ad_group.id,
           metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions
    FROM search_term_view
    WHERE ${rango} AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 500`);

  const filasKeywords = await searchStream(conn, customerId, `
    SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
           ad_group_criterion.quality_info.quality_score, campaign.name,
           metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM keyword_view
    WHERE ${rango} AND ad_group_criterion.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 300`);

  const terminos: TerminoBusqueda[] = sumarTerminos(filasTerminos.map((r) => ({
    termino: texto(anidado(r, "search_term_view.search_term")),
    keyword: texto(anidado(r, "segments.keyword.info.text")) || null,
    campana: texto(anidado(r, "campaign.name")),
    campaignId: String(anidado(r, "campaign.id") ?? ""),
    adGroupId: String(anidado(r, "ad_group.id") ?? ""),
    clics: num(anidado(r, "metrics.clicks")),
    impresiones: num(anidado(r, "metrics.impressions")),
    costo: num(anidado(r, "metrics.cost_micros")) / MICROS,
    conversiones: num(anidado(r, "metrics.conversions")),
  })).filter((t) => t.termino));

  const keywords: KeywordActiva[] = filasKeywords.map((r) => ({
    texto: texto(anidado(r, "ad_group_criterion.keyword.text")),
    concordancia: texto(anidado(r, "ad_group_criterion.keyword.match_type")),
    campana: texto(anidado(r, "campaign.name")),
    clics: num(anidado(r, "metrics.clicks")),
    costo: num(anidado(r, "metrics.cost_micros")) / MICROS,
    conversiones: num(anidado(r, "metrics.conversions")),
    qualityScore: anidado(r, "ad_group_criterion.quality_info.quality_score") != null
      ? num(anidado(r, "ad_group_criterion.quality_info.quality_score")) : null,
  })).filter((k) => k.texto);

  const gastoTotal = terminos.reduce((a, t) => a + t.costo, 0);
  const conversionesTotal = terminos.reduce((a, t) => a + t.conversiones, 0);
  const yaSonKeyword = new Set(keywords.map((k) => k.texto.toLowerCase().trim()));

  // Términos DE MARCA: el que busca "<cliente> <barrio>" ya te está buscando a
  // vos. Que no registren conversión casi nunca es desperdicio — la conversión
  // pasa por teléfono, WhatsApp o el mostrador y el píxel no la ve. Proponerlos
  // como negativas apaga el mejor tráfico de la cuenta.
  // Distrillantas, 3/9/26: la auditoría proponía negativizar "distrillantas
  // pilar", "distrillantas beiro", "distrillantas merlo", "distrillantas
  // liniers" y "distrillantas avellaneda" — todas con calidad 10/10 de Google.
  const esMarca = (s: string) => esTerminoDeMarca(cliente.name, s, variantes);
  // Nombres de otros clientes de la agencia: no se proponen como keyword nueva
  // (COSA tenía 6 inmobiliarias competidoras en «nuevas», una era DUNOD).
  const otros = (await db.select({ name: clients.name }).from(clients).where(ne(clients.id, clientId)))
    .map((c) => normalizar(c.name)).filter((n) => n.length >= 5);
  const nombraOtroCliente = (s: string) => { const t = normalizar(s); return otros.some((o) => t.includes(o)); };
  const gastoCampana = new Map<string, number>();
  for (const t of terminos) gastoCampana.set(t.campaignId, (gastoCampana.get(t.campaignId) ?? 0) + t.costo);

  // 1. Negativas: gastó, tuvo clics suficientes para juzgarlo, cero conversiones
  //    y NO es una búsqueda de marca. Además del piso fijo, un término que se
  //    lleva el 2% de su campaña sin convertir (el desperdicio repartido nunca
  //    llegaba a $3.000: ninguna de 8 cuentas daba negativas, 11/11).
  const negativas = terminos
    .filter((t) => t.conversiones === 0 && !esMarca(t.termino) && (
      (t.costo >= GASTO_MIN_NEGATIVA && t.clics >= CLICS_MIN) ||
      (t.clics >= 3 && (gastoCampana.get(t.campaignId) ?? 0) > 0 && t.costo / (gastoCampana.get(t.campaignId) ?? 1) >= 0.02)))
    .sort((a, b) => b.costo - a.costo)
    .slice(0, 15);

  // Lo que gastó la marca sin registrar conversión. No se propone tocarlo: se
  // informa, porque si el número es grande el problema es la MEDICIÓN, no las
  // keywords, y optimizar sobre datos ciegos rompe cuentas sanas.
  const gastoMarcaSinConversion = Math.round(
    terminos.filter((t) => esMarca(t.termino) && t.conversiones === 0).reduce((a, t) => a + t.costo, 0),
  );

  // 2. Keywords nuevas: convirtió y todavía no está como keyword propia. Es la
  //    plata más barata de la cuenta — ya sabés que ese término trae clientes.
  //    Con 2 conversiones o más (una sola es ruido), sin marca propia ni nombres
  //    de otros clientes.
  const nuevas = terminos
    .filter((t) => t.conversiones >= 2 && !yaSonKeyword.has(t.termino.toLowerCase().trim()) && !esMarca(t.termino) && !nombraOtroCliente(t.termino))
    .sort((a, b) => b.conversiones - a.conversiones)
    .slice(0, 12);

  // 3. Keywords que gastan sin convertir — sin las de marca, por lo mismo de arriba.
  const pausar = keywords
    .filter((k) => k.conversiones === 0 && k.costo >= GASTO_MIN_NEGATIVA && k.clics >= CLICS_MIN && !esMarca(k.texto))
    .sort((a, b) => b.costo - a.costo)
    .slice(0, 10);

  // 4. Concordancia amplia cara: la amplia trae volumen pero también basura.
  //    Si además no convierte, conviene bajarla a frase o exacta.
  const ampliaCara = keywords
    .filter((k) => /BROAD/i.test(k.concordancia) && k.costo >= GASTO_MIN_NEGATIVA * 2 && k.conversiones < 1)
    .sort((a, b) => b.costo - a.costo)
    .slice(0, 8);

  const consultas = await db
    .select({ clave: webRanking.clave, detalle: webRanking.detalle, posicion: webRanking.posicion, impresiones: webRanking.impresiones })
    .from(webRanking)
    .where(and(eq(webRanking.clientId, clientId), eq(webRanking.tipo, "consulta")));
  // Marcas ajenas: los portales y los competidores cargados, por su dominio y su usuario de Instagram
  // («uno propiedades» → uno-propiedades.com.ar). MA PROPIEDADES compra «zonaprop rosario» y «uno propiedades»:
  // convierten, pero proponerlas a Contenido como búsquedas para posicionar no tiene sentido.
  const comps = await db.select({ ig: competitors.igHandle, web: competitors.website }).from(competitors).where(eq(competitors.clientId, clientId));
  const pegado = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, "");
  const ajenas = [...PORTALES, ...comps.flatMap((c) => [hostDe(c.web)?.split(".")[0] ?? "", /^@?[\w.]+$/.test(c.ig ?? "") ? c.ig! : ""]).map(pegado)].filter((x) => x.length >= 4);
  const otraMarca = (s: string) => { const j = pegado(s); return ajenas.some((a) => j.includes(a)) || nombraOtroCliente(s); };

  return {
    cliente: cliente.name,
    cuenta: customerId,
    desde,
    dias,
    terminos: terminos.length,
    clicsTotal: terminos.reduce((a, t) => a + t.clics, 0),
    gastoTotal: Math.round(gastoTotal),
    conversionesTotal: Math.round(conversionesTotal * 10) / 10,
    negativas, nuevas, pausar, ampliaCara,
    ahorroMensual: Math.round(negativas.reduce((a, t) => a + t.costo, 0)),
    gastoMarcaSinConversion,
    cruceSeo: cruzarSeoConAds(consultas, terminos, keywords, esMarca, terminosDeLaCompetencia((await websDeCompetidores(db, clientId)).webs), otraMarca),
  };
}

/** Lo que el equipo tiene para hacer: las cuatro listas de la cuenta más las tres del cruce con la web y la competencia. */
const accionesDe = (a: AuditoriaKeywords) =>
  a.negativas.length + a.nuevas.length + a.pausar.length + a.ampliaCara.length + a.cruceSeo.paraAds.length + a.cruceSeo.paraSeo.length + a.cruceSeo.deCompetencia.length;

const plata = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
/** «162,6», «26»: Google reparte conversiones en fracciones y salía «162.563379 conversión(es)». */
const conv = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");

/**
 * La auditoría convertida en instrucciones que alguien pueda ejecutar sin
 * saber nada del contexto.
 *
 * A propósito NO es una tabla de métricas: el equipo no necesita saber que un
 * término tuvo 412 impresiones, necesita saber qué escribir y dónde. Los números
 * aparecen solo cuando justifican la decisión.
 */
export function auditoriaAPasos(a: AuditoriaKeywords): { titulo: string; cuerpo: string } {
  const p: string[] = [];

  p.push(`Auditoría de keywords de **${a.cliente}** — últimos ${a.dias} días (desde el ${a.desde}).`);
  p.push(`Se revisaron ${a.terminos} términos de búsqueda por ${plata(a.gastoTotal)} de inversión y ${a.conversionesTotal} conversiones.`);
  p.push("");

  // Conversiones que no son consultas (MA PROPIEDADES 23/11: 1.878 conversiones en 500 términos, con «first_visit»
  // marcada como conversión). La guía le decía al equipo «sumar 12 keywords que ya están convirtiendo» sobre eso.
  if (conversionesDudosas("google", a.conversionesTotal, a.clicsTotal)) {
    p.push(`> ⚠️ **Las conversiones de esta cuenta no son consultas:** Google cuenta ${conv(a.conversionesTotal)} conversiones en ${a.clicsTotal.toLocaleString("es-AR")} clics (${Math.round((a.conversionesTotal / a.clicsTotal) * 100)} %). Ninguna campaña convierte un tercio de sus clics: hay acciones marcadas como conversión principal que no son un contacto (primera visita, página vista). **Primero corregir las acciones de conversión** (Google Ads → Objetivos → Conversiones). Hasta entonces las listas de abajo sirven para ver qué se busca, no para decidir qué sumar ni qué pausar.`);
    p.push("");
  }

  // Si la marca gastó fuerte sin registrar una sola conversión, el problema no
  // son las keywords: es que no se está midiendo. Va ARRIBA de todo porque
  // aplicar el resto de la guía sobre datos ciegos hace daño.
  if (a.gastoMarcaSinConversion >= a.gastoTotal * 0.3 && a.gastoMarcaSinConversion > 0) {
    p.push(`> ⚠️ **Antes de tocar nada:** ${plata(a.gastoMarcaSinConversion)} de esta inversión son búsquedas de la propia marca que no registraron ni una conversión. Gente que ya te estaba buscando por nombre. Eso casi siempre significa que el seguimiento de conversiones está roto o incompleto —llamadas, WhatsApp y visitas al local no llegan al píxel—, no que el tráfico sea malo. **Revisar la medición primero**: optimizar con números ciegos apaga lo que funciona.`);
    p.push("");
  }

  let n = 0;
  if (a.negativas.length) {
    p.push(`### ${++n}. Sumar ${a.negativas.length} palabras clave negativas — libera ${plata(a.ahorroMensual)}/mes`);
    p.push("Estas búsquedas gastaron plata y no trajeron una sola conversión. En Google Ads: **Campañas → Palabras clave → Palabras clave negativas → +**, y agregar cada una en *concordancia de frase*:");
    p.push("");
    for (const t of a.negativas) p.push(`- \`${t.termino}\` — ${plata(t.costo)} en ${t.clics} clics, 0 conversiones (campaña ${t.campana})`);
    p.push("");
    p.push("Antes de agregarlas, leerlas una por una: si alguna describe algo que el cliente sí vende, NO agregarla — el término puede estar mal servido, no ser malo.");
    p.push("");
  }

  if (a.nuevas.length) {
    p.push(`### ${++n}. Sumar ${a.nuevas.length} keywords que ya están convirtiendo`);
    p.push("La gente buscó esto, convirtió, y todavía no lo tenemos como keyword propia — o sea que estamos pagando por ellas al precio de la concordancia amplia en vez del suyo. Agregarlas en **concordancia de frase** al grupo de anuncios que mejor les calce:");
    p.push("");
    for (const t of a.nuevas) p.push(`- \`${t.termino}\` — ${conv(t.conversiones)} conversión(es) por ${plata(t.costo)} (campaña ${t.campana})`);
    p.push("");
  }

  if (a.pausar.length) {
    p.push(`### ${++n}. Pausar ${a.pausar.length} keywords que solo gastan`);
    p.push("Tienen clics suficientes para juzgarlas y ninguna conversión. Pausar (no borrar: el historial sirve):");
    p.push("");
    for (const k of a.pausar) {
      const qs = k.qualityScore != null ? `, calidad ${k.qualityScore}/10` : "";
      p.push(`- \`${k.texto}\` [${k.concordancia}] — ${plata(k.costo)} en ${k.clics} clics${qs} (campaña ${k.campana})`);
    }
    p.push("");
  }

  if (a.ampliaCara.length) {
    p.push(`### ${++n}. Bajar ${a.ampliaCara.length} keywords de amplia a frase`);
    p.push("Están en concordancia amplia, se llevan una parte grande del presupuesto y no convierten. La amplia trae volumen pero también búsquedas que no tienen nada que ver:");
    p.push("");
    for (const k of a.ampliaCara) p.push(`- \`${k.texto}\` — ${plata(k.costo)} sin conversiones (campaña ${k.campana})`);
    p.push("");
  }

  const num1 = (x: number) => x.toFixed(1).replace(".", ",");
  if (a.cruceSeo.paraAds.length) {
    p.push(`### ${++n}. Probar ${a.cruceSeo.paraAds.length} búsquedas que ya trae la web (Search Console)`);
    p.push("La gente busca esto en Google, la web aparece pero abajo, y ninguna keyword lo cubre. Sumarlas en **concordancia de frase** al grupo de anuncios que corresponda, con presupuesto acotado, y mirar en 2 semanas si convierten:");
    p.push("");
    for (const c of a.cruceSeo.paraAds) p.push(`- \`${c.consulta}\` — ${c.impresiones} impresiones en 28 días, la web sale en la posición ${num1(c.posicion)}`);
    p.push("");
    p.push("Leerlas antes: Search Console también trae búsquedas informativas (cómo, qué es) que no compran. Esas van a contenido, no a pauta.");
    p.push("");
  }

  if (a.cruceSeo.paraSeo.length) {
    p.push(`### ${++n}. Pasar a Contenido y Web: ${a.cruceSeo.paraSeo.length} búsquedas que hoy solo llegan pagando`);
    p.push("Estas búsquedas convierten en Google Ads y la web no aparece en la primera página de Google. Una página o una nota que responda cada una; cuando posicione, ese clic deja de costar:");
    p.push("");
    for (const t of a.cruceSeo.paraSeo) {
      p.push(`- \`${t.termino}\` — ${conv(t.conversiones)} conversión(es) por ${plata(t.costo)}; en orgánico ${t.posicion != null ? `posición ${num1(t.posicion)}` : "no aparece entre las búsquedas de la web"}`);
    }
    p.push("");
  }

  if (a.cruceSeo.deCompetencia.length) {
    p.push(`### ${++n}. Mirar ${a.cruceSeo.deCompetencia.length === 1 ? "1 término" : `${a.cruceSeo.deCompetencia.length} términos`} que trabaja la competencia y no cubrimos`);
    p.push("Los repiten varios competidores en el título o los encabezados de su web, ninguna keyword nuestra los cubre y la web no aparece en la primera página con ellos. No dice cuánto se buscan: mirar el volumen en el Planificador de palabras clave antes de sumarlos, y pasarle los que sirvan a Contenido y Web:");
    p.push("");
    for (const t of a.cruceSeo.deCompetencia) p.push(`- \`${t.termino}\` — ${t.competidores} competidores (${t.hosts.slice(0, 3).join(", ")})`);
    p.push("");
  }

  if (!a.cruceSeo.conSearchConsole) {
    p.push("_Sin Search Console vinculado: no se pudo cruzar con las búsquedas orgánicas de la web. Se vincula en la ficha del cliente → Web._");
    p.push("");
  }

  if (accionesDe(a) === 0) {
    p.push("**Sin acciones para esta cuenta.** No hay términos que gasten sin convertir por encima del piso, ni búsquedas convertidoras sin keyword. La cuenta está limpia en este período.");
  }

  return {
    titulo: `[${a.cliente}] Optimización de keywords Google Ads — ${accionesDe(a)} acciones`,
    cuerpo: p.join("\n"),
  };
}

/**
 * Corre la auditoría y deja la guía como tarea del equipo.
 *
 * Va como tarea INTERNA (status todo), no como propuesta al cliente: al cliente
 * no le sirve una lista de negativas, es trabajo de la agencia. Esa distinción
 * es la que faltaba — el panel del cliente venía juntando cosas que en realidad
 * eran del equipo.
 */
export async function auditarYDerivar(
  db: Db,
  clientId: string,
  dias = 30,
): Promise<{ ok: boolean; acciones: number; issueId?: string; motivo?: string }> {
  const a = await auditarKeywords(db, clientId, dias);
  if (!a) return { ok: false, acciones: 0, motivo: "el cliente no tiene Google Ads mapeado" };
  const acciones = accionesDe(a);
  if (acciones === 0) return { ok: true, acciones: 0, motivo: "la cuenta está limpia en este período" };

  const { titulo, cuerpo } = auditoriaAPasos(a);
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { ok: false, acciones, motivo: "no se pudo resolver la empresa" };

  const creado = await issueService(db).create(companyId, {
    title: titulo,
    description: cuerpo,
    status: "todo" as never,
    priority: (a.ahorroMensual > 50_000 ? "high" : "medium") as never,
    clientId,
    originKind: "agent_detected",
    createdByAgentId: null,
  } as never);
  return { ok: true, acciones, issueId: String((creado as Record<string, unknown>).id ?? "") };
}
