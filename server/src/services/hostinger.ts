// LMTM-OS: las webs de los clientes en Hostinger (08/11/26).
//
// Una sola cuenta de Hostinger tiene las ~70 webs que maneja la agencia (propias
// y "managed" de los clientes). El token es de TODA la cuenta: con él se borra
// una web, se cambia una base o se entra al admin de WordPress de cualquiera.
// Por eso vive solo en el servidor (HOSTINGER_API_TOKEN) y los agentes piden por
// tres herramientas con el alcance cerrado acá:
//
//  - auditar (lectura): SSL, PHP, versión de WordPress, plugins y temas con sus
//    vulnerabilidades conocidas, cache y redirecciones;
//  - archivos (lectura): listar y leer texto. Hostinger ya se niega a devolver
//    archivos con credenciales (wp-config, .env);
//  - cambios: una lista CERRADA de acciones (actualizar plugins/temas/core,
//    desactivar un plugin, SSL, forzar https, redirección, purgar cache, versión
//    de PHP). El agente solo las PROPONE: queda una aprobación con la llamada
//    exacta y se ejecuta cuando una persona la aprueba. Actualizar un plugin
//    puede tirar la web de un cliente.
//
// Nunca por acá: borrar webs, bases, archivos o usuarios; links de login, JWT,
// phpMyAdmin; instalar plugins; DNS; facturación.
//
// Dueño: la web tiene que ser la del cliente (su "Sitio web" de Marca, o un
// subdominio de ese dominio). Sin web cargada no se toca nada.

import type { Db } from "@paperclipai/db";
import { agentActions, approvals, clients } from "@paperclipai/db";
import { and, eq, sql } from "drizzle-orm";

const API = "https://developers.hostinger.com";
export const TIPO_ACCION_WEB = "accion_web";

export interface WebHostinger {
  domain: string;
  username: string;
  website_type: string;
  is_enabled: boolean;
}
interface InstalacionWp { id: string; username: string; domain: string; directory: string; site_title?: string }

export type AccionWeb =
  | { accion: "actualizar_plugins"; plugins: string[] }
  | { accion: "actualizar_temas"; temas: string[] }
  | { accion: "desactivar_plugin"; plugin: string }
  | { accion: "actualizar_wordpress"; soloMenor: boolean }
  | { accion: "instalar_ssl" }
  | { accion: "forzar_https" }
  | { accion: "crear_redireccion"; desde: string; hacia: string }
  | { accion: "purgar_cache" }
  | { accion: "version_php"; version: string };

export const ACCIONES_WEB = [
  "actualizar_plugins", "actualizar_temas", "desactivar_plugin", "actualizar_wordpress",
  "instalar_ssl", "forzar_https", "crear_redireccion", "purgar_cache", "version_php",
] as const;

export interface PayloadAccionWeb {
  clientId: string;
  dominio: string;
  justificacion: string;
  resumen: string;
  accion: AccionWeb;
  resultado?: { ok: boolean; detalle: string; ejecutadoAt: string };
}

class ErrorHostinger extends Error {}

async function pedir(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = process.env.HOSTINGER_API_TOKEN?.trim();
  if (!token) throw new ErrorHostinger("Falta HOSTINGER_API_TOKEN en el servidor: la cuenta de Hostinger no está conectada.");
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const txt = await r.text();
  if (!r.ok) throw new ErrorHostinger(`Hostinger ${r.status}: ${txt.slice(0, 300)}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return txt; }
}

// ponytail: cache en memoria de 5 min por proceso; la lista cambia cuando alguien da de alta una web.
let cache: { at: number; webs: WebHostinger[]; wp: InstalacionWp[] } | null = null;
async function inventario(): Promise<{ webs: WebHostinger[]; wp: InstalacionWp[] }> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache;
  const webs: WebHostinger[] = [];
  for (let page = 1; page < 20; page++) {
    const r = (await pedir("GET", `/api/hosting/v1/websites?per_page=100&page=${page}`)) as { data: WebHostinger[]; meta?: { total?: number } };
    webs.push(...r.data);
    if (r.data.length < 100 || webs.length >= (r.meta?.total ?? 0)) break;
  }
  // "all": las webs de los clientes están como "managed", no "owned".
  const wp = (await pedir("GET", "/api/hosting/v1/wordpress/installations?ownership=all")) as InstalacionWp[];
  cache = { at: Date.now(), webs, wp };
  return cache;
}

/** Host sin www ni puerto, en minúscula. "" si no es una URL. Pura. */
export function hostDe(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Las webs de Hostinger que son de este dominio: el mismo o un subdominio. Pura. */
export function websDelDominio(host: string, webs: WebHostinger[]): WebHostinger[] {
  if (!host) return [];
  return webs.filter((w) => {
    const d = w.domain.toLowerCase().replace(/^www\./, "");
    return d === host || d.endsWith(`.${host}`);
  });
}

/** Los dominios del cliente: su "Sitio web" de Marca más los mapeados en
 *  metadata.webs (un cliente puede tener varias webs, 08/11/26). Pura. */
export function dominiosDelCliente(web: string | null | undefined, metadata: unknown): string[] {
  const extra = (metadata as { webs?: unknown } | null)?.webs;
  const lista = [web, ...(Array.isArray(extra) ? extra.filter((x): x is string => typeof x === "string") : [])];
  return [...new Set(lista.map(hostDe).filter(Boolean))];
}

interface WebResuelta { web: WebHostinger; wp: InstalacionWp | null; cliente: string }

/** La web del cliente en Hostinger, verificando que sea suya. */
async function webDelCliente(db: Db, clientId: string, dominio?: string): Promise<WebResuelta | { error: string }> {
  const [c] = await db.select({ name: clients.name, web: clients.websiteUrl, metadata: clients.metadata }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!c) return { error: "Cliente no encontrado." };
  const host = hostDe(c.web);
  const dominios = dominiosDelCliente(c.web, c.metadata);
  if (dominios.length === 0) return { error: `${c.name.trim()} no tiene "Sitio web" cargado en su Marca ni webs mapeadas: sin eso no se sabe cuál es su web en Hostinger.` };
  const { webs, wp } = await inventario();
  const suyas = [...new Map(dominios.flatMap((d) => websDelDominio(d, webs)).map((w) => [w.domain, w])).values()];
  if (suyas.length === 0) return { error: `La web de ${c.name.trim()} (${dominios.join(", ")}) no está en la cuenta de Hostinger de la agencia: está alojada en otro lado.` };
  const pedido = hostDe(dominio);
  const web = pedido ? suyas.find((w) => w.domain.toLowerCase().replace(/^www\./, "") === pedido) : (suyas.find((w) => w.domain === host) ?? suyas[0]);
  if (!web) return { error: `${dominio} no es de ${c.name.trim()}. Sus webs en Hostinger: ${suyas.map((w) => w.domain).join(", ")}.` };
  const inst = wp.filter((i) => i.username === web.username && i.domain === web.domain);
  // La de la raíz primero: si hay otra en una subcarpeta, es un sitio aparte.
  return { web, wp: inst.find((i) => !i.directory) ?? inst[0] ?? null, cliente: c.name.trim() };
}

const base = (w: WebHostinger) => `/api/hosting/v1/accounts/${w.username}/websites/${w.domain}`;
const baseWp = (w: WebHostinger, i: InstalacionWp) => `/api/hosting/v1/accounts/${w.username}/wordpress/${i.id}`;

type Vuln = { title?: string; fixed_in?: string | null };
/** Lo que deja entrar sin usuario o tomar el servidor. El resto (XSS de
 *  colaborador, etc.) pide una cuenta en el sitio. */
const GRAVE = /unauthenticated|remote code execution|rce|sql injection|arbitrary file (upload|deletion)|privilege escalation|shortcode execution/i;

/** Compara versiones "1.10.2" > "1.9.9". Pura. */
export function versionMayor(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0), pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Resumen de vulnerabilidades: cuántas, las graves con nombre y la versión
 *  que arregla todas. La lista entera de un WordPress viejo pasa de 100 y
 *  cortaba la respuesta antes de llegar a los plugins (08/11/26). Pura. */
export function resumenVulns(v: unknown): { total: number; graves: string[]; arregladoEn: string | null } {
  const l = Array.isArray(v) ? (v as Vuln[]) : [];
  const arreglos = l.map((x) => x.fixed_in).filter((x): x is string => !!x);
  return {
    total: l.length,
    graves: l.filter((x) => GRAVE.test(x.title ?? "")).map((x) => `${x.title}${x.fixed_in ? ` (arreglado en ${x.fixed_in})` : ""}`).slice(0, 5),
    arregladoEn: arreglos.length ? arreglos.reduce((m, x) => (versionMayor(x, m) > 0 ? x : m)) : null,
  };
}
const vulns = resumenVulns;

/** Lectura: el estado técnico de la web del cliente en una llamada. */
export async function auditarWeb(db: Db, clientId: string, dominio?: string): Promise<{ ok: boolean; contenido: unknown }> {
  const r = await webDelCliente(db, clientId, dominio);
  if ("error" in r) return { ok: false, contenido: r.error };
  const { web, wp } = r;
  // Cada parte por separado: una que falla no tapa a las demás, y queda dicha.
  const parte = async <T>(f: () => Promise<T>): Promise<T | { error: string }> => {
    try { return await f(); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  };
  const [ssl, php, cacheEstado, redirecciones, core, actualizaciones, plugins, temas] = await Promise.all([
    parte(() => pedir("GET", `${base(web)}/ssl/status`)),
    parte(async () => {
      const p = (await pedir("GET", `${base(web)}/php/details`)) as { php_version?: string; options?: Record<string, { value?: string }> };
      return { version: p.php_version, display_errors: p.options?.display_errors?.value ?? null };
    }),
    parte(() => pedir("GET", `${base(web)}/cache/status`)),
    parte(() => pedir("GET", `${base(web)}/redirects`)),
    wp ? parte(async () => {
      const v = (await pedir("GET", `${baseWp(web, wp)}/version`)) as { version?: string; vulnerabilities?: unknown };
      return { version: v.version, vulnerabilidades: vulns(v.vulnerabilities) };
    }) : Promise.resolve(null),
    wp ? parte(() => pedir("GET", `${baseWp(web, wp)}/updates`)) : Promise.resolve(null),
    wp ? parte(async () => ((await pedir("GET", `${baseWp(web, wp)}/plugins`)) as Array<Record<string, unknown>>).map((p) => ({
      slug: p.name, nombre: p.title, version: p.version, estado: p.status,
      actualizacion: p.update === "available", vulnerabilidades: vulns(p.vulnerabilities),
    }))) : Promise.resolve(null),
    wp ? parte(async () => ((await pedir("GET", `${baseWp(web, wp)}/themes`)) as Array<Record<string, unknown>>).map((t) => ({
      slug: t.name, nombre: t.title, version: t.version, estado: t.status,
      actualizacion: t.update === "available", vulnerabilidades: vulns(t.vulnerabilities),
    }))) : Promise.resolve(null),
  ]);
  return {
    ok: true,
    contenido: {
      cliente: r.cliente,
      dominio: web.domain,
      tipo: web.website_type,
      activa: web.is_enabled,
      ssl, php, cache: cacheEstado, redirecciones,
      // null = no es WordPress (o Hostinger no la detecta como tal), no "sin problemas".
      wordpress: wp ? { titulo: wp.site_title ?? null, core, actualizacionesCore: actualizaciones, plugins, temas } : null,
      acciones: "Para cambiar algo, proponer_cambio_web con una de: " + ACCIONES_WEB.join(", ") + ". Queda para aprobación humana.",
    },
  };
}

/** Lectura: lista una carpeta o lee un archivo de texto de la web del cliente. */
export async function archivosWeb(db: Db, clientId: string, p: { dominio?: string; ruta?: string; leer?: boolean }): Promise<{ ok: boolean; contenido: unknown }> {
  const r = await webDelCliente(db, clientId, p.dominio);
  if ("error" in r) return { ok: false, contenido: r.error };
  const ruta = (p.ruta ?? "").replace(/^\/+/, "");
  if (ruta.split("/").includes("..")) return { ok: false, contenido: "La ruta no puede subir de carpeta (..)." };
  const q = new URLSearchParams({ path: ruta });
  try {
    const path = `/api/hosting/v1/accounts/${r.web.username}/domains/${r.web.domain}/files${p.leer ? "/content" : ""}?${q}`;
    return { ok: true, contenido: await pedir("GET", path) };
  } catch (e) {
    return { ok: false, contenido: e instanceof Error ? e.message : String(e) };
  }
}

/** Valida y normaliza lo que manda el agente. Devuelve el error para el agente si no sirve. Pura. */
export function accionDesdeParametros(p: Record<string, unknown>): AccionWeb | string {
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^[a-z0-9._-]{1,120}$/i.test(x)) : []);
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  switch (p.accion) {
    case "actualizar_plugins": {
      const plugins = lista(p.plugins);
      return plugins.length >= 1 && plugins.length <= 20 ? { accion: "actualizar_plugins", plugins } : "Pasá `plugins`: de 1 a 20 slugs (los de auditar_web).";
    }
    case "actualizar_temas": {
      const temas = lista(p.temas);
      return temas.length >= 1 && temas.length <= 20 ? { accion: "actualizar_temas", temas } : "Pasá `temas`: de 1 a 20 slugs.";
    }
    case "desactivar_plugin": {
      const [plugin] = lista([p.plugin]);
      return plugin ? { accion: "desactivar_plugin", plugin } : "Pasá `plugin` (slug).";
    }
    case "actualizar_wordpress":
      return { accion: "actualizar_wordpress", soloMenor: p.soloMenor !== false };
    case "instalar_ssl":
    case "forzar_https":
    case "purgar_cache":
      return { accion: p.accion };
    case "crear_redireccion": {
      const desde = texto(p.desde), hacia = texto(p.hacia);
      if (!desde || !hacia || desde.length > 255 || hacia.length > 255) return "Pasá `desde` y `hacia` (URLs completas, hasta 255 caracteres).";
      return { accion: "crear_redireccion", desde, hacia };
    }
    case "version_php": {
      const version = texto(p.version);
      return /^\d\.\d$/.test(version) ? { accion: "version_php", version } : "Pasá `version` como \"8.3\".";
    }
    default:
      return `Acción desconocida. Las que hay: ${ACCIONES_WEB.join(", ")}.`;
  }
}

/** Qué pide, sin el porqué: dos propuestas con la misma firma piden lo mismo. Pura. */
export function firmaAccionWeb(dominio: string, a: AccionWeb): string {
  return `${dominio}:${JSON.stringify(a)}`;
}

/** Deja el cambio armado para que una persona lo apruebe (una por acción y agente). */
export async function proponerCambioWeb(
  db: Db,
  input: { companyId: string; agentId: string | null; clientId: string; dominio?: string; justificacion: string; accion: AccionWeb },
): Promise<{ ok: boolean; mensaje: string }> {
  const r = await webDelCliente(db, input.clientId, input.dominio);
  if ("error" in r) return { ok: false, mensaje: r.error };
  if (["actualizar_plugins", "actualizar_temas", "desactivar_plugin", "actualizar_wordpress"].includes(input.accion.accion) && !r.wp) {
    return { ok: false, mensaje: `${r.web.domain} no figura como WordPress en Hostinger: esa acción no aplica.` };
  }
  const payload: PayloadAccionWeb = {
    clientId: input.clientId,
    dominio: r.web.domain,
    justificacion: input.justificacion,
    resumen: `${r.web.domain}: ${describir(input.accion)}`,
    accion: input.accion,
  };
  const firma = firmaAccionWeb(r.web.domain, input.accion);
  const pendientes = await db.select({ id: approvals.id, payload: approvals.payload }).from(approvals).where(and(
    eq(approvals.type, TIPO_ACCION_WEB),
    eq(approvals.status, "pending"),
    sql`${approvals.payload}->>'clientId' = ${input.clientId}`,
  ));
  const igual = pendientes.find((p) => esAccionWeb(p.payload) && firmaAccionWeb(p.payload.dominio, p.payload.accion) === firma);
  if (igual) {
    await db.update(approvals).set({ payload: payload as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(approvals.id, igual.id));
    return { ok: true, mensaje: `Ya estaba pendiente (aprobación ${igual.id}): le actualicé la justificación.` };
  }
  const [fila] = await db.insert(approvals).values({
    companyId: input.companyId,
    type: TIPO_ACCION_WEB,
    requestedByAgentId: input.agentId,
    status: "pending",
    payload: payload as unknown as Record<string, unknown>,
  }).returning({ id: approvals.id });
  return {
    ok: true,
    mensaje: `Cambio armado: aprobación ${fila.id} — "${payload.resumen}". Nombrala en el issue. Cuando una persona la apruebe, el sistema lo ejecuta solo; no vuelvas a llamar la herramienta.`,
  };
}

export function describir(a: AccionWeb): string {
  switch (a.accion) {
    case "actualizar_plugins": return `actualizar plugins ${a.plugins.join(", ")}`;
    case "actualizar_temas": return `actualizar temas ${a.temas.join(", ")}`;
    case "desactivar_plugin": return `desactivar el plugin ${a.plugin}`;
    case "actualizar_wordpress": return a.soloMenor ? "actualizar WordPress (versión menor)" : "actualizar WordPress a la última versión";
    case "instalar_ssl": return "instalar el certificado SSL";
    case "forzar_https": return "redirigir todo a https";
    case "crear_redireccion": return `redirigir ${a.desde} → ${a.hacia}`;
    case "purgar_cache": return "purgar la cache";
    case "version_php": return `pasar PHP a ${a.version}`;
  }
}

export function esAccionWeb(payload: unknown): payload is PayloadAccionWeb {
  const p = payload as PayloadAccionWeb | null;
  return !!p && typeof p.clientId === "string" && typeof p.dominio === "string" && !!p.accion
    && typeof accionDesdeParametros(p.accion as unknown as Record<string, unknown>) !== "string";
}

/** El pedido HTTP exacto de cada acción. Pura. */
export function pedidoDeAccion(w: WebHostinger, wp: InstalacionWp | null, a: AccionWeb): { method: string; path: string; body?: unknown } | string {
  const necesitaWp = () => (wp ? null : "La web no figura como WordPress en Hostinger.");
  switch (a.accion) {
    case "actualizar_plugins": return necesitaWp() ?? { method: "POST", path: `${baseWp(w, wp!)}/plugins/update`, body: { plugins: a.plugins } };
    case "actualizar_temas": return necesitaWp() ?? { method: "POST", path: `${baseWp(w, wp!)}/themes/update`, body: { themes: a.temas } };
    case "desactivar_plugin": return necesitaWp() ?? { method: "POST", path: `${baseWp(w, wp!)}/plugins/deactivate`, body: { plugin: a.plugin } };
    case "actualizar_wordpress": return necesitaWp() ?? { method: "POST", path: `${baseWp(w, wp!)}/update`, body: { minor: a.soloMenor } };
    case "instalar_ssl": return { method: "POST", path: `${base(w)}/ssl/setup` };
    case "forzar_https": return { method: "PATCH", path: `${base(w)}/ssl/https-redirect/toggle`, body: { is_enabled: true } };
    case "crear_redireccion": return { method: "POST", path: `${base(w)}/redirects`, body: { from: a.desde, to: a.hacia } };
    case "purgar_cache": return { method: "DELETE", path: `${base(w)}/cache/clear` };
    case "version_php": return { method: "PATCH", path: `${base(w)}/php/version`, body: { version: a.version } };
  }
}

/** Ejecuta un cambio ya aprobado. Vuelve a verificar que la web sea del cliente. */
export async function ejecutarCambioWeb(db: Db, p: PayloadAccionWeb, agentId: string | null): Promise<{ ok: boolean; detalle: string }> {
  try {
    const r = await webDelCliente(db, p.clientId, p.dominio);
    if ("error" in r) return { ok: false, detalle: r.error };
    const pedido = pedidoDeAccion(r.web, r.wp, p.accion);
    if (typeof pedido === "string") return { ok: false, detalle: pedido };
    await pedir(pedido.method, pedido.path, pedido.body);
    await db.insert(agentActions).values({
      clientId: p.clientId, agentId, kind: `web_${p.accion.accion}`,
      entityType: "web", entityId: r.web.domain, detail: { accion: p.accion, justificacion: p.justificacion },
    }).catch(() => {});
    const asincronica = ["actualizar_plugins", "actualizar_temas", "actualizar_wordpress", "instalar_ssl"].includes(p.accion.accion);
    return { ok: true, detalle: `Hostinger aceptó: ${describir(p.accion)}.${asincronica ? " Corre en segundo plano: revisar la web en unos minutos." : ""}` };
  } catch (e) {
    return { ok: false, detalle: e instanceof Error ? e.message : String(e) };
  }
}
