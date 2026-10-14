// LMTM-OS: Google Search Console y Google Analytics 4 por cliente (pedido 13/10:
// "agregar una integración con Google Search Console y Google Analytics").
//
// CÓMO ENTRA
// Una persona del equipo aprieta "Conectar" en Integraciones y le da permiso de
// LECTURA a una cuenta de Google que ya tenga acceso a las propiedades de los
// clientes. Se usa el mismo cliente OAuth y la misma vuelta que Google Ads
// (state.platform = "google_web"); el permiso queda en google_web_conexiones.
//
// CÓMO SE SABE QUÉ ES DE QUIÉN
// Por la web cargada en Marca: el sitio de Search Console y la propiedad de GA4
// (por la URL de su flujo web) cuyo dominio es EXACTAMENTE el de la web. Un
// subdominio no alcanza (CHARLOTT tiene de web crm.lmtmas.com: el dominio
// lmtmas.com es de la agencia). Si hay más de una propiedad de GA4 con esa web
// no se elige ninguna. Lo que elige una persona en la ficha no se pisa.
//
// QUÉ SE GUARDA
// web_diario (90 días por día, las dos fuentes en la misma fila, null = esa
// fuente no informó) y web_ranking (28 días: búsquedas con su página, páginas,
// canales, landings, fuentes y eventos). Solo lectura: no se toca nada en Google.
//
// DÍAS INCOMPLETOS
// Search Console publica el dato final con 2-3 días de atraso y GA4 puede
// seguir procesando ayer. Todo lo que compara o decide usa ventanas que
// terminan en hoy-3 (Search Console) y hoy-2 (Analytics). Ver lmtm-os-dia-parcial.

import type { Db } from "@paperclipai/db";
import { clients, googleWebConexiones, webDiario, webPropiedades, webRanking } from "@paperclipai/db";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { diaLocal } from "../avisos/politica.js";

export const SCOPES_WEB = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

const DIA = 86_400_000;
export const sumarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);

/** Último día completo de cada fuente, en Buenos Aires. */
export function ultimoDiaCompleto(fuente: "gsc" | "ga", ahora = new Date()): string {
  return sumarDias(diaLocal(ahora), fuente === "gsc" ? -3 : -2);
}

// ── Emparejar por dominio (puro) ─────────────────────────────────────────

/** El dominio de una URL, sin "www.". null si no es una URL. */
export function hostDe(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  if (u.startsWith("sc-domain:")) return u.slice(10).toLowerCase().replace(/^www\./, "") || null;
  try {
    return new URL(/^[a-z]+:\/\//i.test(u) ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export interface SitioGsc { sitio: string; permiso: string; conexionId: string }
export interface PropiedadGa { propiedad: string; nombre: string; cuenta: string; hosts: string[]; conexionId: string }

/**
 * El sitio de Search Console de una web: mismo dominio exacto. Entre varios,
 * la propiedad de dominio gana a la de prefijo y https a http. Sin permiso
 * verificado no hay datos: no cuenta.
 */
export function elegirSitio(web: string | null, sitios: SitioGsc[]): SitioGsc | null {
  const h = hostDe(web);
  if (!h) return null;
  const candidatos = sitios.filter((s) => s.permiso !== "siteUnverifiedUser" && hostDe(s.sitio) === h);
  const puntaje = (s: SitioGsc) => (s.sitio.startsWith("sc-domain:") ? 2 : s.sitio.startsWith("https://") ? 1 : 0);
  return candidatos.sort((a, b) => puntaje(b) - puntaje(a))[0] ?? null;
}

/** La propiedad de GA4 de una web: la única con un flujo web de ese dominio. Si hay varias, ninguna. */
export function elegirPropiedad(web: string | null, propiedades: PropiedadGa[]): { elegida: PropiedadGa | null; candidatas: PropiedadGa[] } {
  const h = hostDe(web);
  if (!h) return { elegida: null, candidatas: [] };
  const vistas = new Map<string, PropiedadGa>();
  for (const p of propiedades) if (p.hosts.includes(h) && !vistas.has(p.propiedad)) vistas.set(p.propiedad, p);
  const candidatas = [...vistas.values()];
  return { elegida: candidatas.length === 1 ? candidatas[0] : null, candidatas };
}

// ── Google ───────────────────────────────────────────────────────────────

export class ErrorGoogle extends Error {
  constructor(message: string, readonly codigo: "api_apagada" | "sin_permiso" | "revocada" | "otro", readonly status?: number) {
    super(message);
  }
}

/** El mensaje de error de Google, en castellano y con el link si hay que habilitar una API. Puro. */
export function errorDeGoogle(status: number, cuerpo: string): ErrorGoogle {
  let j: { error?: { message?: string; status?: string; details?: Array<{ reason?: string; metadata?: Record<string, string> }> } } = {};
  try { j = JSON.parse(cuerpo); } catch { /* no es JSON */ }
  const det = j.error?.details?.find((d) => d.reason);
  if (det?.reason === "SERVICE_DISABLED") {
    const api = det.metadata?.serviceTitle ?? det.metadata?.service ?? "la API";
    const link = det.metadata?.activationUrl ?? "";
    return new ErrorGoogle(`${api} no está habilitada en el proyecto de Google Cloud. Habilitala acá: ${link}`.trim(), "api_apagada", status);
  }
  if (status === 403 || status === 401) {
    return new ErrorGoogle(`Google no da acceso: ${j.error?.message ?? cuerpo.slice(0, 160)}`, "sin_permiso", status);
  }
  return new ErrorGoogle(`Google respondió ${status}: ${j.error?.message ?? cuerpo.slice(0, 160)}`, "otro", status);
}

function credenciales() {
  const id = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const secreto = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  if (!id || !secreto) throw new Error("GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET no configurados.");
  return { id, secreto };
}

/** Canjea el código del consentimiento. Devuelve el refresh token y la cuenta (del id_token). */
export async function canjearCodigo(code: string, redirectUri: string): Promise<{ refreshToken: string | null; email: string | null; scopes: string[] }> {
  const { id, secreto } = credenciales();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secreto, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { refresh_token?: string; id_token?: string; scope?: string; error_description?: string; error?: string };
  if (!r.ok) throw new Error(`Google no aceptó el código: ${j.error_description ?? j.error ?? r.status}`);
  let email: string | null = null;
  try {
    email = (JSON.parse(Buffer.from((j.id_token ?? "").split(".")[1] ?? "", "base64url").toString()) as { email?: string }).email ?? null;
  } catch { /* sin id_token */ }
  return { refreshToken: j.refresh_token ?? null, email, scopes: (j.scope ?? "").split(" ").filter(Boolean) };
}

const tokens = new Map<string, { token: string; vence: number }>();

async function tokenDe(c: { id: string; refreshToken: string }): Promise<string> {
  const t = tokens.get(c.id);
  if (t && t.vence > Date.now() + 60_000) return t.token;
  const { id, secreto } = credenciales();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secreto, refresh_token: c.refreshToken, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) {
    if (j.error === "invalid_grant") throw new ErrorGoogle("Google revocó el permiso de esta cuenta: hay que volver a conectarla.", "revocada", r.status);
    throw new ErrorGoogle(`No se pudo renovar el acceso: ${j.error_description ?? j.error ?? r.status}`, "otro", r.status);
  }
  tokens.set(c.id, { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

async function google<T>(token: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const texto = await r.text();
  if (!r.ok) throw errorDeGoogle(r.status, texto);
  return JSON.parse(texto) as T;
}

// ── Inventario: qué ve cada cuenta conectada ─────────────────────────────

export interface Inventario {
  sitios: SitioGsc[];
  propiedades: PropiedadGa[];
  /** Por cuenta, lo que no se pudo leer (API apagada, permiso revocado). */
  errores: Array<{ email: string; error: string }>;
  /** Los ids de las cuentas que se pudieron leer. */
  conexionesOk: string[];
}

const GA_ADMIN = "https://analyticsadmin.googleapis.com/v1beta";

async function inventarioDe(c: { id: string; refreshToken: string }): Promise<{ sitios: SitioGsc[]; propiedades: PropiedadGa[]; errores: string[] }> {
  const token = await tokenDe(c);
  const errores: string[] = [];
  const sitios: SitioGsc[] = [];
  try {
    const j = await google<{ siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> }>(token, "https://www.googleapis.com/webmasters/v3/sites");
    for (const s of j.siteEntry ?? []) sitios.push({ sitio: s.siteUrl, permiso: s.permissionLevel, conexionId: c.id });
  } catch (e) {
    errores.push(`Search Console: ${e instanceof Error ? e.message : e}`);
  }
  const propiedades: PropiedadGa[] = [];
  try {
    let page: string | undefined;
    const resumenes: Array<{ propiedad: string; nombre: string; cuenta: string }> = [];
    do {
      const j = await google<{ accountSummaries?: Array<{ displayName: string; propertySummaries?: Array<{ property: string; displayName: string }> }>; nextPageToken?: string }>(
        token, `${GA_ADMIN}/accountSummaries?pageSize=200${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`);
      for (const a of j.accountSummaries ?? []) for (const p of a.propertySummaries ?? []) resumenes.push({ propiedad: p.property, nombre: p.displayName, cuenta: a.displayName });
      page = j.nextPageToken;
    } while (page);
    // ponytail: un pedido por propiedad para leer sus flujos web; con cientos de propiedades conviene cachear por día.
    for (const p of resumenes) {
      try {
        const j = await google<{ dataStreams?: Array<{ webStreamData?: { defaultUri?: string } }> }>(token, `${GA_ADMIN}/${p.propiedad}/dataStreams?pageSize=50`);
        const hosts = (j.dataStreams ?? []).map((d) => hostDe(d.webStreamData?.defaultUri)).filter((h): h is string => !!h);
        propiedades.push({ ...p, hosts, conexionId: c.id });
      } catch {
        propiedades.push({ ...p, hosts: [], conexionId: c.id });
      }
    }
  } catch (e) {
    errores.push(`Analytics: ${e instanceof Error ? e.message : e}`);
  }
  return { sitios, propiedades, errores };
}

let inventarioCache: { at: number; inv: Inventario } | null = null;

/** Lo que ven todas las cuentas conectadas. Guarda el error de cada cuenta en su fila. */
export async function inventario(db: Db, fresco = false): Promise<Inventario> {
  if (!fresco && inventarioCache && Date.now() - inventarioCache.at < 30 * 60_000) return inventarioCache.inv;
  const conexiones = await db.select().from(googleWebConexiones).where(inArray(googleWebConexiones.estado, ["activa", "error"]));
  const inv: Inventario = { sitios: [], propiedades: [], errores: [], conexionesOk: [] };
  for (const c of conexiones) {
    try {
      const r = await inventarioDe(c);
      inv.sitios.push(...r.sitios);
      inv.propiedades.push(...r.propiedades);
      for (const e of r.errores) inv.errores.push({ email: c.email, error: e });
      inv.conexionesOk.push(c.id);
      await db.update(googleWebConexiones)
        .set({ estado: r.errores.length ? "error" : "activa", ultimoError: r.errores.join(" · ").slice(0, 1000) || null, updatedAt: new Date() })
        .where(eq(googleWebConexiones.id, c.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      inv.errores.push({ email: c.email, error: msg });
      await db.update(googleWebConexiones)
        .set({ estado: e instanceof ErrorGoogle && e.codigo === "revocada" ? "revocada" : "error", ultimoError: msg.slice(0, 1000), updatedAt: new Date() })
        .where(eq(googleWebConexiones.id, c.id));
    }
  }
  inventarioCache = { at: Date.now(), inv };
  return inv;
}

// ── Sincronizar un cliente ───────────────────────────────────────────────

type FilaGsc = { keys: string[]; clicks: number; impressions: number; position: number };
type FilaGa = { dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> };

async function gsc(token: string, sitio: string, cuerpo: Record<string, unknown>): Promise<FilaGsc[]> {
  const j = await google<{ rows?: FilaGsc[] }>(token, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(sitio)}/searchAnalytics/query`, cuerpo);
  return j.rows ?? [];
}

async function ga(token: string, propiedad: string, cuerpo: Record<string, unknown>): Promise<FilaGa[]> {
  const j = await google<{ rows?: FilaGa[] }>(token, `https://analyticsdata.googleapis.com/v1beta/${propiedad}:runReport`, cuerpo);
  return j.rows ?? [];
}

const n = (v: string | number | undefined) => (v == null || v === "" ? null : Number(v));
const isoDeGa = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

/**
 * Los días de Search Console con su valor. Search Console no devuelve los días
 * sin impresiones: entre el primero y el último que devolvió son 0 de verdad;
 * después del último, todavía no hay dato (null, no se escribe). Puro.
 */
export function diasGsc(filas: FilaGsc[], desde: string): Array<{ fecha: string; clics: number; impresiones: number; posicion: number | null }> {
  if (filas.length === 0) return [];
  const por = new Map(filas.map((f) => [f.keys[0], f]));
  const ultimo = [...por.keys()].sort().at(-1)!;
  const out = [];
  for (let d = desde; d <= ultimo; d = sumarDias(d, 1)) {
    const f = por.get(d);
    out.push({ fecha: d, clics: f?.clicks ?? 0, impresiones: f?.impressions ?? 0, posicion: f ? Math.round(f.position * 10) / 10 : null });
  }
  return out;
}

async function reemplazarRanking(db: Db, clientId: string, tipo: string, filas: Array<Omit<typeof webRanking.$inferInsert, "clientId" | "tipo">>) {
  await db.transaction(async (tx) => {
    await tx.delete(webRanking).where(and(eq(webRanking.clientId, clientId), eq(webRanking.tipo, tipo)));
    if (filas.length) await tx.insert(webRanking).values(filas.map((f) => ({ ...f, clientId, tipo })));
  });
}

async function sincronizarGsc(db: Db, clientId: string, sitio: string, token: string, ahora: Date) {
  const hasta = ultimoDiaCompleto("gsc", ahora);
  const desde90 = sumarDias(hasta, -89);
  const ayer = sumarDias(diaLocal(ahora), -1);
  const diarios = diasGsc(await gsc(token, sitio, { startDate: desde90, endDate: ayer, dimensions: ["date"], rowLimit: 200 }), desde90);
  for (let i = 0; i < diarios.length; i += 100) {
    const lote = diarios.slice(i, i + 100);
    await db.insert(webDiario)
      .values(lote.map((d) => ({ clientId, fecha: d.fecha, gscClics: d.clics, gscImpresiones: d.impresiones, gscPosicion: d.posicion })))
      .onConflictDoUpdate({
        target: [webDiario.clientId, webDiario.fecha],
        set: { gscClics: sql`excluded.gsc_clics`, gscImpresiones: sql`excluded.gsc_impresiones`, gscPosicion: sql`excluded.gsc_posicion`, updatedAt: new Date() },
      });
  }
  const desde = sumarDias(hasta, -27);
  const consultas = (await gsc(token, sitio, { startDate: desde, endDate: hasta, dimensions: ["query", "page"], rowLimit: 2500 }))
    .sort((a, b) => b.impressions - a.impressions).slice(0, 400);
  await reemplazarRanking(db, clientId, "consulta", consultas.map((f) => ({
    clave: f.keys[0].slice(0, 300), detalle: f.keys[1]?.slice(0, 500) ?? null, desde, hasta,
    clics: f.clicks, impresiones: f.impressions, posicion: Math.round(f.position * 10) / 10,
  })));
  const paginas = (await gsc(token, sitio, { startDate: desde, endDate: hasta, dimensions: ["page"], rowLimit: 500 })).slice(0, 100);
  await reemplazarRanking(db, clientId, "pagina", paginas.map((f) => ({
    clave: f.keys[0].slice(0, 500), desde, hasta, clics: f.clicks, impresiones: f.impressions, posicion: Math.round(f.position * 10) / 10,
  })));
  return diarios.length;
}

async function sincronizarGa(db: Db, clientId: string, propiedad: string, token: string, ahora: Date) {
  const ayer = sumarDias(diaLocal(ahora), -1);
  const desde90 = sumarDias(ayer, -89);
  const metricasDia = ["sessions", "totalUsers", "newUsers", "engagedSessions", "keyEvents"].map((name) => ({ name }));
  const dias = await ga(token, propiedad, {
    dateRanges: [{ startDate: desde90, endDate: ayer }], dimensions: [{ name: "date" }], metrics: metricasDia, keepEmptyRows: true, limit: 200,
  });
  const filas = dias.map((f) => ({
    clientId, fecha: isoDeGa(f.dimensionValues[0].value),
    gaSesiones: n(f.metricValues[0].value), gaUsuarios: n(f.metricValues[1].value), gaNuevos: n(f.metricValues[2].value),
    gaComprometidas: n(f.metricValues[3].value), gaEventosClave: n(f.metricValues[4].value),
  }));
  for (let i = 0; i < filas.length; i += 100) {
    await db.insert(webDiario).values(filas.slice(i, i + 100)).onConflictDoUpdate({
      target: [webDiario.clientId, webDiario.fecha],
      set: {
        gaSesiones: sql`excluded.ga_sesiones`, gaUsuarios: sql`excluded.ga_usuarios`, gaNuevos: sql`excluded.ga_nuevos`,
        gaComprometidas: sql`excluded.ga_comprometidas`, gaEventosClave: sql`excluded.ga_eventos_clave`, updatedAt: new Date(),
      },
    });
  }
  const hasta = ultimoDiaCompleto("ga", ahora);
  const desde = sumarDias(hasta, -27);
  const rango = [{ startDate: desde, endDate: hasta }];
  const m = ["sessions", "totalUsers", "keyEvents", "engagementRate"].map((name) => ({ name }));
  const orden = [{ metric: { metricName: "sessions" }, desc: true }];
  const aFila = (f: FilaGa, detalle?: string) => ({
    clave: f.dimensionValues[0].value.slice(0, 500) || "(sin dato)", detalle: detalle ?? null, desde, hasta,
    sesiones: n(f.metricValues[0].value), usuarios: n(f.metricValues[1].value), eventosClave: n(f.metricValues[2].value), compromiso: n(f.metricValues[3].value),
  });
  const [canales, landings, fuentes, eventos] = await Promise.all([
    ga(token, propiedad, { dateRanges: rango, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: m, orderBys: orden, limit: 30 }),
    ga(token, propiedad, { dateRanges: rango, dimensions: [{ name: "landingPage" }, { name: "sessionDefaultChannelGroup" }], metrics: m, orderBys: orden, limit: 300 }),
    ga(token, propiedad, { dateRanges: rango, dimensions: [{ name: "sessionSourceMedium" }], metrics: m, orderBys: orden, limit: 50 }),
    ga(token, propiedad, {
      dateRanges: rango, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }, { name: "keyEvents" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 50,
    }),
  ]);
  await reemplazarRanking(db, clientId, "canal", canales.map((f) => aFila(f)));
  await reemplazarRanking(db, clientId, "landing", landings.map((f) => aFila(f, f.dimensionValues[1]?.value)));
  await reemplazarRanking(db, clientId, "fuente", fuentes.map((f) => aFila(f)));
  // evento: sesiones = veces que pasó; eventos_clave = cuántas de esas cuentan como evento clave.
  await reemplazarRanking(db, clientId, "evento", eventos.map((f) => ({
    clave: f.dimensionValues[0].value.slice(0, 200), desde, hasta, sesiones: n(f.metricValues[0].value), eventosClave: n(f.metricValues[1].value),
  })));
  return filas.length;
}

export interface ResultadoWeb {
  conexiones: number;
  clientes: number;
  conGsc: number;
  conGa: number;
  nuevosGsc: number;
  nuevosGa: number;
  sincronizados: number;
  errores: Array<{ cliente: string; error: string }>;
  erroresDeCuenta: Array<{ email: string; error: string }>;
}

// De a una: dos corridas a la vez (la del día y "Sincronizar ahora") duplicaban el ranking.
let cola: Promise<unknown> = Promise.resolve();

/** Empareja y sincroniza todos los clientes activos (o uno). */
export function sincronizarWeb(db: Db, opts: { clientId?: string; ahora?: Date } = {}): Promise<ResultadoWeb> {
  const p = cola.then(() => sincronizarAhora(db, opts));
  cola = p.catch(() => null);
  return p;
}

async function sincronizarAhora(db: Db, opts: { clientId?: string; ahora?: Date }): Promise<ResultadoWeb> {
  const ahora = opts.ahora ?? new Date();
  const inv = await inventario(db, true);
  const res: ResultadoWeb = {
    conexiones: inv.conexionesOk.length, clientes: 0, conGsc: 0, conGa: 0, nuevosGsc: 0, nuevosGa: 0, sincronizados: 0,
    errores: [], erroresDeCuenta: inv.errores,
  };
  if (inv.conexionesOk.length === 0) return res;
  const conexiones = await db.select().from(googleWebConexiones).where(inArray(googleWebConexiones.id, inv.conexionesOk));
  const porId = new Map(conexiones.map((c) => [c.id, c]));

  const lista = await db.select({ id: clients.id, name: clients.name, web: clients.websiteUrl }).from(clients)
    .where(opts.clientId ? eq(clients.id, opts.clientId) : eq(clients.status, "active"));
  const props = new Map((await db.select().from(webPropiedades)).map((p) => [p.clientId, p]));
  res.clientes = lista.length;

  for (const c of lista) {
    let p = props.get(c.id) ?? null;
    // Emparejar: solo lo que no eligió una persona, y sin borrar lo que ya estaba.
    if (!p?.fijadaPor) {
      const sitio = elegirSitio(c.web, inv.sitios);
      const { elegida, candidatas } = elegirPropiedad(c.web, inv.propiedades);
      const gscSitio = sitio?.sitio ?? p?.gscSitio ?? null;
      const ga4Propiedad = elegida?.propiedad ?? p?.ga4Propiedad ?? null;
      const ga4Nombre = elegida?.nombre ?? p?.ga4Nombre ?? null;
      if (sitio && sitio.sitio !== p?.gscSitio) res.nuevosGsc += 1;
      if (elegida && elegida.propiedad !== p?.ga4Propiedad) res.nuevosGa += 1;
      const aviso = !ga4Propiedad && candidatas.length > 1
        ? `Hay ${candidatas.length} propiedades de Analytics con esta web (${candidatas.map((x) => x.nombre).join(", ")}): elegí una en la ficha.`
        : null;
      if (gscSitio || ga4Propiedad || aviso) {
        [p] = await db.insert(webPropiedades)
          .values({ clientId: c.id, gscSitio, ga4Propiedad, ga4Nombre, ultimoError: aviso, updatedAt: new Date() })
          .onConflictDoUpdate({ target: webPropiedades.clientId, set: { gscSitio, ga4Propiedad, ga4Nombre, ultimoError: aviso, updatedAt: new Date() } })
          .returning();
      }
    }
    if (!p || (!p.gscSitio && !p.ga4Propiedad)) continue;
    if (p.gscSitio) res.conGsc += 1;
    if (p.ga4Propiedad) res.conGa += 1;

    const errores: string[] = [];
    const conexionDe = (id: string | undefined) => (id ? porId.get(id) : undefined);
    if (p.gscSitio) {
      const con = conexionDe(inv.sitios.find((s) => s.sitio === p!.gscSitio && s.permiso !== "siteUnverifiedUser")?.conexionId);
      if (!con) errores.push(`Search Console: ninguna cuenta conectada ve ${p.gscSitio}.`);
      else try { await sincronizarGsc(db, c.id, p.gscSitio, await tokenDe(con), ahora); } catch (e) { errores.push(`Search Console: ${e instanceof Error ? e.message : e}`); }
    }
    if (p.ga4Propiedad) {
      const con = conexionDe(inv.propiedades.find((x) => x.propiedad === p!.ga4Propiedad)?.conexionId);
      if (!con) errores.push(`Analytics: ninguna cuenta conectada ve ${p.ga4Nombre ?? p.ga4Propiedad}.`);
      else try { await sincronizarGa(db, c.id, p.ga4Propiedad, await tokenDe(con), ahora); } catch (e) { errores.push(`Analytics: ${e instanceof Error ? e.message : e}`); }
    }
    const error = errores.join(" · ").slice(0, 1000) || null;
    if (error) res.errores.push({ cliente: c.name.trim(), error });
    else res.sincronizados += 1;
    await db.update(webPropiedades)
      .set({ ultimoError: error, ...(error ? {} : { sincronizadoAt: new Date() }), updatedAt: new Date() })
      .where(eq(webPropiedades.clientId, c.id));
  }
  return res;
}

// ── Lo que se lee: rendimiento de la web de un cliente ───────────────────

interface Totales { clics: number | null; impresiones: number | null; posicion: number | null; sesiones: number | null; usuarios: number | null; nuevos: number | null; comprometidas: number | null; eventosClave: number | null; diasConDato: { gsc: number; ga: number } }

type Dia = typeof webDiario.$inferSelect;

/** Suma una ventana. null = esa fuente no tiene ningún día en la ventana. Posición ponderada por impresiones. Puro. */
export function sumarVentana(dias: Dia[], gsc: { desde: string; hasta: string }, ga: { desde: string; hasta: string }): Totales {
  const g = dias.filter((d) => d.fecha >= gsc.desde && d.fecha <= gsc.hasta && d.gscClics != null);
  const a = dias.filter((d) => d.fecha >= ga.desde && d.fecha <= ga.hasta && d.gaSesiones != null);
  const s = (xs: Dia[], k: keyof Dia) => (xs.length ? xs.reduce((t, d) => t + Number(d[k] ?? 0), 0) : null);
  const imp = s(g, "gscImpresiones");
  const pesada = g.reduce((t, d) => t + (d.gscPosicion != null ? Number(d.gscPosicion) * Number(d.gscImpresiones ?? 0) : 0), 0);
  return {
    clics: s(g, "gscClics"), impresiones: imp, posicion: imp ? Math.round((pesada / imp) * 10) / 10 : null,
    sesiones: s(a, "gaSesiones"), usuarios: s(a, "gaUsuarios"), nuevos: s(a, "gaNuevos"), comprometidas: s(a, "gaComprometidas"),
    eventosClave: s(a, "gaEventosClave"), diasConDato: { gsc: g.length, ga: a.length },
  };
}

/** % de cambio. null si no hay base para comparar. */
export const variacion = (ahora: number | null, antes: number | null) =>
  ahora == null || antes == null || antes === 0 ? null : Math.round(((ahora - antes) / antes) * 1000) / 10;

export interface OportunidadSeo { consulta: string; pagina: string | null; posicion: number; impresiones: number; clics: number }

/**
 * Búsquedas donde la web ya aparece pero abajo: posición 4 a 20 (de la parte
 * baja de la primera página a la segunda) con al menos 100 impresiones en 28
 * días. Son las que un contenido o una mejora de esa página puede subir. Puro.
 */
export function oportunidadesSeo(consultas: Array<{ clave: string; detalle: string | null; posicion: number | null; impresiones: number | null; clics: number | null }>, minImpresiones = 100): OportunidadSeo[] {
  const mejor = new Map<string, OportunidadSeo>();
  for (const c of consultas) {
    if (c.posicion == null || c.impresiones == null || c.posicion < 4 || c.posicion > 20 || c.impresiones < minImpresiones) continue;
    const ya = mejor.get(c.clave);
    if (!ya || c.impresiones > ya.impresiones) mejor.set(c.clave, { consulta: c.clave, pagina: c.detalle, posicion: c.posicion, impresiones: c.impresiones, clics: c.clics ?? 0 });
  }
  return [...mejor.values()].sort((a, b) => b.impresiones - a.impresiones);
}

/** Todo lo que se sabe de la web de un cliente, para agentes, Claude y la ficha. */
export async function rendimientoWeb(db: Db, clientId: string, dias = 28, ahora = new Date()) {
  const [c] = await db.select({ name: clients.name, web: clients.websiteUrl }).from(clients).where(eq(clients.id, clientId));
  if (!c) return null;
  const [p] = await db.select().from(webPropiedades).where(eq(webPropiedades.clientId, clientId));
  const gscHasta = ultimoDiaCompleto("gsc", ahora);
  const gaHasta = ultimoDiaCompleto("ga", ahora);
  const actualG = { desde: sumarDias(gscHasta, -dias + 1), hasta: gscHasta };
  const antesG = { desde: sumarDias(gscHasta, -2 * dias + 1), hasta: sumarDias(gscHasta, -dias) };
  const actualA = { desde: sumarDias(gaHasta, -dias + 1), hasta: gaHasta };
  const antesA = { desde: sumarDias(gaHasta, -2 * dias + 1), hasta: sumarDias(gaHasta, -dias) };
  const filas = await db.select().from(webDiario)
    .where(and(eq(webDiario.clientId, clientId), gte(webDiario.fecha, antesG.desde < antesA.desde ? antesG.desde : antesA.desde)));
  const ahoraT = sumarVentana(filas, actualG, actualA);
  const antesT = sumarVentana(filas, antesG, antesA);
  const ranking = await db.select().from(webRanking).where(eq(webRanking.clientId, clientId));
  const de = (tipo: string) => ranking.filter((r) => r.tipo === tipo);
  const top = <T>(xs: T[], k: (x: T) => number | null, max: number) => [...xs].sort((a, b) => (k(b) ?? 0) - (k(a) ?? 0)).slice(0, max);
  const consultas = de("consulta");
  const porConsulta = new Map<string, { consulta: string; clics: number; impresiones: number; posicion: number | null }>();
  for (const r of consultas) {
    const x = porConsulta.get(r.clave) ?? { consulta: r.clave, clics: 0, impresiones: 0, posicion: null };
    x.clics += r.clics ?? 0;
    if ((r.impresiones ?? 0) > x.impresiones) x.posicion = r.posicion;
    x.impresiones += r.impresiones ?? 0;
    porConsulta.set(r.clave, x);
  }
  const conGsc = !!p?.gscSitio;
  const conGa = !!p?.ga4Propiedad;
  return {
    cliente: c.name.trim(),
    web: c.web,
    sitioSearchConsole: p?.gscSitio ?? null,
    propiedadAnalytics: p?.ga4Propiedad ? { id: p.ga4Propiedad, nombre: p.ga4Nombre } : null,
    elegidaPor: p?.fijadaPor ? "persona" : p ? "automático (por la web)" : null,
    sincronizadoAt: p?.sincronizadoAt ?? null,
    error: p?.ultimoError ?? null,
    searchConsole: conGsc ? {
      ventana: actualG,
      clics: ahoraT.clics, impresiones: ahoraT.impresiones, posicionMedia: ahoraT.posicion,
      ctr: ahoraT.clics != null && ahoraT.impresiones ? Math.round((ahoraT.clics / ahoraT.impresiones) * 1000) / 10 : null,
      diasConDato: ahoraT.diasConDato.gsc,
      anterior: { ventana: antesG, clics: antesT.clics, impresiones: antesT.impresiones, posicionMedia: antesT.posicion },
      variacionClicsPct: variacion(ahoraT.clics, antesT.clics),
      variacionImpresionesPct: variacion(ahoraT.impresiones, antesT.impresiones),
      topBusquedas: top([...porConsulta.values()], (x) => x.clics, 15),
      topPaginas: top(de("pagina"), (x) => x.clics, 10).map((r) => ({ pagina: r.clave, clics: r.clics, impresiones: r.impresiones, posicion: r.posicion })),
      oportunidades: oportunidadesSeo(consultas).slice(0, 15),
    } : null,
    analytics: conGa ? {
      ventana: actualA,
      sesiones: ahoraT.sesiones, usuarios: ahoraT.usuarios, usuariosNuevos: ahoraT.nuevos, eventosClave: ahoraT.eventosClave,
      tasaInteraccionPct: ahoraT.sesiones ? Math.round(((ahoraT.comprometidas ?? 0) / ahoraT.sesiones) * 1000) / 10 : null,
      diasConDato: ahoraT.diasConDato.ga,
      anterior: { ventana: antesA, sesiones: antesT.sesiones, usuarios: antesT.usuarios, eventosClave: antesT.eventosClave },
      variacionSesionesPct: variacion(ahoraT.sesiones, antesT.sesiones),
      variacionEventosClavePct: variacion(ahoraT.eventosClave, antesT.eventosClave),
      canales: top(de("canal"), (x) => x.sesiones, 10).map((r) => ({ canal: r.clave, sesiones: r.sesiones, eventosClave: r.eventosClave, interaccionPct: r.compromiso != null ? Math.round(Number(r.compromiso) * 1000) / 10 : null })),
      landings: top(de("landing"), (x) => x.sesiones, 15).map((r) => ({ pagina: r.clave, canal: r.detalle, sesiones: r.sesiones, eventosClave: r.eventosClave, interaccionPct: r.compromiso != null ? Math.round(Number(r.compromiso) * 1000) / 10 : null })),
      fuentes: top(de("fuente"), (x) => x.sesiones, 10).map((r) => ({ fuente: r.clave, sesiones: r.sesiones, eventosClave: r.eventosClave })),
      eventosClaveConfigurados: de("evento").filter((r) => (r.eventosClave ?? 0) > 0).map((r) => ({ evento: r.clave, veces: r.eventosClave })),
    } : null,
    // Lo que el equipo tiene que hacer para que esto tenga datos.
    falta: [
      ...(!c.web ? ["Cargar la web del cliente en Marca."] : []),
      ...(!conGsc ? ["Search Console: ninguna cuenta conectada tiene un sitio con este dominio (o se lo elige a mano en la ficha → Web)."] : []),
      ...(!conGa ? ["Analytics: ninguna cuenta conectada tiene una propiedad GA4 con este dominio (o se la elige a mano en la ficha → Web)."] : []),
    ],
  };
}

// ── Diario ───────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;

export function initWebGoogle(db: Db): void {
  if (timer) return;
  const vuelta = async () => {
    const [hay] = await db.select({ id: googleWebConexiones.id }).from(googleWebConexiones).limit(1);
    if (!hay) return;
    const { tocaHoy } = await import("./una-vez-por-dia.js");
    if (!(await tocaHoy(db, "web:sincronizar"))) return;
    const r = await sincronizarWeb(db);
    console.log(`[web-google] ${r.conexiones} cuentas, ${r.clientes} clientes: ${r.conGsc} con Search Console (${r.nuevosGsc} nuevos), ${r.conGa} con Analytics (${r.nuevosGa} nuevos), ${r.sincronizados} sincronizados, ${r.errores.length} con error`);
  };
  const correr = () => void vuelta().catch((e) => console.warn("[web-google] falló:", e instanceof Error ? e.message : e));
  setTimeout(correr, 20 * 60_000);
  timer = setInterval(correr, 3 * 3600_000);
}
