// LMTM-OS: por dónde se genera el contenido de Higgsfield.
//
// Hay DOS vías con bolsas de créditos SEPARADAS:
//
//  1. EL PLAN (higgsfield-cli.ts) — la suscripción Plus que la agencia ya paga.
//     Sus créditos solo se gastan por la cuenta de usuario, o sea por la CLI.
//     Es la vía por defecto: está pagada, se usa.
//
//  2. EL API (higgsfield-api.ts) — platform.higgsfield.ai, credenciales de
//     servidor que no vencen. Bolsa aparte, se paga por uso (~US$0,09 el video).
//
// Se prueba el plan primero y se cae al API SOLO si el plan se quedó sin
// créditos o su sesión murió. Así el gasto extra ocurre únicamente cuando la
// alternativa es no generar nada, y el equipo no se queda esperando.
//
// Cada generación que sale bien deja una fila en contenido_gastos con la
// herramienta, el modelo y lo que cotizó (pedido 11/10: "tener control sobre
// cómo fueron utilizados los tokens de cada una"). Quién la pidió y para qué
// pieza llega por conGasto(), sin pasar parámetros por toda la cadena.

import { AsyncLocalStorage } from "node:async_hooks";
import type { Db } from "@paperclipai/db";
import { contenidoGastos } from "@paperclipai/db";
import {
  creditosPlan, generarImagenPlan, generarVideoPlan, hayPlan,
} from "./higgsfield-cli.js";
import {
  generarImagen as generarImagenApi, generarVideo as generarVideoApi,
  hayCredenciales as hayApi, MODELO_IMAGEN as MODELO_IMAGEN_API,
  MODELO_VIDEO as MODELO_VIDEO_API, MODELO_VIDEO_DESDE_IMAGEN, SinCreditos,
} from "./higgsfield-api.js";

import { generarImagenMagnific, hayMagnific, MODELO_MAGNIFIC } from "./magnific.js";

export { SinCreditos };

/** Debajo de esto no se arranca una generación con el plan: un reel son 3
 *  clips y quedarse a mitad de camino es peor que no empezar. */
const PISO_PLAN = 30;

export type Herramienta = "higgsfield_plan" | "higgsfield_api" | "magnific";

export interface Generado {
  url: string;
  jobId?: string;
  /** De dónde salieron los créditos — queda en el deliverable para auditar. */
  via: "plan" | "api" | "magnific";
  herramienta: Herramienta;
  modelo: string;
  /** Lo que cotizó la herramienta para este pedido. null = no lo informó. */
  creditos: number | null;
  usd: number | null;
}

/** Quién pidió la generación y para qué pieza. */
export interface ContextoGasto {
  origen: "clickup" | "panel" | "claude";
  clientId?: string | null;
  /** id de la tarea de ClickUp, o `libre:<uuid>` si no salió de una tarea. */
  pieza?: string | null;
}

const contexto = new AsyncLocalStorage<ContextoGasto>();

/** Corre `fn` con el contexto que va a quedar en cada fila de contenido_gastos. */
export const conGasto = <T>(ctx: ContextoGasto, fn: () => Promise<T>): Promise<T> => contexto.run(ctx, fn);

async function anotar(db: Db, g: Generado, tipo: "video" | "imagen"): Promise<Generado> {
  const ctx = contexto.getStore();
  // El registro es de más: si falla la escritura, el contenido igual se entrega.
  await db.insert(contenidoGastos).values({
    clientId: ctx?.clientId ?? null,
    pieza: ctx?.pieza ?? null,
    origen: ctx?.origen ?? "panel",
    herramienta: g.herramienta,
    modelo: g.modelo,
    tipo,
    creditos: g.creditos,
    usd: g.usd,
    url: g.url,
    jobId: g.jobId ?? null,
  }).catch((e) => console.warn("[higgsfield] no se pudo anotar el gasto:", e instanceof Error ? e.message : e));
  return g;
}

export interface EstadoHiggsfield {
  ok: boolean;
  via: "plan" | "api" | null;
  creditosPlan: number | null;
  motivo: string | null;
}

/** Qué vía está disponible ahora mismo, para mostrarlo en el panel. */
export async function estado(db: Db): Promise<EstadoHiggsfield> {
  if (sinHiggsfield()) {
    return { ok: hayMagnific(), via: null, creditosPlan: null, motivo: "Higgsfield dado de baja: el contenido lo arma el agente Productor de contenido (imágenes de Magnific)" };
  }
  if (hayPlan()) {
    const { creditos: c, error } = await creditosPlan(db);
    if (c != null && c >= PISO_PLAN) return { ok: true, via: "plan", creditosPlan: c, motivo: null };
    const porQue = c == null ? `no se pudo leer el plan (${error ?? "sin detalle"})` : `al plan le quedan ${c} créditos`;
    if (hayApi()) return { ok: true, via: "api", creditosPlan: c, motivo: `${porQue} — se genera con la API` };
    return { ok: false, via: null, creditosPlan: c, motivo: `${porQue} y no hay API como respaldo` };
  }
  if (hayApi()) return { ok: true, via: "api", creditosPlan: null, motivo: null };
  return { ok: false, via: null, creditosPlan: null, motivo: "no hay ni plan ni credenciales de API configuradas" };
}

/** true si el error del plan justifica intentar por la API. */
function convieneReintentar(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /session expired|not authenticated|hf auth login|not enough credits|insufficient/.test(m);
}

export async function generarVideo(
  db: Db,
  prompt: string,
  opts: { imagenUrl?: string | null } = {},
): Promise<Generado> {
  if (sinHiggsfield()) {
    throw new Error("Higgsfield ya no está (28/10): los videos los arma el agente Productor de contenido. Pedíselo con un issue o la etiqueta 'generar contenido'.");
  }
  if (hayPlan()) {
    try {
      const r = await generarVideoPlan(db, prompt, opts);
      return anotar(db, { ...r, via: "plan", herramienta: "higgsfield_plan", usd: null }, "video");
    } catch (e) {
      if (!hayApi() || !convieneReintentar(e)) throw e;
      console.warn(`[higgsfield] el plan no pudo generar (${e instanceof Error ? e.message : e}) — voy por la API.`);
    }
  }
  const r = await generarVideoApi(prompt, opts);
  return anotar(db, {
    url: r.url, jobId: r.requestId, via: "api", herramienta: "higgsfield_api",
    modelo: opts.imagenUrl ? MODELO_VIDEO_DESDE_IMAGEN : MODELO_VIDEO_API, creditos: r.creditos, usd: r.usd,
  }, "video");
}

/** 28/10: la agencia dio de baja Higgsfield. Imágenes → Magnific; piezas terminadas → Productor de contenido. */
export const sinHiggsfield = (): boolean => process.env.LMTM_SIN_HIGGSFIELD === "1";

export async function generarImagen(
  db: Db,
  prompt: string,
  opts: { referencias?: string[]; aspect?: "3:4" | "9:16"; soloMagnific?: boolean } = {},
): Promise<Generado> {
  // Pedido explícito de Magnific (desde Claude o el panel), o ya sin Higgsfield.
  if (opts.soloMagnific || sinHiggsfield()) return conMagnific(db, prompt, opts.aspect ?? "3:4");
  if (hayPlan()) {
    try {
      // Sin aspect explícito: lo decide generarImagenPlan según el modelo. Acá
      // decía "4:5" fijo y Soul lo rechaza ("allowed: 1:1,16:9,9:16,4:3,3:4…"),
      // así que con el router de modelos nuevo TODAS las placas del plan habrían
      // fallado antes de generar.
      const r = await generarImagenPlan(db, prompt, { referencias: opts.referencias, aspect: opts.aspect });
      return anotar(db, { ...r, via: "plan", herramienta: "higgsfield_plan", usd: null }, "imagen");
    } catch (e) {
      if (!hayApi() || !convieneReintentar(e)) throw e;
      console.warn(`[higgsfield] el plan no pudo generar la placa (${e instanceof Error ? e.message : e}) — voy por la API.`);
    }
  }
  // El API no acepta 4:5 (rechaza con literal_error aunque su openapi lo liste);
  // 3:4 es la vertical más cercana.
  try {
    const r = await generarImagenApi(prompt, { aspect: opts.aspect ?? "3:4" });
    return anotar(db, {
      url: r.url, jobId: r.requestId, via: "api", herramienta: "higgsfield_api",
      modelo: MODELO_IMAGEN_API, creditos: r.creditos, usd: r.usd,
    }, "imagen");
  } catch (e) {
    // Tercera vía: Magnific. Solo si está configurada — si no, se propaga el
    // error de Higgsfield, que es el que de verdad explica qué pasó.
    if (!hayMagnific()) throw e;
    console.warn(`[higgsfield] la API tampoco pudo (${e instanceof Error ? e.message : e}) — voy por Magnific.`);
    return conMagnific(db, prompt, opts.aspect ?? "3:4");
  }
}

async function conMagnific(db: Db, prompt: string, aspect: string): Promise<Generado> {
  const r = await generarImagenMagnific(prompt, { aspect });
  // Magnific no devuelve el costo del pedido: queda null, no se inventa.
  return anotar(db, {
    url: r.url, jobId: r.jobId, via: "magnific", herramienta: "magnific",
    modelo: MODELO_MAGNIFIC, creditos: null, usd: null,
  }, "imagen");
}
