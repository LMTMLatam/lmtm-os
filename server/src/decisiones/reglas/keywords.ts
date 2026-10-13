// LMTM-OS: la auditoría de keywords de Google como decisiones de Hoy (13/10).
//
// La auditoría (services/ads-keywords.ts) existía desde agosto y los agentes
// tenían con qué aplicarla (agregar negativas, pausar keywords), pero ninguna
// rutina la corría: la última salida era de septiembre. Ahora corre con el
// motor y lo que encuentra va a Hoy con su botón:
//
//   · términos de búsqueda que gastaron sin una conversión → negativas, por
//     campaña (la negativa se agrega en la campaña donde gastó);
//   · palabras clave que gastan sin convertir → pausarlas.
//
// Los umbrales (gasto y clics mínimos) y la protección de la marca son los de
// la auditoría: acá no se decide nada nuevo, se lo hace aprobable.
// No se pasa a plata por día: la cuenta puede no estar en pesos (GALA).

import type { AuditoriaKeywords, KeywordActiva, TerminoBusqueda } from "../../services/ads-keywords.js";
import type { Dato, Propuesta } from "../tipos.js";

const plata = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const lista = (xs: string[], max = 4) => xs.slice(0, max).map((x) => `«${x}»`).join(", ") + (xs.length > max ? ` y ${xs.length - max} más` : "");

/**
 * Conversiones que tendría que haber traído con la tasa de la propia cuenta,
 * para afirmar que algo "no convierte". Con 8 clics y una tasa del 2% se
 * esperaba 0,16: que no haya traído ninguna no prueba nada, y la auditoría
 * proponía negativizar "inmobiliarias rosario" en una inmobiliaria de Rosario
 * (13/10). Por debajo de esto no se propone.
 */
export const CONVERSIONES_ESPERADAS_MIN = 2;

export function propuestasDeKeywords(c: { clientId: string; cliente: string }, a: AuditoriaKeywords): Propuesta[] {
  const out: Propuesta[] = [];
  // Sin conversiones en la cuenta no hay tasa: no se puede juzgar ningún término.
  const tasa = a.clicsTotal > 0 && a.conversionesTotal > 0 ? a.conversionesTotal / a.clicsTotal : null;
  if (tasa == null) return out;
  const conEvidencia = (clics: number) => clics * tasa >= CONVERSIONES_ESPERADAS_MIN;

  // Negativas, una decisión por campaña.
  const porCampana = new Map<string, TerminoBusqueda[]>();
  for (const t of a.negativas.filter((x) => conEvidencia(x.clics))) {
    if (!t.campaignId) continue;
    porCampana.set(t.campaignId, [...(porCampana.get(t.campaignId) ?? []), t]);
  }
  for (const [campaignId, ts] of porCampana) {
    const gasto = ts.reduce((s, t) => s + t.costo, 0);
    const campana = ts[0].campana || campaignId;
    out.push({
      clientId: c.clientId,
      tipo: "pauta:negativas",
      clave: `pauta:negativas:${c.clientId}:${campaignId}`,
      que: `Agregar ${ts.length} ${ts.length === 1 ? "negativa" : "negativas"} en «${campana}» en Google: ${plata(gasto)} en ${a.dias} días en búsquedas que no trajeron ni una conversión`,
      porque: {
        resumen: `La gente buscó ${lista(ts.map((t) => t.termino))}, hizo clic y no convirtió nunca, con clics de sobra para que, a la tasa de esta cuenta, ya hubiera traído al menos ${CONVERSIONES_ESPERADAS_MIN} conversiones. Como negativas, esas búsquedas dejan de mostrar el anuncio. Las de la marca no se tocan.`,
        datos: [
          { etiqueta: `Gasto en esos términos (${a.dias} días)`, valor: Math.round(gasto), unidad: "ars" },
          ...ts.slice(0, 5).map((t): Dato => ({ etiqueta: `«${t.termino}» · ${t.clics} clics, 0 conversiones`, valor: Math.round(t.costo), unidad: "ars" })),
        ],
      },
      arsPorDia: null,
      responsable: "equipo",
      creadaPor: "regla:keywords_google",
      accion: { tipo: "negativas", campaignId, campana, terminos: ts.map((t) => t.termino) },
      venceEnDias: 7,
    });
  }

  // Palabras clave que gastan sin convertir: una decisión por cliente.
  const pausar: KeywordActiva[] = a.pausar.filter((k) => conEvidencia(k.clics));
  if (pausar.length > 0) {
    const gasto = pausar.reduce((s, k) => s + k.costo, 0);
    out.push({
      clientId: c.clientId,
      tipo: "pauta:pausar_keywords",
      clave: `pauta:pausar_keywords:${c.clientId}`,
      que: `Pausar ${pausar.length} ${pausar.length === 1 ? "palabra clave" : "palabras clave"} en Google: ${plata(gasto)} en ${a.dias} días sin una conversión`,
      porque: {
        resumen: `${lista(pausar.map((k) => k.texto))} ${pausar.length === 1 ? "gastó" : "gastaron"} con clics suficientes para juzgar y ninguna conversión. Las de la marca no se tocan.`,
        datos: [
          { etiqueta: `Gasto en esas palabras clave (${a.dias} días)`, valor: Math.round(gasto), unidad: "ars" },
          ...pausar.slice(0, 5).map((k): Dato => ({ etiqueta: `«${k.texto}» (${k.campana}) · ${k.clics} clics`, valor: Math.round(k.costo), unidad: "ars" })),
        ],
      },
      arsPorDia: null,
      responsable: "equipo",
      creadaPor: "regla:keywords_google",
      accion: { tipo: "pausar_keywords", textos: pausar.map((k) => k.texto) },
      venceEnDias: 7,
    });
  }
  return out;
}
