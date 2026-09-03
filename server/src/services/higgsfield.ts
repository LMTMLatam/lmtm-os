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

import type { Db } from "@paperclipai/db";
import {
  creditosPlan, generarImagenPlan, generarVideoPlan, hayPlan, MODELO_VIDEO_PLAN,
} from "./higgsfield-cli.js";
import {
  generarImagen as generarImagenApi, generarVideo as generarVideoApi,
  hayCredenciales as hayApi, MODELO_VIDEO as MODELO_VIDEO_API, SinCreditos,
} from "./higgsfield-api.js";

import { generarImagenMagnific, hayMagnific } from "./magnific.js";

export { SinCreditos };

/** Debajo de esto no se arranca una generación con el plan: un reel son 3
 *  clips y quedarse a mitad de camino es peor que no empezar. */
const PISO_PLAN = 30;

export interface Generado {
  url: string;
  jobId?: string;
  /** De dónde salieron los créditos — queda en el deliverable para auditar. */
  via: "plan" | "api";
  modelo: string;
}

export interface EstadoHiggsfield {
  ok: boolean;
  via: "plan" | "api" | null;
  creditosPlan: number | null;
  motivo: string | null;
}

/** Qué vía está disponible ahora mismo, para mostrarlo en el panel. */
export async function estado(db: Db): Promise<EstadoHiggsfield> {
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
  if (hayPlan()) {
    try {
      const r = await generarVideoPlan(db, prompt, opts);
      return { ...r, via: "plan", modelo: MODELO_VIDEO_PLAN };
    } catch (e) {
      if (!hayApi() || !convieneReintentar(e)) throw e;
      console.warn(`[higgsfield] el plan no pudo generar (${e instanceof Error ? e.message : e}) — voy por la API.`);
    }
  }
  const r = await generarVideoApi(prompt, opts);
  return { url: r.url, jobId: r.requestId, via: "api", modelo: MODELO_VIDEO_API };
}

export async function generarImagen(
  db: Db,
  prompt: string,
  opts: { referencias?: string[] } = {},
): Promise<Generado> {
  if (hayPlan()) {
    try {
      // Sin aspect explícito: lo decide generarImagenPlan según el modelo. Acá
      // decía "4:5" fijo y Soul lo rechaza ("allowed: 1:1,16:9,9:16,4:3,3:4…"),
      // así que con el router de modelos nuevo TODAS las placas del plan habrían
      // fallado antes de generar.
      const r = await generarImagenPlan(db, prompt, { referencias: opts.referencias });
      return { ...r, via: "plan", modelo: "plan" };
    } catch (e) {
      if (!hayApi() || !convieneReintentar(e)) throw e;
      console.warn(`[higgsfield] el plan no pudo generar la placa (${e instanceof Error ? e.message : e}) — voy por la API.`);
    }
  }
  // El API no acepta 4:5 (rechaza con literal_error aunque su openapi lo liste);
  // 3:4 es la vertical más cercana.
  try {
    const r = await generarImagenApi(prompt, { aspect: "3:4" });
    return { url: r.url, jobId: r.requestId, via: "api", modelo: "api" };
  } catch (e) {
    // Tercera vía: Magnific. Solo si está configurada — si no, se propaga el
    // error de Higgsfield, que es el que de verdad explica qué pasó.
    if (!hayMagnific()) throw e;
    console.warn(`[higgsfield] la API tampoco pudo (${e instanceof Error ? e.message : e}) — voy por Magnific.`);
    const r = await generarImagenMagnific(prompt, { aspect: "3:4" });
    return { url: r.url, jobId: r.jobId, via: "api", modelo: "magnific" };
  }
}
