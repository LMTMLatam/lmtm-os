// LMTM-OS: el único aviso automático que interrumpe. Un incidente nuevo.
//
// Un incidente es una decisión de nivel 5: plata que se está perdiendo hoy
// (cuenta frenada con pauta activa) o una fuente de pauta caída en un cliente
// que tenía datos hace poco (la firma de Distrillantas). Lo marca la regla del
// motor; acá solo se avisa.
//
// SE AVISA CUANDO NACE, NO MIENTRAS DURA. Las cuatro cuentas de Google con 403
// desde el 14/09 son incidentes, pero si interrumpieran cada día serían cuatro
// mensajes diarios y el canal volvería a quemarse. Interrumpe una vez, cuando
// aparece (o cuando vuelve después de haberse dado por resuelto); mientras
// sigue, vive arriba de todo en Hoy y en el resumen de las 9:00.
//
// UN MENSAJE POR CORRIDA. Si el motor encuentra tres incidentes nuevos, es un
// solo WhatsApp con los tres, no tres.

import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { avisarAlEquipo } from "../services/wa-embudo.js";

export interface IncidenteNuevo {
  cliente: string;
  que: string;
  arsPorDia: number | null;
  clave: string;
  /** true = ya se había dado por resuelto y volvió. */
  volvio?: boolean;
}

/** Dominio de producción (CONTEXTO.md). Se usa si no está PAPERCLIP_PUBLIC_URL. */
const URL_PRODUCCION = "https://lmtm-os-production.up.railway.app";

/** Link absoluto a Hoy: el que se toca desde el WhatsApp tiene que abrir. */
export async function urlDeHoy(db: Db): Promise<string> {
  const base = (process.env.PAPERCLIP_PUBLIC_URL?.trim() || URL_PRODUCCION).replace(/\/+$/, "");
  const [c] = await db.select({ prefijo: companies.issuePrefix }).from(companies).limit(1).catch(() => []);
  return `${base}/${c?.prefijo ?? "LMTM"}/hoy`;
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

/** El texto del aviso. Puro, para probar el formato: es lo que se lee desde el celular. */
export function armarMensajeIncidentes(incidentes: IncidenteNuevo[], url: string): string | null {
  if (incidentes.length === 0) return null;
  const ordenados = [...incidentes].sort((a, b) => (b.arsPorDia ?? -1) - (a.arsPorDia ?? -1));
  const titulo = ordenados.length === 1 ? "🔴 *Incidente*" : `🔴 *${ordenados.length} incidentes*`;
  const lineas = ordenados.slice(0, 6).map((i) => {
    const plata = i.arsPorDia ? ` (${pesos(i.arsPorDia)} por día)` : "";
    return `• ${i.volvio ? "Volvió: " : ""}*${i.cliente}* — ${i.que}${plata}`;
  });
  if (ordenados.length > 6) lineas.push(`• y ${ordenados.length - 6} más`);
  return [titulo, "", ...lineas, "", `Ver y decidir en Hoy: ${url}`].join("\n");
}

/** Manda UN aviso con los incidentes nuevos de esta corrida. */
export async function avisarIncidentes(db: Db, incidentes: IncidenteNuevo[]): Promise<{ estado: string; motivo?: string } | null> {
  const texto = armarMensajeIncidentes(incidentes, await urlDeHoy(db));
  if (!texto) return null;
  return avisarAlEquipo(db, {
    origen: "incidentes",
    nivel: 5,
    // El mismo conjunto de incidentes no se avisa dos veces en 24 h.
    clave: `incidentes:${incidentes.map((i) => i.clave).sort().join(",")}`,
    texto,
  });
}
