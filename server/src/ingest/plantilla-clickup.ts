// LMTM-OS: el contenido de la plantilla de ClickUp NO es contenido del cliente.
//
// El equipo crea la carpeta de cada cliente desde una plantilla de ClickUp. Esa
// plantilla se armó copiando dos carpetas reales:
//   - "Cliente Inmobiliario": su OnBoarding trae objetivos de inmobiliaria
//     ("1. Incrementar el número de propiedades captadas", "ALQUILER", "VENTAS").
//     Está en ~70 carpetas, gomerías y hoteles incluidos.
//   - "Cliente Natural": su Super Redes trae posteos de productos naturales
//     ("De la tierra a tu hogar: los ingredientes naturales…").
// El 07/07 el review de contenido leyó esos posteos como si fueran del cliente y
// guardó "productos naturales" en la memoria de Distrillantas, LoMasFundas,
// ALTECNO, Workera, CARVUK, Rosario Burletes y (el 03/09) Randstad. Los agentes
// lo tomaron como verdad, y en LoMasFundas hasta "corrigieron" el rubro.
//
// Acá se filtra: una tarea cuyo nombre es idéntico a una de las carpetas de
// origen, en la carpeta de OTRO cliente, es plantilla y no se lee como contexto.
// La solución de fondo es limpiar la plantilla en ClickUp (la usa el equipo,
// no el código); esto evita que el sistema vuelva a aprender de ella mientras.

const CU_API = "https://api.clickup.com/api/v2";

/** Carpetas de origen de la plantilla. Se pueden cambiar sin deploy de código. */
export const FOLDERS_ORIGEN_PLANTILLA: string[] = (process.env.LMTM_CLICKUP_FOLDERS_PLANTILLA ?? "90133651765,90134249666")
  .split(",").map((s) => s.trim()).filter(Boolean);

/** Normaliza un nombre de tarea para comparar: minúsculas, sin acentos, espacios simples. */
export function normalizarNombre(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Saca las tareas que son de la plantilla. Pura.
 * `plantilla` = nombre normalizado → carpeta de origen. Si la carpeta propia
 * del cliente ES la carpeta de origen (p. ej. Cliente Natural leyendo sus
 * propios posteos), no se filtra nada: para ese cliente es contenido real.
 */
export function sinPlantilla<T>(items: T[], nombre: (t: T) => string, plantilla: Map<string, string>, folderPropio: string | null): T[] {
  if (plantilla.size === 0) return items;
  return items.filter((t) => {
    const origen = plantilla.get(normalizarNombre(nombre(t)));
    return !origen || origen === folderPropio;
  });
}

// ── Lo que nació con la carpeta ──────────────────────────────────────────────
//
// El filtro por nombre no alcanza: Randstad (27/08) se creó duplicando la carpeta
// de Cliente Natural cuando era el sandbox, con 70 ideas de prueba
// ("…un producto de Cliente Natural…", etiqueta idea-lmtm-os) que después se
// borraron del origen. Ya no hay contra qué comparar el nombre.
//
// Lo que sí queda es la huella de la copia: todo lo duplicado se crea en bloque
// en los minutos en que nace la carpeta (Distrillantas: OnBoarding 08:03:58,
// Super Redes 08:07:26). Las ideas y posteos reales llegan horas o días después.

/** Minutos después del nacimiento de la carpeta en los que una tarea cuenta como copiada. */
export const VENTANA_COPIA_MIN = 30;

/** ¿La tarea se creó en el bloque de la copia de la carpeta? Pura. */
export function nacioConLaCarpeta(creadaMs: number | null, nacimientoMs: number | null): boolean {
  if (creadaMs == null || nacimientoMs == null) return false; // sin dato no se descarta nada
  return creadaMs - nacimientoMs < VENTANA_COPIA_MIN * 60_000;
}

const nacimientos = new Map<string, number | null>();

/**
 * Cuándo nació la carpeta: la tarea más vieja de su lista OnBoarding (que siempre
 * viene en la copia). Se cachea: el nacimiento no cambia. Null si no se puede saber.
 */
export async function nacimientoCarpeta(token: string, folderId: string): Promise<number | null> {
  if (nacimientos.has(folderId)) return nacimientos.get(folderId)!;
  const H = { Authorization: token, "Content-Type": "application/json" };
  try {
    const lists = (await (await fetch(`${CU_API}/folder/${folderId}/list?archived=false`, { headers: H })).json()) as {
      lists?: Array<{ id: string; name: string }>;
    };
    const onboarding = (lists.lists ?? []).find((l) => /onboarding/i.test(l.name));
    if (!onboarding) { nacimientos.set(folderId, null); return null; }
    const r = (await (await fetch(
      `${CU_API}/list/${onboarding.id}/task?include_closed=true&subtasks=true&order_by=created&reverse=true&page=0`,
      { headers: H },
    )).json()) as { tasks?: Array<{ date_created?: string }> };
    const fechas = (r.tasks ?? []).map((t) => Number(t.date_created)).filter((n) => Number.isFinite(n) && n > 0);
    const nacimiento = fechas.length ? Math.min(...fechas) : null;
    nacimientos.set(folderId, nacimiento);
    return nacimiento;
  } catch {
    return null; // no se cachea: se reintenta en la próxima pasada
  }
}

let cache: { at: number; nombres: Map<string, string> } | null = null;
const TTL_MS = 6 * 3600_000;

/**
 * Nombres de las tareas de las carpetas de origen (todas las listas, cerradas
 * incluidas). Se cachea 6 h. Si ClickUp falla devuelve el último mapa conocido
 * o uno vacío: filtrar de menos es preferible a cortar la generación entera.
 */
export async function nombresDePlantilla(token: string): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.nombres;
  const H = { Authorization: token, "Content-Type": "application/json" };
  const nombres = new Map<string, string>();
  try {
    for (const folderId of FOLDERS_ORIGEN_PLANTILLA) {
      const lists = (await (await fetch(`${CU_API}/folder/${folderId}/list?archived=false`, { headers: H })).json()) as {
        lists?: Array<{ id: string }>;
      };
      for (const l of lists.lists ?? []) {
        for (let page = 0; page < 20; page++) {
          const r = (await (await fetch(`${CU_API}/list/${l.id}/task?include_closed=true&subtasks=true&page=${page}`, { headers: H })).json()) as {
            tasks?: Array<{ name?: string }>; last_page?: boolean;
          };
          for (const t of r.tasks ?? []) if (t.name) nombres.set(normalizarNombre(t.name), folderId);
          if (r.last_page !== false || (r.tasks ?? []).length < 100) break;
        }
      }
    }
    cache = { at: Date.now(), nombres };
    return nombres;
  } catch {
    return cache?.nombres ?? new Map();
  }
}
