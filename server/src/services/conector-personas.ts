// LMTM-OS: un link del conector del equipo POR PERSONA (plan 15/11, fase 4, D3).
//
// Antes había un solo código compartido (LMTM_CONECTOR_EQUIPO): no se sabía quién
// hizo qué y revocar a una persona era revocar a todos. Ahora cada persona tiene su
// código, derivado con HMAC del secreto del servidor (no se guarda en ningún lado):
// la lista de personas vive en instance_settings.general.conectorPersonas y
// revocar = sacar a la persona o subir su versión. El código viejo sigue andando
// hasta que se lo saque de Railway (para no cortarle a nadie de golpe).

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { instanceSettings } from "@paperclipai/db";

export interface PersonaConector { nombre: string; version: number; alta: string }

const secreto = () => process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim() || null;

/** Código de una persona: 24 caracteres base64url. null si el servidor no tiene secreto. Pura (con secreto dado). */
export function codigoDe(p: Pick<PersonaConector, "nombre" | "version">, s = secreto()): string | null {
  if (!s) return null;
  return createHmac("sha256", `lmtm-conector-equipo:${s}`).update(`${p.nombre.trim().toLowerCase()}:${p.version}`).digest().subarray(0, 18).toString("base64url");
}

export async function personas(db: Db): Promise<PersonaConector[]> {
  const [r] = await db.select({ general: instanceSettings.general }).from(instanceSettings).where(eq(instanceSettings.singletonKey, "default")).limit(1);
  const l = (r?.general as { conectorPersonas?: unknown } | undefined)?.conectorPersonas;
  return Array.isArray(l) ? (l as PersonaConector[]).filter((p) => p && typeof p.nombre === "string") : [];
}

async function guardar(db: Db, lista: PersonaConector[]): Promise<void> {
  await db.insert(instanceSettings).values({ singletonKey: "default", general: { conectorPersonas: lista } })
    .onConflictDoUpdate({
      target: instanceSettings.singletonKey,
      set: { general: sql`coalesce(${instanceSettings.general}, '{}'::jsonb) || ${JSON.stringify({ conectorPersonas: lista })}::jsonb`, updatedAt: new Date() },
    });
}

/** ¿De quién es este código? null si no es de nadie (o fue revocado). */
export function personaDelCodigo(codigo: string, lista: PersonaConector[], s = secreto()): string | null {
  const dado = Buffer.from(codigo);
  for (const p of lista) {
    const c = codigoDe(p, s);
    if (c && c.length === codigo.length && timingSafeEqual(Buffer.from(c), dado)) return p.nombre;
  }
  return null;
}

export async function agregarPersona(db: Db, nombre: string): Promise<{ ok: boolean; motivo?: string }> {
  const n = nombre.trim().replace(/\s+/g, " ").slice(0, 60);
  if (n.length < 2) return { ok: false, motivo: "Poné el nombre de la persona." };
  const lista = await personas(db);
  if (lista.some((p) => p.nombre.toLowerCase() === n.toLowerCase())) return { ok: false, motivo: "Esa persona ya tiene link." };
  await guardar(db, [...lista, { nombre: n, version: 1, alta: new Date().toISOString() }]);
  return { ok: true };
}

/** Revoca el link de una persona. `nuevo` = le da uno distinto en vez de sacarla. */
export async function revocarPersona(db: Db, nombre: string, nuevo = false): Promise<{ ok: boolean; motivo?: string }> {
  const lista = await personas(db);
  const i = lista.findIndex((p) => p.nombre.toLowerCase() === nombre.trim().toLowerCase());
  if (i < 0) return { ok: false, motivo: "No encuentro a esa persona." };
  const sigue = nuevo ? lista.map((p, j) => (j === i ? { ...p, version: p.version + 1 } : p)) : lista.filter((_, j) => j !== i);
  await guardar(db, sigue);
  return { ok: true };
}
