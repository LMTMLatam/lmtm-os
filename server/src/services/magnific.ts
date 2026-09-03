// LMTM-OS: Magnific como respaldo de imagen (pedido 18/8).
//
// TERCERA VÍA de generación de placas, después del plan de Higgsfield y de su
// API. Entra en juego solo cuando las dos anteriores no pueden: sin créditos,
// sesión caída o el modelo devolviendo error.
//
// Magnific (freepik.com/api, línea Mystic) genera y además escala. Acá se usa
// para GENERAR: el escalado no nos sirve de respaldo porque necesita una imagen
// de entrada, y si Higgsfield no generó, no hay nada que escalar.
//
// PARA ACTIVARLO hace falta MAGNIFIC_API_KEY en las variables de Railway. Sin
// esa variable el módulo queda inerte y el sistema se comporta igual que antes:
// nunca rompe por estar a medio configurar.

const BASE = process.env.MAGNIFIC_API_BASE ?? "https://api.freepik.com/v1/ai";
const MODELO = process.env.MAGNIFIC_MODELO ?? "mystic";

export const hayMagnific = (): boolean => !!process.env.MAGNIFIC_API_KEY?.trim();

/** Cuánto esperar a que termine un trabajo antes de rendirse. Mystic tarda
 *  entre 20s y 2 min según carga. */
const ESPERA_MAX_MS = 4 * 60_000;
const INTERVALO_MS = 4_000;

interface RespuestaTrabajo {
  data?: { task_id?: string; status?: string; generated?: string[] };
}

async function pedir<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.MAGNIFIC_API_KEY?.trim();
  if (!key) throw new Error("falta MAGNIFIC_API_KEY");
  const r = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "x-freepik-api-key": key,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Magnific ${path} → ${r.status}: ${txt.slice(0, 300)}`);
  try {
    return JSON.parse(txt) as T;
  } catch {
    throw new Error(`Magnific ${path} devolvió algo que no es JSON: ${txt.slice(0, 200)}`);
  }
}

/**
 * Genera una placa vertical con Magnific.
 *
 * Devuelve la misma forma que las otras vías (url + jobId) para que el
 * despachador de higgsfield.ts pueda encadenarla sin casos especiales.
 */
export async function generarImagenMagnific(
  prompt: string,
  opts: { aspect?: string } = {},
): Promise<{ url: string; jobId?: string }> {
  const creado = await pedir<RespuestaTrabajo>(`/mystic`, {
    method: "POST",
    body: {
      prompt,
      // Magnific nombra los formatos por su uso, no por la razón numérica.
      aspect_ratio: opts.aspect === "9:16" ? "social_story_9_16" : "traditional_3_4",
      model: MODELO,
    },
  });
  const taskId = creado.data?.task_id;
  if (!taskId) throw new Error("Magnific no devolvió task_id");

  const limite = Date.now() + ESPERA_MAX_MS;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
    const estado = await pedir<RespuestaTrabajo>(`/mystic/${encodeURIComponent(taskId)}`);
    const s = (estado.data?.status ?? "").toUpperCase();
    if (s === "COMPLETED") {
      const url = estado.data?.generated?.[0];
      if (!url) throw new Error("Magnific terminó sin imagen");
      return { url, jobId: taskId };
    }
    if (s === "FAILED") throw new Error("Magnific falló al generar");
  }
  throw new Error(`Magnific no terminó en ${Math.round(ESPERA_MAX_MS / 60_000)} minutos`);
}
