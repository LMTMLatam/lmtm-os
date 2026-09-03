// LMTM-OS: genera la configuración de un Apps Script Sheet→ClickUp a partir de
// la lista real del cliente en ClickUp y del header real de su planilla.
//
// Por qué existe: hasta 2026-08-25 el onboarding clonaba la plantilla tal cual,
// así que el cliente nuevo heredaba los ids de campo de OTRO cliente. Los
// campos que ClickUp define a nivel espacio coinciden, pero los que se crean por
// carpeta (OKR, por ejemplo) no: el script escribía en el campo de otra lista y
// ClickUp devolvía 404 en silencio. La auditoría encontró 41 clientes así.
//
// Regla: los ids salen SIEMPRE de la API, y COLUMNS sale SIEMPRE del header de
// la planilla. Nunca a mano, nunca copiados de otro cliente.

import { sheetsRead } from "@paperclipai/mcp-google";

const CU_API = "https://api.clickup.com/api/v2";

export type Kind = "text" | "dd" | "labels" | "date";
type Spec = Record<string, { kind: Kind; names: string[] }>;

/** Qué campo de ClickUp corresponde a cada clave del script y cómo lo escribe. */
const REDES: Spec = {
  COPY_OY_SUBTITULO: { kind: "text", names: ["Copy o/y Subtitulo", "Copy o y Subtitulo"] },
  CLIENTE: { kind: "text", names: ["Cliente LMTM", "Cliente"] },
  DISENO_GRAFICO: { kind: "text", names: ["Diseño Grafico", "Diseño Gráfico"] },
  ESCRITOR: { kind: "text", names: ["Escritor"] },
  ENLACE_DE_PUBLICACION: { kind: "text", names: ["Enlace de publicacion", "Enlace de publicación"] },
  DESCRIPCION_DE_PRODUCTO: { kind: "text", names: ["Descripción de producto", "Descripcion de producto"] },
  RUTA_EN_SERVER: { kind: "text", names: ["¿Ruta en server?", "Ruta en server"] },
  ETIQUETAS_EN_PUBLICACION: { kind: "text", names: ["Etiquetas en publicacion", "Etiquetas en publicación"] },
  META_ADS: { kind: "text", names: ["Meta Ads"] },
  OKR: { kind: "text", names: ["OKR"] },
  PROPIEDAD_PROPUESTA: { kind: "text", names: ["Propiedad / Propuesta", "Propiedad/Propuesta"] },
  COMENTARIO_DE_CLIENTE: { kind: "text", names: ["Comentario de cliente"] },
  TIPO_DE_PRODUCTO: { kind: "text", names: ["Tipo de producto"] },
  HORARIO: { kind: "text", names: ["Horario"] },
  ESTADO_DE_PRODUCCION: { kind: "dd", names: ["Estado de producción", "Estado de produccion"] },
  MES_DE_PUBLICACION: { kind: "dd", names: ["Mes de publicacion", "Mes de publicación"] },
  OBJETIVO_DE_CONTENIDO: { kind: "dd", names: ["Objetivo de contenido"] },
  APROBACION_DE_CLIENTE: { kind: "dd", names: ["Aprobación de cliente", "Aprobacion de cliente"] },
  PLATAFORMAS: { kind: "labels", names: ["Plataformas"] },
  ENLACES: { kind: "labels", names: ["Enlaces"] },
  TIPO_DE_CONTENIDO: { kind: "labels", names: ["Tipo de Contenido"] },
  DIA_DE_PUBLICACION: { kind: "date", names: ["Dia de publicacion", "Día de publicación"] },
};

const VIDEO: Spec = {
  GANCHO: { kind: "text", names: ["Gancho"] },
  CIERRE_VIDEO: { kind: "text", names: ["Cierre de video"] },
  COPY_SUBTITULO: { kind: "text", names: ["Copy o/y Subtitulo", "Copy o y Subtitulo"] },
  DESCRIBIR_SET: { kind: "text", names: ["Describir Set"] },
  OBJETIVO_COMERCIAL: { kind: "text", names: ["Objetivo Comercial"] },
  NOMBRE_CLIENTE: { kind: "text", names: ["Nombre de cliente", "Cliente LMTM"] },
  OKR: { kind: "text", names: ["OKR"] },
  DESCRIPCION: { kind: "text", names: ["Descripcion", "Descripción"] },
  DIRECCION_LOCACION: { kind: "text", names: ["Direccion de Locacion", "Dirección de Locación"] },
  PRINT_STORY: { kind: "text", names: ["Print o Storytelling"] },
  FECHA_RODAJE: { kind: "date", names: ["Fecha de Rodaje"] },
  FECHA_ENTREGA: { kind: "date", names: ["Fecha de entrega"] },
  REVISION_CLIENTE: { kind: "dd", names: ["Revision cliente", "Revisión cliente"] },
  CATEGORIA_VIDEO: { kind: "dd", names: ["Categoria de video", "Categoría de video"] },
  LOCACION: { kind: "dd", names: ["Locación", "Locacion"] },
  CANAL: { kind: "dd", names: ["Canal"] },
  TIPO_PRODUCCION: { kind: "dd", names: ["Tipo de produccion", "Tipo de producción"] },
  ETAPA: { kind: "dd", names: ["Etapa"] },
  OBJETIVO_VIDEO: { kind: "dd", names: ["Objetivo de video"] },
  CAMPANA: { kind: "dd", names: ["Campaña", "Campana"] },
  MES_PUBLICACION: { kind: "dd", names: ["Mes de publicacion", "Mes de publicación"] },
  FORMATOS_VIDEO: { kind: "labels", names: ["Formatos de video"] },
  PLATAFORMAS: { kind: "labels", names: ["Plataformas"] },
  EQUIPO_REQUERIDO: { kind: "labels", names: ["Equipo requerido"] },
  EQUIPOS: { kind: "labels", names: ["Equipos"] },
};

// Tipos de ClickUp válidos para cada uso. phone y email quedan afuera: validan
// formato y devuelven 400 (verificado contra la API el 25/8/26).
const TIPOS_OK: Record<Kind, string[]> = {
  text: ["text", "short_text", "url"],
  dd: ["drop_down"],
  labels: ["labels"],
  date: ["date"],
};

/** Header de la planilla → clave del script. */
const HEADERS_REDES: Record<string, string> = {
  NOMBRE: "NOMBRE", ESTADO: "ESTADO", "MES DE PUBLICACION": "MES_DE_PUBLICACION",
  "OBJETIVO DE CONTENIDO": "OBJETIVO_DE_CONTENIDO", "COPY O/Y SUBTITULO": "COPY_OY_SUBTITULO",
  "IMAGEN O VIDEO": "IMAGEN_O_VIDEO", "COMENTARIO DE CLIENTE": "COMENTARIO_DE_CLIENTE",
  "DIA DE PUBLICACION": "DIA_DE_PUBLICACION", HORARIO: "HORARIO", PLATAFORMAS: "PLATAFORMAS",
  "APROBACION DE CLIENTE": "APROBACION_DE_CLIENTE", "ESTADO DE PRODUCCION": "ESTADO_DE_PRODUCCION",
  "TIPO DE CONTENIDO": "TIPO_DE_CONTENIDO", OKR: "OKR", EMPRESA: "EMPRESA",
  "ENLACE DE PUBLICACION": "ENLACE_DE_PUBLICACION", "TIPO DE PRODUCTO": "TIPO_DE_PRODUCTO",
  "DESCRIPCION DE PRODUCTO": "DESCRIPCION_DE_PRODUCTO", "¿RUTA EN SERVER?": "RUTA_EN_SERVER",
  "RUTA EN SERVER": "RUTA_EN_SERVER", "ETIQUETAS EN PUBLICACION": "ETIQUETAS_EN_PUBLICACION",
  "META ADS": "META_ADS", "PROPIEDAD/PROPUESTA": "PROPIEDAD_PROPUESTA", ENLACES: "ENLACES",
  "DISENO GRAFICO": "DISENO_GRAFICO", ESCRITOR: "ESCRITOR", CLIENTE: "CLIENTE",
  "ULTIMA MODIFICACION": "ULTIMA_MODIFICACION", "ULTIMA SINCRONIZACION": "ULTIMA_SINCRONIZACION",
  "TASK ID": "TASK_ID",
};

const HEADERS_VIDEO: Record<string, string> = {
  NOMBRE: "NOMBRE", CANAL: "CANAL", "CATEGORIA DE VIDEO": "CATEGORIA_VIDEO", GANCHO: "GANCHO",
  DESCRIPCION: "DESCRIPCION", "CIERRE DE VIDEO": "CIERRE_VIDEO",
  "DEVOLUCION DEL CLIENTE": "DEVOLUCION_CLIENTE", DEVOLUCION: "DEVOLUCION_CLIENTE",
  "COMENTARIOS DE CLIENTE": "DEVOLUCION_CLIENTE", "COPY O/Y SUBTITULO": "COPY_SUBTITULO",
  ESTADO: "STATUS", "APROBACION DE CLIENTE": "REVISION_CLIENTE", "FECHA DE RODAJE": "FECHA_RODAJE",
  "FECHA DE ENTREGA": "FECHA_ENTREGA", LOCACION: "LOCACION", "DESCRIBIR SET": "DESCRIBIR_SET",
  "DIRECCION DE LOCACION": "DIRECCION_LOCACION", "EQUIPO REQUERIDO": "EQUIPO_REQUERIDO",
  EQUIPOS: "EQUIPOS", "FORMATOS DE VIDEO": "FORMATOS_VIDEO", "PRINT O STORY": "PRINT_STORY",
  "TIPO DE PRODUCCION": "TIPO_PRODUCCION", ETAPA: "ETAPA", "OBJETIVO DE VIDEO": "OBJETIVO_VIDEO",
  CAMPANA: "CAMPANA", PLATAFORMAS: "PLATAFORMAS", "MES DE PUBLICACION": "MES_PUBLICACION",
  "OBJETIVO COMERCIAL": "OBJETIVO_COMERCIAL", OKR: "OKR", CLIENTE: "NOMBRE_CLIENTE",
  "FECHA DE CREACION": "FECHA_CREACION", TELEFONO: "TELEFONO", "EMAIL DE CLIENTE": "EMAIL_CLIENTE",
  "ULTIMA MODIFICACION": "ULTIMA_MODIFICACION", "ULTIMA SINCRONIZACION": "ULTIMA_SINCRONIZACION",
  "TASK ID": "TASK_ID", X: "X",
};

// El único campo del que ClickUp es la fuente de verdad: lo escribe el pipeline
// de contenido al publicar, así que el sync no puede vaciarlo.
const NO_BORRAR = ["ENLACE_DE_PUBLICACION"];

function nk(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

interface CampoCu {
  id: string;
  name: string;
  type: string;
  type_config?: { options?: Array<{ id: string; name?: string; label?: string }> };
}

async function camposDeLista(listId: string): Promise<CampoCu[]> {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("falta CLICKUP_API_TOKEN para leer los campos de la lista");
  const r = await fetch(`${CU_API}/list/${listId}/field`, { headers: { Authorization: token } });
  if (!r.ok) throw new Error(`ClickUp ${r.status} al leer los campos de la lista ${listId}`);
  const j = (await r.json()) as { fields?: CampoCu[] };
  return j.fields ?? [];
}

function columnasDeHeader(header: unknown[], pipeline: "redes" | "video"): Record<string, number> {
  const tabla = pipeline === "redes" ? HEADERS_REDES : HEADERS_VIDEO;
  const norm = Object.fromEntries(Object.entries(tabla).map(([h, k]) => [nk(h), k]));
  const cols: Record<string, number> = {};
  header.forEach((raw, i) => {
    const key = norm[nk(raw)];
    if (key && !cols[key]) cols[key] = i + 1;
  });
  return cols;
}

export interface ConfigScript {
  columns: Record<string, number>;
  fieldIds: Record<string, string>;
  fieldKinds: Record<string, Kind>;
  optionsMap: Record<string, Record<string, string>>;
  avisos: string[];
}

/** Arma la config leyendo la lista de ClickUp y el header de la planilla. */
export async function configuracionDesdeClickUp(args: {
  listId: string;
  spreadsheetId: string;
  sheetName: string;
  pipeline: "redes" | "video";
}): Promise<ConfigScript> {
  const spec = args.pipeline === "redes" ? REDES : VIDEO;
  const campos = await camposDeLista(args.listId);
  const hoja = (await sheetsRead({
    spreadsheetId: args.spreadsheetId,
    range: `'${args.sheetName}'!1:1`,
  })) as { values?: unknown[][] };
  const columns = columnasDeHeader(hoja.values?.[0] ?? [], args.pipeline);

  const fieldIds: Record<string, string> = {};
  const fieldKinds: Record<string, Kind> = {};
  const optionsMap: Record<string, Record<string, string>> = {};
  const avisos: string[] = [];

  for (const [key, sp] of Object.entries(spec)) {
    if (!(key in columns)) continue; // el script no lee esa columna
    const campo = sp.names.map((n) => campos.find((c) => nk(c.name) === nk(n))).find(Boolean);
    if (!campo) { avisos.push(`${key}: la lista no tiene ese campo`); continue; }
    // El kind lo manda ClickUp, no la tabla: OKR es texto en unos clientes y
    // desplegable en otros, y mandarle texto a un desplegable es un 400.
    const kind: Kind | null =
      campo.type === "drop_down" ? "dd"
        : campo.type === "labels" ? "labels"
          : campo.type === "date" ? "date"
            : TIPOS_OK.text.includes(campo.type) ? "text"
              : null;
    if (!kind) { avisos.push(`${key}: en ClickUp es ${campo.type}, no se sincroniza`); continue; }
    if (kind !== sp.kind) avisos.push(`${key}: se sincroniza como ${kind} (en ClickUp es ${campo.type})`);
    fieldIds[key] = campo.id;
    fieldKinds[key] = kind;
    if (kind === "dd" || kind === "labels") {
      optionsMap[key] = Object.fromEntries(
        (campo.type_config?.options ?? [])
          .map((o) => [String(o.name ?? o.label ?? "").trim(), o.id])
          .filter(([n]) => n),
      );
    }
  }
  for (const k of ["NOMBRE", "TASK_ID", "ULTIMA_SINCRONIZACION"]) {
    if (!columns[k]) avisos.push(`la planilla no tiene la columna ${k}: el sync no va a funcionar`);
  }
  return { columns, fieldIds, fieldKinds, optionsMap, avisos };
}

function lit(o: Record<string, unknown>, indent = "  "): string {
  const keys = Object.keys(o);
  if (!keys.length) return "{}";
  return `{\n${keys.map((k) => `${indent}${JSON.stringify(k)}: ${JSON.stringify(o[k])},`).join("\n")}\n${indent.slice(2)}}`;
}

/** Reemplaza `const NOMBRE = <literal>` balanceando llaves/corchetes. */
function reemplazar(code: string, nombre: string, texto: string): string {
  const m = new RegExp(`(const|var|let)[ \\t]+${nombre}[ \\t]*=[ \\t]*`).exec(code);
  if (!m) return code;
  const i = m.index + m[0].length;
  const abre = code[i];
  const cierra = abre === "{" ? "}" : abre === "[" ? "]" : null;
  if (!cierra) return code;
  let nivel = 0;
  let str: string | null = null;
  let esc = false;
  for (let j = i; j < code.length; j++) {
    const c = code[j];
    if (str) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { str = c; continue; }
    if (c === abre) nivel++;
    else if (c === cierra) {
      nivel--;
      if (nivel === 0) return code.slice(0, i) + texto + code.slice(j + 1);
    }
  }
  return code;
}

/** Escribe la config en el código del script. */
export function inyectarConfig(source: string, cfg: ConfigScript, cabecera: string): string {
  let s = source;
  s = reemplazar(s, "COLUMNS", lit(cfg.columns));
  s = reemplazar(s, "FIELD_IDS", lit(cfg.fieldIds));
  s = reemplazar(s, "FIELD_KINDS", lit(cfg.fieldKinds));
  s = reemplazar(
    s,
    "OPTIONS_MAP",
    Object.keys(cfg.optionsMap).length
      ? `{\n${Object.entries(cfg.optionsMap).map(([k, v]) => `  ${JSON.stringify(k)}: ${lit(v, "    ")},`).join("\n")}\n}`
      : "{}",
  );
  s = reemplazar(s, "KEYS_DD", JSON.stringify(Object.keys(cfg.fieldKinds).filter((k) => cfg.fieldKinds[k] === "dd")));
  s = reemplazar(s, "KEYS_LABELS", JSON.stringify(Object.keys(cfg.fieldKinds).filter((k) => cfg.fieldKinds[k] === "labels")));
  s = reemplazar(
    s,
    "KEYS_DATE",
    JSON.stringify(Object.keys(cfg.fieldKinds).filter((k) => cfg.fieldKinds[k] === "date" && k !== "DIA_DE_PUBLICACION")),
  );
  s = reemplazar(s, "NO_BORRAR", JSON.stringify(NO_BORRAR));
  return s.replace("/* CONFIG GENERADA */", cabecera);
}
