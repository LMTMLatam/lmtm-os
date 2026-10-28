// LMTM-OS: buscar material de Drive por lo que MUESTRA (28/10).
//
// Pedido: «hacé un reel de 30 s de tal producto de tal cliente» y que el agente
// encuentre en Drive las fotos y videos correctos. El índice de la guía busca por
// nombre de archivo y carpeta, y la mayoría del material se llama DJI_….jpg o
// 1.jpg: el nombre no dice qué hay adentro.
//
// Acá GPT mira la miniatura de cada foto y video (la que da Drive, ~30 KB, en
// calidad baja: unos 85 tokens por imagen) y la describe en una línea. La
// descripción queda guardada por cliente: cada archivo se mira una sola vez.
// Después GPT elige, entre las descripciones, lo que corresponde al pedido.

import type { Db } from "@paperclipai/db";
import { clientContextCache } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { firmarAcceso, indiceDrive, palabrasDePedido, puntaje, resolverCliente, textoSinCliente, URL_BASE, type ArchivoDrive } from "./guia-contenido.js";

const MODELO = process.env.LMTM_MODELO_MATERIAL ?? "gpt-6.1-terra";
const POR_LOTE = 12;
/** Cuántos archivos nuevos se miran por búsqueda (el resto, en la próxima). */
const NUEVOS_POR_BUSQUEDA = 144;
const FUENTE = "drive-vista";

type Vistas = Record<string, string>;

async function vistasGuardadas(db: Db, clientId: string): Promise<Vistas> {
  const [f] = await db.select({ payload: clientContextCache.payload }).from(clientContextCache)
    .where(and(eq(clientContextCache.clientId, clientId), eq(clientContextCache.source, FUENTE)));
  return ((f?.payload as { vistas?: Vistas } | undefined)?.vistas) ?? {};
}

async function guardarVistas(db: Db, clientId: string, vistas: Vistas): Promise<void> {
  const payload = { vistas } as unknown as Record<string, unknown>;
  await db.insert(clientContextCache)
    .values({ clientId, source: FUENTE, externalId: "vistas", payload, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: [clientContextCache.clientId, clientContextCache.source], set: { payload, fetchedAt: new Date(), updatedAt: new Date() } })
    .catch((e) => console.warn("[material] no se guardaron las descripciones:", String(e instanceof Error ? e.message : e).slice(0, 160)));
}

async function miniatura(id: string): Promise<string | null> {
  const { drive } = await import("./contenido-drive.js");
  try {
    const f = await drive<{ thumbnailLink?: string }>(`files/${encodeURIComponent(id)}?fields=thumbnailLink&supportsAllDrives=true`);
    if (!f?.thumbnailLink) return null;
    const r = await fetch(f.thumbnailLink.replace(/=s\d+$/, "=s400"), { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}

async function gpt(contenido: unknown[], maxTokens: number): Promise<Record<string, unknown> | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("falta OPENAI_API_KEY");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, messages: [{ role: "user", content: contenido }], response_format: { type: "json_object" }, max_completion_tokens: maxTokens }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  try { return JSON.parse(j.choices?.[0]?.message?.content ?? "{}"); } catch { return null; }
}

/** Describe un lote de archivos mirando sus miniaturas. Devuelve id → descripción. */
async function describir(lote: ArchivoDrive[]): Promise<Vistas> {
  const imgs = await Promise.all(lote.map((a) => miniatura(a.id)));
  const con = lote.map((a, i) => ({ a, b64: imgs[i] })).filter((x) => x.b64);
  if (!con.length) return {};
  const pedido =
    `Sos el archivista de una agencia de marketing. Te paso ${con.length} imágenes numeradas (fotos o el primer cuadro de un video) del material de un cliente. ` +
    "Para cada una, en castellano y en 20 palabras como mucho: qué producto o servicio se ve (lo más específico posible: tipo, color, material, modelo si se lee), " +
    "dónde (ambiente, local, obra, exterior), si hay personas, si tiene texto o logos sobreimpresos, y si la calidad sirve para un aviso. " +
    'Respondé SOLO JSON: {"1": "...", "2": "...", ...}';
  const r = await gpt([{ type: "text", text: pedido }, ...con.map((x) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${x.b64}`, detail: "low" } }))], 4000);
  const out: Vistas = {};
  con.forEach((x, i) => {
    const d = r?.[String(i + 1)];
    if (typeof d === "string" && d.trim()) out[x.a.id] = `${x.a.tipo === "video" ? "[video] " : ""}${d.trim().slice(0, 240)}`;
  });
  return out;
}

const etiqueta = (a: ArchivoDrive) =>
  `\`${a.id}\` ${a.tipo}${a.w && a.h ? ` ${a.w}×${a.h}` : ""}${a.seg ? ` ${a.seg}s` : ""}${a.mb != null ? ` ${a.mb}MB` : ""} · ${a.n} · ${a.fecha}`;

/** Busca en el Drive del cliente lo que muestra `producto`. Devuelve texto para el agente. */
export async function buscarMaterial(db: Db, p: { cliente: string; producto: string; tipo?: "foto" | "video" | "todo"; cantidad?: number }): Promise<string> {
  const c = await resolverCliente(db, p.cliente);
  if ("error" in c) return c.error;
  const producto = (p.producto ?? "").trim();
  if (producto.length < 3) return "Decime qué buscar (producto, servicio o escena).";
  const { indice, error } = await indiceDrive(db, c.id);
  if (!indice) return `No se pudo leer el Drive de ${c.name}: ${error ?? "sin datos"}.`;

  const tipos = p.tipo === "foto" ? ["foto"] : p.tipo === "video" ? ["video"] : ["foto", "video"];
  const candidatos = indice.archivos.filter((a) => tipos.includes(a.tipo));
  if (!candidatos.length) return `${c.name} no tiene ${tipos.join(" ni ")} en el Drive indexado.`;

  // Primero se miran los que el nombre ya sugiere, después los más nuevos.
  const vistas = await vistasGuardadas(db, c.id);
  const palabras = palabrasDePedido(producto);
  const terminos = [...indice.terminos, c.name];
  const pendientes = candidatos
    .filter((a) => !vistas[a.id])
    .map((a) => ({ a, p: puntaje(textoSinCliente(`${a.n} ${a.ruta}`, terminos), palabras) }))
    .sort((x, y) => y.p - x.p || y.a.fecha.localeCompare(x.a.fecha))
    .slice(0, NUEVOS_POR_BUSQUEDA)
    .map((x) => x.a);
  let nuevas = 0;
  for (let i = 0; i < pendientes.length; i += POR_LOTE * 3) {
    const tandas = [];
    for (let j = i; j < Math.min(i + POR_LOTE * 3, pendientes.length); j += POR_LOTE) tandas.push(describir(pendientes.slice(j, j + POR_LOTE)).catch(() => ({})));
    for (const v of await Promise.all(tandas)) { Object.assign(vistas, v); nuevas += Object.keys(v).length; }
  }
  if (nuevas) await guardarVistas(db, c.id, vistas);

  const mirados = candidatos.filter((a) => vistas[a.id]);
  const sinMirar = candidatos.length - mirados.length;
  if (!mirados.length) return `No pude mirar el material de ${c.name} (miniaturas o modelo no disponibles).`;

  // GPT elige entre las descripciones (texto solo, barato).
  const lista = mirados.slice(0, 900).map((a, i) => `${i + 1}. ${vistas[a.id]} (archivo: ${a.n})`).join("\n");
  const cantidad = Math.min(30, Math.max(3, Math.round(p.cantidad ?? 12)));
  const r = await gpt([{
    type: "text",
    text: `Pedido: material de «${producto}» para una pieza de ${c.name}. Abajo, lo que muestra cada archivo de su Drive. ` +
      `Elegí hasta ${cantidad}, del más útil al menos útil: primero los que muestran exactamente «${producto}», sin texto ni logos ajenos sobreimpresos y con buena calidad. ` +
      'No elijas nada que no muestre lo pedido. Respondé SOLO JSON: {"elegidos": [{"n": número, "por_que": "≤12 palabras"}]}\n\n' + lista,
  }], 3000);
  const elegidos = (Array.isArray(r?.elegidos) ? r!.elegidos : []) as Array<{ n?: number; por_que?: string }>;
  const acceso = firmarAcceso(c.id);
  const L: string[] = [`# Material de «${producto}» · ${c.name}`, `Miré ${mirados.length} de ${candidatos.length} ${tipos.join(" y ")}${nuevas ? ` (${nuevas} nuevos ahora)` : ""}.`];
  if (sinMirar > 0) L.push(`Quedan ${sinMirar} sin mirar: si no aparece lo que buscás, llamá de nuevo y miro los siguientes.`);
  const filas = elegidos.map((e) => ({ a: mirados[(e.n ?? 0) - 1], porque: e.por_que })).filter((x) => x.a);
  if (!filas.length) L.push(`Ninguno de los mirados muestra «${producto}».${sinMirar > 0 ? " Llamá de nuevo para mirar más." : " Pedile al cliente fotos o videos."}`);
  for (const f of filas) L.push(`- ${etiqueta(f.a)}\n  Se ve: ${vistas[f.a.id]}${f.porque ? ` · ${f.porque}` : ""}`);
  if (acceso && filas.length) {
    L.push(
      "",
      `Descargar (vence ${acceso.vence.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}): ${URL_BASE()}/api/public/material/<id>?t=${acceso.token}`,
      "Ver en Drive: https://drive.google.com/file/d/<id>/view",
    );
  }
  return L.join("\n");
}
