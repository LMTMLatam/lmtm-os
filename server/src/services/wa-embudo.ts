// LMTM-OS: el embudo único de salida de WhatsApp al equipo.
//
// EL PROBLEMA
// 14 módulos llamaban `sendWhatsAppToNumber(alertsNumber(), texto)` directo:
// vigilantes, auditor, balance-monitor, publication-monitor, cadena-publicacion,
// make, make-disparos, client-tasks, competitor-content, feedback-agent,
// growth-roundtable y tres rutas. Cada uno con su propio dedupe o con ninguno.
//
// Consecuencias medidas, no supuestas:
//   · No había registro de lo enviado, así que nadie podía decir cuánto manda el
//     sistema ni qué módulo genera el volumen. "Manda tanta boludez" era una
//     sensación que no se podía auditar.
//   · Una caída real llegaba con el mismo formato y en el mismo chorro que un
//     aviso rutinario. Distrillantas se desconectó entero —WhatsApp incluido— y
//     nadie se enteró, porque el canal ya estaba quemado.
//
// LA REGLA
// El nivel decide el canal, no el módulo que avisa:
//
//   5   plata o caída total    → interrumpe siempre, sin tope
//   4   urgente                → interrumpe, con tope diario
//   2-3 importante / info      → NO interrumpe: se junta en el digest
//   1   ruido                  → se registra y no se manda nunca
//
// Todo queda en `wa_outbox` pase lo que pase, incluso lo descartado, con el
// motivo. Ese registro es lo que a la semana permite apagar un módulo con el
// dato en la mano en vez de a ojo.

import type { Db } from "@paperclipai/db";
import { waOutbox } from "@paperclipai/db";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { alertsNumber, sendWhatsAppToNumber } from "./agency-ops.js";

// ── Política ──────────────────────────────────────────────────────────────────

export type Nivel = 1 | 2 | 3 | 4 | 5;

/** Desde este nivel el mensaje interrumpe en el momento. Debajo va al digest. */
export const NIVEL_INTERRUMPE: Nivel = 4;

/**
 * Tope de mensajes inmediatos por día y por nivel.
 *
 * El nivel 5 no tiene tope a propósito: es plata parada o una cuenta caída, y un
 * tope ahí reproduce exactamente el bug que estamos arreglando — el aviso que
 * importa silenciado por volumen ajeno.
 */
export const TOPE_DIARIO: Record<Nivel, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 8,
  5: Number.POSITIVE_INFINITY,
};

/** Ventana de dedupe: el mismo hecho no se avisa dos veces seguidas. */
export const HORAS_DEDUPE = 24;

/** Estados que cuentan como "ya se le dijo al equipo". */
const YA_DICHO: readonly string[] = ["enviado", "agrupado"];

export type Decision =
  | { accion: "enviar" }
  | { accion: "digest" }
  | { accion: "descartar"; motivo: string };

/**
 * Qué hacer con un mensaje. Pura: toda la política vive acá para poder probarla
 * sin DB ni gateway.
 *
 * `yaDicho` = si el mismo hecho (misma clave) ya salió en la ventana de dedupe.
 * `enviadosHoy` = cuántos inmediatos de ESE nivel ya salieron hoy.
 */
export function decidir(input: { nivel: Nivel; yaDicho: boolean; enviadosHoy: number }): Decision {
  const { nivel, yaDicho, enviadosHoy } = input;

  if (nivel <= 1) return { accion: "descartar", motivo: "nivel 1: queda registrado, no se manda" };
  if (yaDicho) return { accion: "descartar", motivo: `ya se avisó lo mismo en las últimas ${HORAS_DEDUPE}h` };
  if (nivel < NIVEL_INTERRUMPE) return { accion: "digest" };

  // El tope degrada a digest, no descarta: que el aviso número 9 del día no
  // interrumpa es correcto; que desaparezca es volver a perder un Distrillantas.
  if (enviadosHoy >= TOPE_DIARIO[nivel]) return { accion: "digest" };
  return { accion: "enviar" };
}

/**
 * Agrupa lo pendiente en UN texto, por origen.
 *
 * Pura por la misma razón que `decidir`: el formato del digest es lo que el
 * equipo lee todos los días y es lo que más se va a querer retocar.
 */
export function armarDigest(
  filas: Array<{ origen: string; nivel: number; texto: string }>,
  ahora = new Date(),
): string | null {
  if (filas.length === 0) return null;
  const hora = ahora.getHours() < 12 ? "de la mañana" : "de la tarde";

  const porOrigen = new Map<string, Array<{ nivel: number; texto: string }>>();
  for (const f of filas) {
    const arr = porOrigen.get(f.origen) ?? [];
    arr.push({ nivel: f.nivel, texto: f.texto });
    porOrigen.set(f.origen, arr);
  }

  // Los grupos con el nivel más alto primero: lo más importante se lee arriba
  // sin tener que scrollear el mensaje entero.
  const grupos = [...porOrigen.entries()].sort(
    (a, b) => Math.max(...b[1].map((x) => x.nivel)) - Math.max(...a[1].map((x) => x.nivel)),
  );

  const partes = [`*Resumen ${hora}* — ${filas.length} ${filas.length === 1 ? "aviso" : "avisos"}`];
  for (const [origen, items] of grupos) {
    partes.push(`\n*${origen}* (${items.length})`);
    for (const it of items) partes.push(`· ${unaLinea(it.texto)}`);
  }
  return partes.join("\n");
}

/** Una línea por aviso: el digest es para decidir si abrir el panel, no para leer todo. */
function unaLinea(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > 160 ? `${limpio.slice(0, 157)}…` : limpio;
}

// ── Lado con DB ───────────────────────────────────────────────────────────────

/**
 * Éste es el ÚNICO lugar del sistema que puede llamar al transporte con el
 * destino del equipo. El resto pasa por `avisarAlEquipo`, y hay un test que
 * falla si alguien vuelve a llamar al transporte directo (ver
 * `__tests__/wa-embudo-sin-atajos.test.ts`).
 */
const transporte = sendWhatsAppToNumber;

function destinoDelEquipo(): string {
  return alertsNumber().trim();
}

export interface AvisoEquipo {
  /** Módulo que avisa. Es la unidad con la que después se apaga el ruido. */
  origen: string;
  /** Qué hecho es. Mismo hecho = misma clave, así el dedupe funciona. */
  clave: string;
  texto: string;
  nivel?: Nivel;
  clientId?: string | null;
  /** Sólo para destinos especiales; por defecto va al grupo del equipo. */
  destino?: string;
}

export interface ResultadoAviso {
  estado: "enviado" | "pendiente" | "descartado" | "error";
  motivo?: string;
}

/** El único camino para avisarle al equipo. Registra siempre, mande o no. */
export async function avisarAlEquipo(db: Db, aviso: AvisoEquipo): Promise<ResultadoAviso> {
  const destino = (aviso.destino ?? destinoDelEquipo()).trim();
  const nivel = (aviso.nivel ?? 3) as Nivel;

  const desde = new Date(Date.now() - HORAS_DEDUPE * 3600 * 1000);
  const [previo] = await db
    .select({ id: waOutbox.id })
    .from(waOutbox)
    .where(
      and(
        eq(waOutbox.clave, aviso.clave),
        inArray(waOutbox.estado, YA_DICHO as string[]),
        gte(waOutbox.createdAt, desde),
      ),
    )
    .limit(1);

  const conteo = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(waOutbox)
    .where(
      and(
        eq(waOutbox.estado, "enviado"),
        eq(waOutbox.nivel, nivel),
        gte(waOutbox.createdAt, sql`date_trunc('day', now())`),
      ),
    );

  const decision = decidir({ nivel, yaDicho: Boolean(previo), enviadosHoy: conteo[0]?.n ?? 0 });

  const fila = {
    destino,
    nivel,
    origen: aviso.origen,
    clave: aviso.clave,
    clientId: aviso.clientId ?? null,
    texto: aviso.texto,
  };

  if (decision.accion === "descartar") {
    await db.insert(waOutbox).values({ ...fila, estado: "descartado", motivo: decision.motivo });
    return { estado: "descartado", motivo: decision.motivo };
  }

  if (decision.accion === "digest") {
    await db.insert(waOutbox).values({ ...fila, estado: "pendiente" });
    return { estado: "pendiente" };
  }

  if (!destino) {
    const motivo = "no hay número/grupo de alertas configurado";
    await db.insert(waOutbox).values({ ...fila, estado: "error", motivo });
    return { estado: "error", motivo };
  }

  const res = await transporte(destino, aviso.texto);
  if (res.ok) {
    await db.insert(waOutbox).values({ ...fila, estado: "enviado", enviadoAt: new Date() });
    return { estado: "enviado" };
  }

  // Un fallo del gateway no se pierde: queda pendiente y se va en el digest.
  await db.insert(waOutbox).values({ ...fila, estado: "pendiente", motivo: `gateway: ${res.error ?? "?"}` });
  return { estado: "pendiente", motivo: res.error };
}

/**
 * Lo pendiente, ya armado como texto, sin mandarlo.
 *
 * Existe aparte de `enviarDigest` porque el brief de 8:00/18:00 del Centro de
 * Inteligencia sale a esa misma hora: si el digest fuera un mensaje propio, el
 * equipo recibiría dos seguidos — justo el "mensaje, mensaje, mensaje" que esto
 * viene a arreglar. El brief pide el texto, lo pega al suyo y manda UNO.
 */
export async function juntarPendientes(db: Db): Promise<{ texto: string | null; ids: string[] }> {
  const pendientes = await db
    .select({ id: waOutbox.id, origen: waOutbox.origen, nivel: waOutbox.nivel, texto: waOutbox.texto })
    .from(waOutbox)
    .where(eq(waOutbox.estado, "pendiente"))
    .orderBy(desc(waOutbox.nivel), asc(waOutbox.createdAt));

  return { texto: armarDigest(pendientes), ids: pendientes.map((p) => p.id) };
}

/**
 * Marca como agrupado lo que ya viajó.
 *
 * Se llama DESPUÉS de que el envío salió bien, nunca antes: si el gateway está
 * caído, lo pendiente tiene que irse en el digest siguiente y no evaporarse.
 */
export async function marcarAgrupados(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.update(waOutbox).set({ estado: "agrupado", enviadoAt: new Date() }).where(inArray(waOutbox.id, ids));
}

/** Manda el digest solo. Para la ruta manual y para cuando no hay brief. */
export async function enviarDigest(db: Db): Promise<{ avisos: number; enviado: boolean; motivo?: string }> {
  const { texto, ids } = await juntarPendientes(db);
  if (!texto) return { avisos: 0, enviado: false, motivo: "nada pendiente" };

  const destino = destinoDelEquipo();
  if (!destino) return { avisos: ids.length, enviado: false, motivo: "sin destino configurado" };

  const res = await transporte(destino, texto);
  if (!res.ok) return { avisos: ids.length, enviado: false, motivo: res.error };

  await marcarAgrupados(db, ids);
  return { avisos: ids.length, enviado: true };
}

/**
 * Cuánto mandó cada módulo en los últimos N días y cuánto se descartó.
 * Es el reporte con el que se decide qué apagar.
 */
export async function reporteDeRuido(db: Db, dias = 7) {
  const desde = new Date(Date.now() - dias * 86_400_000);
  return db
    .select({ origen: waOutbox.origen, estado: waOutbox.estado, n: sql<number>`count(*)::int` })
    .from(waOutbox)
    .where(gte(waOutbox.createdAt, desde))
    .groupBy(waOutbox.origen, waOutbox.estado)
    .orderBy(sql`count(*) desc`);
}
