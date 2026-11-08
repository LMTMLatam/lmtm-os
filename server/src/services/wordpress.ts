// LMTM-OS: editar el contenido de las webs WordPress de los clientes (08/11/26).
//
// La API de Hostinger no edita contenido y la cuenta de la agencia es
// colaboradora de las webs (no dueña), así que tampoco puede subir archivos.
// Lo que sí da es un LINK DE ACCESO TEMPORAL al wp-admin. Con él el servidor
// abre una sesión de administrador solo mientras hace el cambio y usa la API
// de WordPress (páginas, menús, usuarios) o el canal propio de Elementor
// (`elementor_ajax`: get_document_config / save_builder), que es donde viven
// los widgets. No queda ninguna contraseña guardada en ningún lado.
//
// Lectura: buscar un texto (páginas, entradas, ítems de menú y widgets de
// Elementor) y listar administradores. Escritura, siempre con aprobación y
// sobre un objeto concreto: quitar bloques ocultos con enlaces ajenos (spam de
// una web hackeada) o reemplazar un texto exacto. Antes de guardar queda el
// respaldo en agent_actions; Elementor además guarda su propia revisión.

import { spamOculto } from "./hostinger.js";

export interface SesionWp {
  sitio: string;
  get: (path: string) => Promise<{ status: number; json: unknown; text: string }>;
  send: (method: string, path: string, body?: unknown) => Promise<{ status: number; json: unknown }>;
  ajax: (params: Record<string, string>) => Promise<{ status: number; json: unknown }>;
}

/** Abre una sesión de administrador con el link temporal de Hostinger. */
export async function abrirSesion(linkLogin: string): Promise<SesionWp> {
  const jar = new Map<string, string>();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const guardar = (res: Response) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const [k, ...v] = kv.split("=");
      jar.set(k.trim(), v.join("="));
    }
  };
  let url: string | null = /^https?:\/\//.test(linkLogin) ? linkLogin : `https://${linkLogin}`;
  const sitio = new URL(url).origin;
  for (let n = 0; n < 8 && url; n++) {
    const res: Response = await fetch(url, { redirect: "manual", headers: { Cookie: cookie(), "User-Agent": "LMTM-OS" }, signal: AbortSignal.timeout(30_000) });
    guardar(res);
    const loc = res.headers.get("location");
    url = loc ? new URL(loc, url).href : null;
  }
  if (![...jar.keys()].some((k) => k.startsWith("wordpress_logged_in"))) throw new Error("El link de acceso de Hostinger no abrió sesión en WordPress.");
  const nonce = (await (await fetch(`${sitio}/wp-admin/admin-ajax.php?action=rest-nonce`, { headers: { Cookie: cookie() } })).text()).trim();
  if (!/^[0-9a-f]{6,}$/.test(nonce)) throw new Error("WordPress no dio el nonce de la API con la sesión abierta.");
  const H = () => ({ Cookie: cookie(), "X-WP-Nonce": nonce, "User-Agent": "LMTM-OS" });
  const leer = async (r: Response) => { const text = await r.text(); let json: unknown = null; try { json = JSON.parse(text); } catch { /* html */ } return { status: r.status, json, text }; };
  return {
    sitio,
    get: async (path) => leer(await fetch(sitio + path, { headers: H(), signal: AbortSignal.timeout(60_000) })),
    send: async (method, path, body) => {
      const r = await leer(await fetch(sitio + path, { method, headers: { ...H(), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000) }));
      return { status: r.status, json: r.json };
    },
    ajax: async (params) => {
      const r = await leer(await fetch(`${sitio}/wp-admin/admin-ajax.php`, { method: "POST", headers: { Cookie: cookie(), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params), signal: AbortSignal.timeout(60_000) }));
      return { status: r.status, json: r.json };
    },
  };
}

type Elemento = { id: string; elType?: string; widgetType?: string; settings?: Record<string, unknown>; elements?: Elemento[] };

/** Recorre los textos de los widgets. f devuelve el texto nuevo (o el mismo). Pura. */
export function editarTextos(els: Elemento[], f: (texto: string, el: Elemento, campo: string) => string): { elementos: Elemento[]; cambios: Array<{ elemento: string; campo: string; antes: string; despues: string }> } {
  const cambios: Array<{ elemento: string; campo: string; antes: string; despues: string }> = [];
  const rec = (lista: Elemento[]): Elemento[] => lista.map((e) => {
    const settings = { ...(e.settings ?? {}) };
    for (const [k, v] of Object.entries(settings)) {
      if (typeof v !== "string") continue;
      const nuevo = f(v, e, k);
      if (nuevo !== v) { settings[k] = nuevo; cambios.push({ elemento: e.id, campo: k, antes: v, despues: nuevo }); }
    }
    return { ...e, settings, elements: e.elements ? rec(e.elements) : e.elements };
  });
  return { elementos: rec(els), cambios };
}

/** Saca de un HTML los bloques ocultos con enlaces ajenos (los mismos que marca spamOculto). Pura. */
export function quitarOcultos(html: string, dominio: string): string {
  if (spamOculto(html, dominio).length === 0) return html;
  const OCULTO = /<(div|p|span)[^>]*style="[^"]*(left:\s*-\d{3,}px|top:\s*-\d{3,}px|display:\s*none|visibility:\s*hidden|font-size:\s*0)[^"]*"[^>]*>([\s\S]{0,800}?)<\/\1>/gi;
  return html.replace(OCULTO, (bloque) => (spamOculto(bloque, dominio).length > 0 ? "" : bloque));
}

async function documentoElementor(s: SesionWp, postId: number): Promise<{ nonce: string; elementos: Elemento[]; estado: string } | null> {
  const ed = await s.get(`/wp-admin/post.php?post=${postId}&action=elementor`);
  const nonce = ed.text.match(/"ajax":\{"url":"[^"]*","nonce":"([0-9a-f]+)"/)?.[1];
  if (!nonce) return null; // no es una página de Elementor
  const r = await s.ajax({
    action: "elementor_ajax", _nonce: nonce, editor_post_id: String(postId), initial_document_id: String(postId),
    actions: JSON.stringify({ c: { action: "get_document_config", data: { id: postId } } }),
  });
  const d = (r.json as { data?: { responses?: { c?: { success?: boolean; data?: { elements?: Elemento[]; status?: { value?: string } } } } } })?.data?.responses?.c;
  if (!d?.success || !Array.isArray(d.data?.elements)) throw new Error(`Elementor no devolvió el documento ${postId}.`);
  return { nonce, elementos: d.data!.elements!, estado: d.data?.status?.value ?? "publish" };
}

/** Lectura: dónde aparece un texto en la web (páginas, entradas, menús, widgets). */
export async function buscarEnWeb(s: SesionWp, texto: string): Promise<unknown> {
  const q = encodeURIComponent(texto);
  const resultados: unknown[] = [];
  for (const tipo of ["pages", "posts"]) {
    const r = await s.get(`/wp-json/wp/v2/${tipo}?search=${q}&context=edit&status=any&per_page=20&_fields=id,title,link,modified,status`);
    for (const p of (Array.isArray(r.json) ? r.json : []) as Array<{ id: number; title?: { raw?: string }; link?: string; modified?: string; status?: string }>) {
      const doc = await documentoElementor(s, p.id).catch(() => null);
      const widgets: unknown[] = [];
      if (doc) editarTextos(doc.elementos, (v, e, campo) => { if (v.toLowerCase().includes(texto.toLowerCase())) widgets.push({ elemento: e.id, tipo: e.widgetType ?? e.elType, campo, extracto: v.slice(0, 300) }); return v; });
      resultados.push({ objeto: "pagina", postId: p.id, tipo, titulo: p.title?.raw, link: p.link, estado: p.status, modificada: p.modified, elementor: !!doc, widgets });
    }
  }
  const menus = await s.get(`/wp-json/wp/v2/menu-items?context=edit&per_page=100&search=${q}&_fields=id,title,url,menus,status`);
  for (const m of (Array.isArray(menus.json) ? menus.json : []) as Array<{ id: number; title?: { raw?: string }; url?: string; menus?: number }>) {
    resultados.push({ objeto: "menu", menuItemId: m.id, titulo: (m.title?.raw ?? "").slice(0, 300), url: m.url, menu: m.menus });
  }
  return { texto, resultados, nota: resultados.length ? undefined : "No apareció en páginas, entradas ni menús (puede estar en el tema, un widget de barra lateral o un plugin)." };
}

/** Lectura: los administradores (para revisar una web hackeada). */
export async function administradores(s: SesionWp): Promise<unknown> {
  const r = await s.get("/wp-json/wp/v2/users?roles=administrator&context=edit&per_page=100&_fields=id,username,name,email,registered_date");
  return r.json;
}

export type CambioContenido =
  | { accion: "quitar_spam"; postId?: number; menuItemId?: number }
  | { accion: "reemplazar_texto"; postId: number; buscar: string; reemplazar: string }
  | { accion: "bajar_administrador"; userId: number };

/** Ejecuta un cambio de contenido. Devuelve lo que cambió y el respaldo. */
export async function cambiarContenido(s: SesionWp, dominio: string, c: CambioContenido): Promise<{ ok: boolean; detalle: string; respaldo?: unknown }> {
  if (c.accion === "quitar_spam" && c.menuItemId) {
    const m = await s.get(`/wp-json/wp/v2/menu-items/${c.menuItemId}?context=edit`);
    const item = m.json as { title?: { raw?: string }; url?: string } | null;
    if (m.status !== 200 || !item) return { ok: false, detalle: `No encontré el ítem de menú ${c.menuItemId}.` };
    // Solo se borra si el ítem ES el spam: un ítem de menú legítimo no trae un bloque oculto con enlace ajeno.
    if (spamOculto(item.title?.raw ?? "", dominio).length === 0) return { ok: false, detalle: "Ese ítem de menú no tiene un bloque oculto con enlaces ajenos: no se toca." };
    const d = await s.send("DELETE", `/wp-json/wp/v2/menu-items/${c.menuItemId}?force=true`);
    if (d.status !== 200) return { ok: false, detalle: `WordPress no borró el ítem (${d.status}).` };
    return { ok: true, detalle: `Ítem de menú ${c.menuItemId} (spam oculto) borrado.`, respaldo: item };
  }

  if (c.accion === "bajar_administrador") {
    // No se borra: pasa a suscriptor, que no puede tocar nada. Si era legítimo, se le devuelve el rol.
    const admins = (await s.get("/wp-json/wp/v2/users?roles=administrator&context=edit&per_page=100&_fields=id,username,email,roles")).json as Array<{ id: number; username?: string; email?: string }> | null;
    const u = admins?.find((x) => x.id === c.userId);
    if (!u) return { ok: false, detalle: `El usuario ${c.userId} no es administrador.` };
    if ((admins?.length ?? 0) < 2) return { ok: false, detalle: "Es el único administrador: no se le saca el rol." };
    const r = await s.send("POST", `/wp-json/wp/v2/users/${c.userId}`, { roles: ["subscriber"] });
    if (r.status !== 200) return { ok: false, detalle: `WordPress no cambió el rol (${r.status}).` };
    return { ok: true, detalle: `Usuario ${u.username} (${c.userId}) pasó de administrador a suscriptor. Para devolverle el rol: Usuarios → editar → Administrador.`, respaldo: { userId: c.userId, username: u.username, rolAnterior: "administrator" } };
  }

  const postId = c.postId;
  if (!postId) return { ok: false, detalle: "Falta postId o menuItemId." };
  const cambiar = (v: string) => (c.accion === "quitar_spam" ? quitarOcultos(v, dominio) : v.split(c.buscar).join(c.reemplazar));

  const doc = await documentoElementor(s, postId);
  if (doc) {
    const { elementos, cambios } = editarTextos(doc.elementos, (v) => cambiar(v));
    if (cambios.length === 0) return { ok: false, detalle: "No había nada para cambiar en esa página de Elementor." };
    const r = await s.ajax({
      action: "elementor_ajax", _nonce: doc.nonce, editor_post_id: String(postId), initial_document_id: String(postId),
      actions: JSON.stringify({ g: { action: "save_builder", data: { status: doc.estado, elements: elementos } } }),
    });
    const ok = (r.json as { data?: { responses?: { g?: { success?: boolean } } } })?.data?.responses?.g?.success === true;
    if (!ok) return { ok: false, detalle: `Elementor no guardó (${r.status}).`, respaldo: { postId, elementos: doc.elementos } };
    // Verificación: se vuelve a leer y el cambio tiene que estar.
    const despues = await documentoElementor(s, postId);
    const quedo = despues ? editarTextos(despues.elementos, (v) => cambiar(v)).cambios.length === 0 : false;
    return {
      ok: quedo,
      detalle: quedo
        ? `Página ${postId}: ${cambios.length} texto(s) cambiados en Elementor (${cambios.map((x) => x.elemento).join(", ")}). Elementor guardó una revisión.`
        : `Elementor dijo que guardó pero al releer el cambio no está.`,
      respaldo: { postId, cambios: cambios.map((x) => ({ elemento: x.elemento, campo: x.campo, antes: x.antes })) },
    };
  }

  const p = await s.get(`/wp-json/wp/v2/pages/${postId}?context=edit&_fields=id,content`);
  const base = p.status === 200 ? "pages" : "posts";
  const q = p.status === 200 ? p : await s.get(`/wp-json/wp/v2/posts/${postId}?context=edit&_fields=id,content`);
  const antes = (q.json as { content?: { raw?: string } } | null)?.content?.raw;
  if (typeof antes !== "string") return { ok: false, detalle: `No encontré la página o entrada ${postId}.` };
  const despues = cambiar(antes);
  if (despues === antes) return { ok: false, detalle: "No había nada para cambiar en esa página." };
  const u = await s.send("POST", `/wp-json/wp/v2/${base}/${postId}`, { content: despues });
  if (u.status !== 200) return { ok: false, detalle: `WordPress no guardó (${u.status}).`, respaldo: { postId, antes } };
  return { ok: true, detalle: `${base === "pages" ? "Página" : "Entrada"} ${postId} actualizada (WordPress guarda la revisión).`, respaldo: { postId, antes } };
}
