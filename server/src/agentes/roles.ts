// LMTM-OS: los roles del runner propio, definidos en archivos versionados.
//
// Un rol es un .md en ./roles con un encabezado corto (qué agente lo firma,
// qué herramientas puede usar, topes de turnos y minutos) y el texto que lee el
// modelo: misión, reglas y procedimientos. Se edita en git, no en la base: así
// cada cambio de comportamiento tiene autor, fecha y se puede volver atrás.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Rol {
  nombre: string;
  /** Nombre del agente (fila de `agents`) con el que actúan sus herramientas. */
  agente: string;
  /** Herramientas MCP permitidas (nombres de @paperclipai/mcp-server). */
  herramientas: string[];
  turnos: number;
  minutos: number;
  /** El texto que va como system prompt. */
  texto: string;
}

// Desde src/agentes y desde dist/agentes, ../../src/agentes/roles es la misma carpeta.
const CARPETA = fileURLToPath(new URL("../../src/agentes/roles/", import.meta.url));

/** Puro: separa el encabezado `---` del texto. Tira si falta algo obligatorio. */
export function parsearRol(nombre: string, md: string): Rol {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(md);
  if (!m) throw new Error(`rol ${nombre}: falta el encabezado ---`);
  const campos = new Map<string, string>();
  for (const linea of m[1].split(/\r?\n/)) {
    const i = linea.indexOf(":");
    if (i > 0) campos.set(linea.slice(0, i).trim(), linea.slice(i + 1).trim());
  }
  const numero = (clave: string, defecto: number) => {
    const n = Number(campos.get(clave));
    return Number.isFinite(n) && n > 0 ? n : defecto;
  };
  const agente = campos.get("agente");
  const herramientas = (campos.get("herramientas") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  if (!agente) throw new Error(`rol ${nombre}: falta "agente"`);
  if (herramientas.length === 0) throw new Error(`rol ${nombre}: falta "herramientas"`);
  return { nombre, agente, herramientas, turnos: numero("turnos", 10), minutos: numero("minutos", 5), texto: m[2].trim() };
}

const cache = new Map<string, Rol>();

export function cargarRol(nombre: string): Rol {
  if (!/^[a-z0-9-]+$/.test(nombre)) throw new Error(`rol inválido: ${nombre}`);
  let r = cache.get(nombre);
  if (!r) {
    r = parsearRol(nombre, readFileSync(`${CARPETA}${nombre}.md`, "utf8"));
    cache.set(nombre, r);
  }
  return r;
}
