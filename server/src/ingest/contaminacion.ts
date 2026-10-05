// LMTM-OS: ninguna salida de un cliente habla de otro cliente.
//
// El dueño de la agencia vio en Distrillantas (una gomería) sugerencias sobre
// una inmobiliaria. Había tres fugas: la plantilla de ClickUp, las efemérides
// sin filtro de rubro y la memoria contaminada. Se arreglaron en su origen;
// esto es la red de abajo: todos los días se escanea lo que se escribió para
// cada cliente en las últimas 24 h y se avisa si nombra a otro cliente.
//
// Nombrar a otro cliente no siempre es un error (MA DESARROLLOS tiene un
// proyecto que se llama Cannes, que también es cliente). Por eso se avisa, no se
// borra, y los grupos conocidos se declaran acá.

import type { Db } from "@paperclipai/db";
import { sql } from "drizzle-orm";

export interface ClienteRef { id: string; nombre: string }

/** Clientes que pueden nombrarse entre sí porque son del mismo grupo. */
export const GRUPOS_RELACIONADOS: string[][] = [
  // Mismo grupo; "Cannes" es un proyecto de MA DESARROLLOS.
  ["MA DESARROLLOS", "MA PROPIEDADES", "GRUPO MA", "CANNES"],
];

const AGENCIA = /^(agencia )?lmtm/i;

function grupoDe(nombre: string): Set<string> {
  const n = nombre.trim().toUpperCase();
  const g = GRUPOS_RELACIONADOS.find((gr) => gr.some((x) => x.toUpperCase() === n));
  return new Set((g ?? [n]).map((x) => x.toUpperCase()));
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Prepara los patrones una vez por corrida. La agencia y los nombres de menos
 *  de 4 letras no se buscan: aparecen legítimamente o dan falsos positivos. */
export function patronesDeClientes(clientes: ClienteRef[]): Array<ClienteRef & { re: RegExp }> {
  return clientes
    .filter((c) => !AGENCIA.test(c.nombre.trim()) && c.nombre.trim().length >= 4)
    .map((c) => ({ ...c, re: new RegExp(`(?<![\\p{L}\\p{N}])${escapar(c.nombre.trim())}(?![\\p{L}\\p{N}])`, "iu") }));
}

/** Nombres de otros clientes (fuera del grupo del dueño) que aparecen en el texto. Pura. */
export function mencionesDeOtrosClientes(
  texto: string,
  dueno: ClienteRef,
  patrones: Array<ClienteRef & { re: RegExp }>,
): string[] {
  const grupo = grupoDe(dueno.nombre);
  return patrones
    .filter((p) => p.id !== dueno.id && !grupo.has(p.nombre.trim().toUpperCase()) && p.re.test(texto))
    .map((p) => p.nombre.trim());
}

export interface Contaminacion { tabla: string; clientId: string; cliente: string; mencionados: string[]; extracto: string }

type Fila = Record<string, unknown>;
const filas = (r: unknown): Fila[] => (Array.isArray(r) ? r : ((r as { rows?: Fila[] })?.rows ?? [])) as Fila[];

/** Escanea lo escrito desde `desde` en las tablas que leen o escriben los agentes. Solo lectura. */
export async function escanearContaminacion(db: Db, desde: Date): Promise<Contaminacion[]> {
  const d = desde.toISOString();
  const [clientes, textos] = await Promise.all([
    db.execute(sql`select id, trim(name) as nombre from clients where status = 'active'`),
    db.execute(sql`
                select 'client_memory' as t, client_id, coalesce(key,'')||' '||coalesce(content,'') as txt from client_memory where created_at > ${d}
      union all select 'opportunities', client_id, coalesce(title,'')||' '||coalesce(rationale,'')||' '||coalesce(suggested_action,'') from opportunities where created_at > ${d}
      union all select 'content_ideas', client_id, coalesce(title,'')||' '||coalesce(copy,'')||' '||coalesce(rationale,'') from content_ideas where created_at > ${d}
      union all select 'agent_deliverables', client_id, coalesce(title,'')||' '||coalesce(content,'') from agent_deliverables where created_at > ${d}
      union all select 'interventions', client_id, coalesce(title,'')||' '||coalesce(body,'') from interventions where created_at > ${d}`),
  ]);
  const refs = filas(clientes).map((c) => ({ id: c.id as string, nombre: c.nombre as string }));
  const porId = new Map(refs.map((c) => [c.id, c]));
  const patrones = patronesDeClientes(refs);
  const out: Contaminacion[] = [];
  for (const f of filas(textos)) {
    const dueno = porId.get(f.client_id as string);
    if (!dueno) continue;
    const txt = String(f.txt ?? "");
    const mencionados = mencionesDeOtrosClientes(txt, dueno, patrones);
    if (mencionados.length) out.push({ tabla: f.t as string, clientId: dueno.id, cliente: dueno.nombre, mencionados, extracto: txt.replace(/\s+/g, " ").slice(0, 140) });
  }
  return out;
}

/** Texto del resumen diario, o null si no hubo nada. Pura. */
export function resumenContaminacion(hallazgos: Contaminacion[]): string | null {
  if (hallazgos.length === 0) return null;
  const pares = new Map<string, number>();
  for (const h of hallazgos) for (const m of h.mencionados) pares.set(`${h.cliente} → ${m}`, (pares.get(`${h.cliente} → ${m}`) ?? 0) + 1);
  const top = [...pares.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} (${n})`).join(", ");
  return `En las últimas 24 h se escribió contenido de un cliente que nombra a otro: ${hallazgos.length} casos. Los más repetidos: ${top}. Revisar antes de que llegue a un informe.`;
}

/** Corre el escaneo de las últimas 24 h y, si hay algo, lo manda al resumen diario (nivel 3). */
export async function avisarContaminacion(db: Db): Promise<{ hallazgos: number; avisado: boolean }> {
  const hallazgos = await escanearContaminacion(db, new Date(Date.now() - 24 * 3600_000));
  const texto = resumenContaminacion(hallazgos);
  if (!texto) return { hallazgos: 0, avisado: false };
  const { avisarAlEquipo } = await import("../services/wa-embudo.js");
  const r = await avisarAlEquipo(db, { origen: "contaminacion-clientes", clave: `contaminacion:${new Date().toISOString().slice(0, 10)}`, texto, nivel: 3 });
  return { hallazgos: hallazgos.length, avisado: r.estado !== "error" && r.estado !== "descartado" };
}
