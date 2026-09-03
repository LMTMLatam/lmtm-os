// LMTM-OS: qué se genera según el "Tipo de Contenido" de ClickUp (decisión del
// usuario 14/8: una sola etiqueta "generar contenido", el tipo lo decide el
// campo que el equipo ya carga).
//
//   Post / Placa              → 1 placa
//   Carrusel                  → N placas (N lo decide el contenido, 3-7)
//   Clip corto / Story        → 1 clip de 8s
//   Reel / Video Largo        → 3 clips de 8s pegados con ffmpeg
//
// El costo de cada uno está en CREDITOS_APROX para que el panel avise antes.

export type Formato = "placa" | "carrusel" | "clip" | "reel" | "ninguno";

export interface PlanContenido {
  formato: Formato;
  /** Cuántas piezas: placas del carrusel, o clips del reel. */
  piezas: number;
  creditosAprox: number;
}

/** Clips de 8s por reel y placas por carrusel cuando el contenido no dice otra cosa. */
const CLIPS_REEL = 3;
const PLACAS_CARRUSEL_DEFECTO = 5;
const COSTO_CLIP = 8;
const COSTO_PLACA = 4;

/**
 * El campo "Tipo de Contenido" es un dropdown que cada cliente configuró a su
 * manera ("Clip Corto", "clip corto", "Reel", "Video Largo", "Post",
 * "Carrusel"…), así que se matchea por regex y no por igualdad.
 */
export function formatoDe(tipoContenido: string | null | undefined, textoPieza = ""): Formato {
  // Si el campo está vacío se lee el TÍTULO. Las ideas viejas (y las que carga
  // el equipo a mano) no tienen el dropdown puesto, y una tarea llamada "Reel de
  // transformación de terreno baldío…" terminaba generando UNA placa (probado
  // 17/8 contra las 90 ideas de GRUPO MA: 5 de 5 sin tipo). El título dice el
  // formato en la primera palabra; ignorarlo era tirar la señal más clara.
  const t = ((tipoContenido ?? "").trim() || tituloComoTipo(textoPieza))
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Las 12 opciones reales del dropdown, iguales en las 58 listas (verificado
  // contra ClickUp 14/8): Post, Story, Articulo, Blog, Guia, Tips y Trucos,
  // Video Largo, Clip corto, Vivo, Photo Post, Carrusel, Reel.
  if (/vivo|en vivo|live/.test(t)) return "ninguno";           // un vivo no se genera
  if (/reel|video largo/.test(t)) return "reel";                // 3 clips pegados
  if (/clip corto|clip|short/.test(t)) return "clip";           // 1 clip de 8s
  // Story NO es un clip: el agente las escribe como secuencias de 8-10 frames
  // con texto y visual por frame (verificado en las ideas reales del 15/8), o
  // sea placas verticales. Mandarlo a un clip de 8s generaba otra cosa.
  if (/story|historia/.test(t)) return "carrusel";
  if (/carrusel|carousel|tips y trucos|guia/.test(t)) return "carrusel";
  if (/articulo|blog/.test(t)) return "placa";                  // placa de portada del texto
  if (/post|photo post|placa|imagen|feed/.test(t)) return "placa";
  // Sin tipo cargado: la placa es lo más barato y lo más fácil de descartar.
  return "placa";
}

/**
 * Busca el formato en el texto de la pieza, para cuando el dropdown está vacío.
 *
 * Solo mira las primeras palabras del TÍTULO: "Reel: tour por…" o "Carrusel
 * proceso de obra" lo dicen ahí. Más adentro la palabra suele ser del copy
 * ("…ideal para un reel") y no es una instrucción de formato.
 */
function tituloComoTipo(textoPieza: string): string {
  const titulo = textoPieza.split("\n")[0].slice(0, 60).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = titulo.match(/\b(reel|carrusel|carousel|clip corto|clip|story|historia|video largo|photo post|post|placa|articulo|blog|vivo|en vivo)\b/);
  return m ? m[1] : "";
}

/** Las 12 opciones tal cual están en ClickUp, para que el agente elija de acá
 *  al crear una idea y el campo quede completado. */
export const OPCIONES_TIPO = [
  "Post", "Photo Post", "Story", "Carrusel", "Tips y Trucos", "Guia",
  "Clip corto", "Reel", "Video Largo", "Vivo", "Articulo", "Blog",
] as const;

/**
 * Cuántas placas tiene el carrusel. El usuario pidió que "lo decida el
 * contenido": si el equipo escribió un número en el nombre o la descripción
 * ("carrusel 6", "7 pasos"), se respeta; si no, 5. Se acota a 3-10 para que un
 * número suelto en el copy no dispare un carrusel de 40 placas.
 */
export function placasDelCarrusel(texto: string): number {
  const m = texto.match(/carrusel\s*(?:de\s*)?(\d{1,2})/i) ?? texto.match(/\b(\d{1,2})\s*(?:placas|slides|pasos|tips|claves)\b/i);
  const n = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(n)) return PLACAS_CARRUSEL_DEFECTO;
  return Math.min(10, Math.max(3, n));
}

export function planDe(tipoContenido: string | null | undefined, textoPieza = ""): PlanContenido {
  const formato = formatoDe(tipoContenido, textoPieza);
  switch (formato) {
    case "carrusel": {
      const piezas = placasDelCarrusel(textoPieza);
      return { formato, piezas, creditosAprox: piezas * COSTO_PLACA };
    }
    case "reel":
      return { formato, piezas: CLIPS_REEL, creditosAprox: CLIPS_REEL * COSTO_CLIP };
    case "clip":
      return { formato, piezas: 1, creditosAprox: COSTO_CLIP };
    case "ninguno":
      return { formato, piezas: 0, creditosAprox: 0 };
    case "placa":
    default:
      return { formato, piezas: 1, creditosAprox: COSTO_PLACA };
  }
}

export const ES_VIDEO = (f: Formato): boolean => f === "clip" || f === "reel";
