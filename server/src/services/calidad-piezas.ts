// LMTM-OS: calidad de las piezas (plan 15/11, fase 2).
//
// Hasta el 15/11 el control de calidad (video_revisar) devolvía un texto y se
// perdía: de 60 piezas en 30 días ninguna tenía su control guardado, y nadie
// anotaba «esto no sirvió y por qué». Acá:
//  - el resultado del control queda al lado de cada archivo (<archivo>.revision.json);
//  - la entrega lo lee y lo guarda en la pieza (metadata.revision);
//  - el veredicto de una persona (sirve / no sirve + por qué) queda en la pieza y,
//    si no sirvió, como regla fijada en la memoria del cliente, que los agentes
//    leen antes de la próxima pieza.

import fs from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentDeliverables, clientMemory } from "@paperclipai/db";

export interface Problema { placa?: number; segundo?: number; que: string; como_arreglarlo?: string }
export interface Revision {
  apto: boolean;
  /** 1 a 5: qué tan buena es como pieza publicitaria (null si el control no lo dijo). */
  nivel: number | null;
  problemas: Problema[];
  fecha: string;
  modelo?: string;
}

const sidecar = (archivo: string) => `${archivo}.revision.json`;

/** Lee la respuesta JSON del modelo. null si no se puede leer. */
export function parsearRevision(texto: string, ahora = new Date(), modelo?: string): Revision | null {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { apto?: unknown; nivel?: unknown; problemas?: unknown };
    if (typeof j.apto !== "boolean") return null;
    const nivel = Number(j.nivel);
    const problemas = Array.isArray(j.problemas)
      ? (j.problemas as Array<Record<string, unknown>>)
          .filter((p) => p && typeof p.que === "string" && p.que.trim())
          .map((p) => ({
            ...(Number.isFinite(Number(p.placa)) ? { placa: Number(p.placa) } : {}),
            ...(Number.isFinite(Number(p.segundo)) ? { segundo: Number(p.segundo) } : {}),
            que: String(p.que).slice(0, 400),
            ...(typeof p.como_arreglarlo === "string" ? { como_arreglarlo: p.como_arreglarlo.slice(0, 400) } : {}),
          }))
      : [];
    const n = Number.isFinite(nivel) && nivel >= 1 && nivel <= 5 ? Math.round(nivel) : null;
    // Una pieza floja (nivel 1-2) no es apta aunque el modelo diga que sí.
    const apto = j.apto && (n == null || n >= 3);
    return { apto, nivel: n, problemas, fecha: ahora.toISOString(), ...(modelo ? { modelo } : {}) };
  } catch {
    return null;
  }
}

export function guardarRevision(archivos: string[], r: Revision): void {
  for (const a of archivos) fs.writeFileSync(sidecar(a), JSON.stringify({ ...r, archivos }, null, 1));
}

/**
 * El control vigente de estos archivos: todos con su revisión, hecha DESPUÉS de
 * la última modificación del archivo (un render nuevo invalida la vieja).
 */
export function revisionVigente(archivos: string[]): Revision | null {
  if (!archivos.length) return null;
  const rs: Revision[] = [];
  for (const a of archivos) {
    const s = sidecar(a);
    if (!fs.existsSync(a) || !fs.existsSync(s)) return null;
    if (fs.statSync(s).mtimeMs < fs.statSync(a).mtimeMs) return null;
    try { rs.push(JSON.parse(fs.readFileSync(s, "utf8")) as Revision); } catch { return null; }
  }
  return combinar(rs);
}

/** Varias revisiones (una por archivo o una por carrusel) en una. */
export function combinar(rs: Revision[]): Revision {
  const niveles = rs.map((r) => r.nivel).filter((n): n is number => n != null);
  const vistos = new Set<string>();
  const problemas = rs.flatMap((r) => r.problemas).filter((p) => {
    const k = `${p.placa ?? ""}|${p.segundo ?? ""}|${p.que}`;
    return vistos.has(k) ? false : (vistos.add(k), true);
  });
  return {
    apto: rs.every((r) => r.apto),
    nivel: niveles.length ? Math.min(...niveles) : null,
    problemas,
    fecha: rs.map((r) => r.fecha).sort().at(-1) ?? new Date().toISOString(),
  };
}

/** Lo que va a metadata.revision de la pieza. */
export function revisionParaPieza(r: Revision | null, sinRevision?: string): Record<string, unknown> {
  if (r) return { apto: r.apto, nivel: r.nivel, problemas: r.problemas.slice(0, 12), fecha: r.fecha };
  return { apto: null, sinRevision: (sinRevision ?? "").slice(0, 400) };
}

/**
 * Lo que el control de placas exige además del diseño. Sale de revisar las 59
 * piezas del Productor el 18/11: 34 no servían y casi todas por esto.
 */
export const REGLAS_PLACAS =
  "FALLAS GRAVES (con cualquiera de estas, nivel 2 como mucho y no es apta): " +
  "(a) no hay ninguna foto real del cliente (su producto, obra, propiedad, local o equipo): solo texto sobre un color, íconos o formas; " +
  "la única excepción es un carrusel de ideas de una marca de servicios sin producto físico (finanzas, agencia, consultoría) con un número o dato concreto en la portada; " +
  "(b) texto de estado o un hueco escrito en la pieza: «BORRADOR», «para revisión», «a validar», «NO PUBLICAR», «[completar…]» o similar; " +
  "(c) un testimonio o relato en primera persona de un cliente que el brief no trae como real. " +
  "PROBLEMAS (se marcan cada uno): la misma foto repetida en varias placas; una placa decorativa vacía (círculos, rectángulos o un ícono suelto sin foto ni dato); " +
  "numeración incoherente (dos placas con el mismo número grande, o un número que no corresponde a lo que cuenta la placa); " +
  "una pieza de venta, alquiler o promo sin precio ni dato concreto (dirección, ambientes, cuotas) en la portada o la placa 2; " +
  "un carrusel que no es 4:5 o 1:1. ";

/** Las palabras que la marca no usa, para el control (vacío si no hay). */
export function reglaNoUsar(palabras: unknown): string {
  const l = Array.isArray(palabras) ? palabras.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 15) : [];
  return l.length ? `El cliente NO usa estas palabras o temas: ${l.map((x) => `«${x}»`).join(", ")}; si alguna aparece en una placa, es una falla grave. ` : "";
}

/** Un dato sin completar en los textos de la pieza: así no se entrega (18/11). */
export function huecoSinCompletar(texto: string): string | null {
  return texto.match(/\[(?:completar|falta|pendiente|confirmar|dato)[^\]]*\]/i)?.[0] ?? null;
}

/** Línea para la tarea de ClickUp y el issue. */
export function lineaDeRevision(r: Revision | null, sinRevision?: string): string {
  if (!r) return `⚠️ Entregada SIN control de calidad: ${sinRevision || "sin motivo"}.`;
  if (r.apto) return `✅ Pasó el control de calidad${r.nivel ? ` (nivel ${r.nivel}/5)` : ""}.`;
  return `⚠️ NO pasó el control de calidad${r.nivel ? ` (nivel ${r.nivel}/5)` : ""}: ${r.problemas.slice(0, 4).map((p) => p.que).join(" · ") || "sin detalle"}. Revisar antes de publicar.`;
}

export interface Veredicto { sirve: boolean; porque: string; por: string }

/**
 * El veredicto de una persona sobre una pieza entregada. Si no sirvió, el
 * porqué queda como regla FIJADA en la memoria del cliente (una por pieza): la
 * guía de contenido y el cerebro del cliente la traen antes de la próxima.
 */
export async function registrarVeredicto(db: Db, deliverableId: string, v: Veredicto): Promise<{ ok: boolean; motivo?: string }> {
  const porque = v.porque.trim().slice(0, 1000);
  if (!v.sirve && porque.length < 5) return { ok: false, motivo: "Contá por qué no sirve: es lo que el agente va a leer la próxima vez." };
  const [d] = await db.select({ id: agentDeliverables.id, companyId: agentDeliverables.companyId, clientId: agentDeliverables.clientId, title: agentDeliverables.title, kind: agentDeliverables.kind })
    .from(agentDeliverables).where(eq(agentDeliverables.id, deliverableId)).limit(1);
  if (!d) return { ok: false, motivo: "No encuentro esa pieza." };
  const veredicto = { sirve: v.sirve, porque: porque || null, por: v.por, fecha: new Date().toISOString() };
  await db.update(agentDeliverables)
    .set({ metadata: sql`coalesce(${agentDeliverables.metadata}, '{}'::jsonb) || ${JSON.stringify({ veredicto })}::jsonb` })
    .where(eq(agentDeliverables.id, d.id));
  if (d.clientId) {
    const key = `pieza-veredicto:${d.id}`;
    await db.delete(clientMemory).where(and(eq(clientMemory.clientId, d.clientId), eq(clientMemory.key, key)));
    if (!v.sirve || porque) {
      await db.insert(clientMemory).values({
        companyId: d.companyId, clientId: d.clientId, kind: "preference", key,
        content: v.sirve
          ? `Pieza que SÍ sirvió (${d.kind}, «${d.title}»): ${porque}. Repetir lo que funcionó.`
          : `Pieza que NO sirvió (${d.kind}, «${d.title}»): ${porque}. No repetir este error en la próxima pieza.`,
        source: "veredicto-humano", confidence: "1", pinned: !v.sirve,
      });
    }
  }
  return { ok: true };
}
