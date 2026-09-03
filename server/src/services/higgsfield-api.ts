// LMTM-OS: cliente del API de plataforma de Higgsfield.
//
// POR QUÉ EXISTE (15/8): antes hablábamos con Higgsfield por su CLI (binario
// `hf`), que autentica con OAuth de navegador. Ese token dura ~1h, se refresca
// solo y el refresh_token ROTA en cada uso: dos procesos refrescando a la vez
// (pasa en cada deploy, cuando Railway tiene dos contenedores vivos) rompían la
// cadena y había que re-loguear A MANO con un navegador. Pasó tres veces en un
// día.
//
// platform.higgsfield.ai es otra puerta: credenciales de servidor que NO
// vencen ni rotan, y no está detrás del Cloudflare que obligaba a usar el
// binario. Es la vía que la propia doc recomienda para servidores.
//
// El ciclo es asíncrono: POST al modelo → request_id → polling → result.

const BASE = process.env.HIGGSFIELD_API_URL ?? "https://platform.higgsfield.ai";

/** Modelos por defecto, elegidos por precio/calidad con los costos REALES
 *  medidos contra el endpoint /estimate (15/8):
 *    soul/standard  imagen ............ US$0,094
 *    hailuo-02 std  texto→video ....... US$0,090
 *    dop/lite       imagen→video ...... US$0,125
 *  OJO: Veo 3.1 y Seedance NO están habilitados en el API de plataforma
 *  (devuelven model_not_found) aunque sí aparezcan en la app. */
export const MODELO_IMAGEN = process.env.HIGGSFIELD_MODELO_IMG ?? "higgsfield-ai/soul/standard";
export const MODELO_VIDEO = process.env.HIGGSFIELD_MODELO ?? "minimax/hailuo-02/standard/text-to-video";
export const MODELO_VIDEO_DESDE_IMAGEN = process.env.HIGGSFIELD_MODELO_IMG2VID ?? "higgsfield-ai/dop/lite";

function credenciales(): { id: string; secret: string } | null {
  const id = process.env.HIGGSFIELD_KEY_ID?.trim();
  const secret = process.env.HIGGSFIELD_KEY_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

export function hayCredenciales(): boolean {
  return credenciales() != null;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: T | null; error: string | null }> {
  const c = credenciales();
  if (!c) return { ok: false, status: 0, body: null, error: "faltan HIGGSFIELD_KEY_ID / HIGGSFIELD_KEY_SECRET" };
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Key ${c.id}:${c.secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const txt = await r.text();
  let body: T | null = null;
  try { body = txt ? (JSON.parse(txt) as T) : null; } catch { /* respuesta no-JSON */ }
  if (!r.ok) {
    const d = (body as { detail?: unknown } | null)?.detail;
    const error = typeof d === "string" ? d : txt.slice(0, 300);
    return { ok: false, status: r.status, body, error };
  }
  return { ok: true, status: r.status, body, error: null };
}

export class SinCreditos extends Error {
  constructor() { super("La cuenta de API de Higgsfield se quedó sin créditos. Cargá saldo en cloud.higgsfield.ai."); }
}

/** Costo de una generación ANTES de pedirla, en créditos y dólares. */
export async function estimar(modelo: string, params: Record<string, unknown>): Promise<{ credits: number; usd: number } | null> {
  const r = await api<{ credits?: string; usd?: string }>(`/estimate/${modelo}`, { method: "POST", body: JSON.stringify(params) });
  if (!r.ok || !r.body) return null;
  return { credits: Number(r.body.credits ?? 0), usd: Number(r.body.usd ?? 0) };
}

interface EstadoRequest {
  status?: string;
  results?: Array<{ url?: string; raw?: { url?: string }; min?: { url?: string } }>;
  result?: { url?: string };
  error?: string;
}

/** Estados terminales del ciclo asíncrono. */
const LISTO = /^(completed|succeeded|success)$/i;
const FALLIDO = /^(failed|canceled|cancelled|nsfw|error)$/i;

/**
 * Manda la generación y espera el resultado. Devuelve la URL del archivo.
 *
 * El polling arranca cada 5s y se va espaciando: un video tarda 1-3 min y
 * machacar el endpoint cada segundo solo suma carga sin acelerar nada.
 */
export async function generar(
  modelo: string,
  params: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<{ url: string; requestId: string }> {
  const envio = await api<{ request_id?: string; id?: string }>(`/${modelo}`, { method: "POST", body: JSON.stringify(params) });
  if (!envio.ok) {
    if (envio.error === "not_enough_credits") throw new SinCreditos();
    throw new Error(`Higgsfield ${modelo}: ${envio.error ?? `HTTP ${envio.status}`}`);
  }
  const requestId = envio.body?.request_id ?? envio.body?.id;
  if (!requestId) throw new Error(`Higgsfield ${modelo}: no devolvió request_id`);

  const limite = Date.now() + (opts.timeoutMs ?? 12 * 60_000);
  let espera = 5_000;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, espera));
    espera = Math.min(espera * 1.3, 20_000);
    const st = await api<EstadoRequest>(`/requests/${requestId}/status`);
    if (!st.ok) continue; // un 5xx puntual no cancela la espera
    const estado = st.body?.status ?? "";
    if (FALLIDO.test(estado)) throw new Error(`la generación terminó en "${estado}"${st.body?.error ? `: ${st.body.error}` : ""}`);
    if (!LISTO.test(estado)) continue;
    const url = st.body?.results?.[0]?.raw?.url
      ?? st.body?.results?.[0]?.url
      ?? st.body?.result?.url
      ?? st.body?.results?.[0]?.min?.url;
    if (!url) throw new Error("la generación terminó sin archivo");
    return { url, requestId };
  }
  throw new Error(`la generación superó el tiempo de espera (request ${requestId})`);
}

/** Video vertical de 9:16. Si hay imagen de partida usa el modelo de
 *  imagen→video, que respeta la identidad de la pieza del diseñador. */
export async function generarVideo(prompt: string, opts: { imagenUrl?: string | null } = {}): Promise<{ url: string; requestId: string }> {
  if (opts.imagenUrl) {
    return generar(MODELO_VIDEO_DESDE_IMAGEN, { prompt, image_url: opts.imagenUrl });
  }
  return generar(MODELO_VIDEO, { prompt, duration: 6, prompt_optimizer: true });
}

/** Placa vertical. OJO: el API NO acepta 4:5 aunque el openapi publicado diga
 *  que sí — devuelve literal_error. La vertical más cercana es 3:4. */
export async function generarImagen(prompt: string, opts: { aspect?: "3:4" | "9:16" | "1:1" } = {}): Promise<{ url: string; requestId: string }> {
  return generar(MODELO_IMAGEN, { prompt, aspect_ratio: opts.aspect ?? "3:4", num_images: 1 });
}

/**
 * Sondeo de conectividad: credenciales válidas y API alcanzable.
 *
 * OJO — NO prueba que haya saldo. El endpoint /estimate cotiza igual con la
 * cuenta en cero (verificado 15/8), así que un "ok" acá no garantiza que la
 * generación vaya a salir. La falta de créditos se detecta recién al generar
 * (SinCreditos), y ahí el mensaje sí es inequívoco.
 */
export async function puedeGenerar(): Promise<{ ok: boolean; motivo: string | null }> {
  if (!hayCredenciales()) return { ok: false, motivo: "faltan las credenciales de la API (HIGGSFIELD_KEY_ID / HIGGSFIELD_KEY_SECRET)" };
  const r = await api<unknown>(`/estimate/${MODELO_IMAGEN}`, {
    method: "POST",
    body: JSON.stringify({ prompt: "ping", aspect_ratio: "3:4" }),
  });
  if (r.ok) return { ok: true, motivo: null };
  if (r.error === "not_enough_credits") return { ok: false, motivo: "la cuenta de API no tiene créditos — cargar saldo en cloud.higgsfield.ai" };
  return { ok: false, motivo: r.error ?? `HTTP ${r.status}` };
}

/**
 * Prueba REAL de saldo: manda la generación más barata del catálogo y mira si
 * el API la acepta. Cuesta ~US$0,09 cuando hay saldo, así que se usa solo a
 * pedido (no en cada carga del panel).
 */
export async function hayCreditos(): Promise<{ ok: boolean; motivo: string | null }> {
  if (!hayCredenciales()) return { ok: false, motivo: "faltan las credenciales de la API" };
  const r = await api<{ request_id?: string }>(`/${MODELO_IMAGEN}`, {
    method: "POST",
    body: JSON.stringify({ prompt: "a plain grey background", aspect_ratio: "1:1", num_images: 1 }),
  });
  if (r.ok) return { ok: true, motivo: null };
  if (r.error === "not_enough_credits") return { ok: false, motivo: "la cuenta de API no tiene créditos — cargar saldo en cloud.higgsfield.ai" };
  return { ok: false, motivo: r.error ?? `HTTP ${r.status}` };
}
