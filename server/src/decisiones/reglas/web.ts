// LMTM-OS: Search Console y Analytics como decisiones de Hoy (13/10).
//
// Con la web de cada cliente medida, cuatro cosas que valen plata o clientes y
// que nadie miraba:
//
//   · caída de visitas desde Google (Search Console, 14 días contra 14);
//   · búsquedas donde la web ya aparece pero abajo (posición 4 a 20 con
//     impresiones): contenido para subirlas, va como oportunidad;
//   · Analytics sin ningún evento clave en un cliente con pauta: la pauta no
//     tiene contra qué optimizar y no se sabe qué visita terminó en consulta;
//   · landings que reciben pauta y de las que la gente se va sin interactuar.
//
// Solo con ventanas completas (Search Console hasta hoy-3, Analytics hasta
// hoy-2) y con todos los días de la ventana medidos: un día sin dato no es un
// día sin visitas. Puro: el motor trae los datos.

import type { Dato, Propuesta } from "../tipos.js";
import { oportunidadesSeo, sumarDias, sumarVentana, ultimoDiaCompleto } from "../../services/google-web.js";
import type { webDiario } from "@paperclipai/db";

type Dia = typeof webDiario.$inferSelect;

export interface DatosWeb {
  clientId: string;
  cliente: string;
  conGsc: boolean;
  conGa: boolean;
  /** Gastó en pauta en los últimos 30 días. */
  conPauta: boolean;
  dias: Dia[];
  consultas: Array<{ clave: string; detalle: string | null; posicion: number | null; impresiones: number | null; clics: number | null }>;
  landings: Array<{ clave: string; detalle: string | null; sesiones: number | null; compromiso: number | null }>;
  eventos: Array<{ clave: string; sesiones: number | null; eventosClave: number | null }>;
}

const num = (n: number) => Math.round(n).toLocaleString("es-AR");
const lista = (xs: string[], max = 4) => xs.slice(0, max).map((x) => `«${x}»`).join(", ") + (xs.length > max ? ` y ${xs.length - max} más` : "");
const ruta = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };

/** Mínimos para afirmar algo. */
export const CAIDA = { dias: 14, clicsAntesMin: 70, caidaMin: 0.4 };
export const BUSQUEDAS = { minimas: 3, impresionesMin: 100 };
export const SIN_EVENTOS = { sesionesMin: 300 };
export const LANDING = { sesionesMin: 150, interaccionMax: 0.35, debajoDelSitio: 0.15 };
const PAUTA = /^(paid|cross-network)/i;

export function propuestasWeb(d: DatosWeb, ahora = new Date()): Propuesta[] {
  const out: Propuesta[] = [];
  const base = { clientId: d.clientId, arsPorDia: null, responsable: "equipo" as const, creadaPor: "regla:web_google" };

  // 1) Caída de visitas desde Google.
  if (d.conGsc) {
    const hasta = ultimoDiaCompleto("gsc", ahora);
    const ahoraV = { desde: sumarDias(hasta, -CAIDA.dias + 1), hasta };
    const antesV = { desde: sumarDias(hasta, -2 * CAIDA.dias + 1), hasta: sumarDias(hasta, -CAIDA.dias) };
    const nada = { desde: "9999-12-31", hasta: "9999-12-31" };
    const a = sumarVentana(d.dias, ahoraV, nada);
    const b = sumarVentana(d.dias, antesV, nada);
    const completas = a.diasConDato.gsc === CAIDA.dias && b.diasConDato.gsc === CAIDA.dias;
    if (completas && a.clics != null && b.clics != null && b.clics >= CAIDA.clicsAntesMin && a.clics <= b.clics * (1 - CAIDA.caidaMin)) {
      const caida = Math.round((1 - a.clics / b.clics) * 100);
      const impCayo = a.impresiones != null && b.impresiones ? a.impresiones < b.impresiones * 0.75 : false;
      out.push({
        ...base,
        tipo: "web:caida_google",
        clave: `web:caida_google:${d.clientId}`,
        que: `Las visitas desde Google a la web de ${d.cliente} cayeron ${caida}%: ${num(a.clics)} clics en 14 días contra ${num(b.clics)} los 14 anteriores`,
        porque: {
          resumen: impCayo
            ? "También bajaron las impresiones: Google la muestra menos. Revisar en Search Console si hay páginas que dejaron de indexarse, una caída de posiciones o un cambio en la web (dominio, robots, migración)."
            : "Las impresiones se sostienen: Google la sigue mostrando pero menos gente entra. Revisar si cambiaron los títulos, si bajó la posición de las búsquedas principales o si aparecieron competidores arriba.",
          datos: [
            { etiqueta: "Clics desde Google, últimos 14 días", valor: a.clics },
            { etiqueta: "Clics desde Google, 14 días anteriores", valor: b.clics },
            { etiqueta: "Impresiones, últimos 14 días", valor: a.impresiones },
            { etiqueta: "Impresiones, 14 días anteriores", valor: b.impresiones },
            { etiqueta: "Posición media ahora / antes", valor: a.posicion != null && b.posicion != null ? `${String(a.posicion).replace(".", ",")} / ${String(b.posicion).replace(".", ",")}` : null, unidad: "texto" },
          ],
          ventana: { desde: antesV.desde, hasta: ahoraV.hasta },
        },
        accion: {
          tipo: "tarea",
          titulo: `Revisar caída de visitas desde Google — ${d.cliente}`,
          descripcion: `Search Console: ${num(a.clics)} clics del ${ahoraV.desde} al ${ahoraV.hasta} contra ${num(b.clics)} del ${antesV.desde} al ${antesV.hasta} (−${caida}%). Mirar Rendimiento (búsquedas y páginas que más bajaron) e Indexación de páginas.`,
        },
        venceEnDias: 7,
      });
    }

    // 2) Búsquedas para subir: oportunidad.
    const ops = oportunidadesSeo(d.consultas, BUSQUEDAS.impresionesMin);
    if (ops.length >= BUSQUEDAS.minimas) {
      const imp = ops.reduce((s, o) => s + o.impresiones, 0);
      out.push({
        ...base,
        tipo: "contenido:busquedas",
        clave: `contenido:busquedas:${d.clientId}`,
        que: `${ops.length} búsquedas en Google donde ${d.cliente} aparece pero abajo: ${lista(ops.map((o) => o.consulta), 3)}`,
        porque: {
          resumen: `En 28 días se mostró ${num(imp)} veces para estas búsquedas en posición 4 a 20, donde casi nadie hace clic. Un contenido que las responda (en la web, y replicado en redes) o mejorar la página que ya aparece las puede subir a los primeros lugares.`,
          datos: ops.slice(0, 6).map((o): Dato => ({ etiqueta: `«${o.consulta}» · posición ${String(o.posicion).replace(".", ",")} · ${num(o.clics)} clics`, valor: o.impresiones })),
        },
        accion: {
          tipo: "tarea",
          titulo: `Contenido para subir en Google — ${d.cliente}`,
          descripcion: `Búsquedas donde la web aparece en posición 4 a 20 (últimos 28 días, Search Console):\n${ops.slice(0, 15).map((o) => `- «${o.consulta}»: posición ${o.posicion}, ${o.impresiones} impresiones, ${o.clics} clics${o.pagina ? ` → ${ruta(o.pagina)}` : ""}`).join("\n")}\n\nPara cada una: mejorar esa página (título, encabezado y un párrafo que responda la búsqueda) o crear una nueva, y usar la misma pregunta como gancho en redes.`,
        },
        venceEnDias: 14,
      });
    }
  }

  if (d.conGa) {
    const hasta = ultimoDiaCompleto("ga", ahora);
    const v = { desde: sumarDias(hasta, -27), hasta };
    const nada = { desde: "9999-12-31", hasta: "9999-12-31" };
    const t = sumarVentana(d.dias, nada, v);

    // 3) Pauta sin conversiones medidas en Analytics.
    if (d.conPauta && t.diasConDato.ga === 28 && t.sesiones != null && t.sesiones >= SIN_EVENTOS.sesionesMin && t.eventosClave === 0) {
      const frecuentes = d.eventos.filter((e) => !/^(page_view|session_start|first_visit|user_engagement|scroll)$/.test(e.clave)).slice(0, 8);
      out.push({
        ...base,
        tipo: "web:sin_conversiones",
        clave: `web:sin_conversiones:${d.clientId}`,
        que: `Analytics de ${d.cliente} no registra ninguna conversión: ${num(t.sesiones)} visitas en 28 días y 0 eventos clave, con pauta activa`,
        porque: {
          resumen: "Sin eventos clave no se sabe qué visita terminó en consulta (formulario, WhatsApp, llamada) y las campañas no tienen contra qué optimizar. Marcar como evento clave lo que ya se mide o sumar el que falte.",
          datos: [
            { etiqueta: "Visitas a la web (28 días)", valor: t.sesiones },
            { etiqueta: "Eventos clave (28 días)", valor: 0 },
            ...frecuentes.slice(0, 4).map((e): Dato => ({ etiqueta: `Evento «${e.clave}» (no es clave)`, valor: e.sesiones })),
          ],
          ventana: v,
        },
        accion: {
          tipo: "tarea",
          titulo: `Configurar conversiones en Google Analytics — ${d.cliente}`,
          descripcion: `GA4 no registró ningún evento clave del ${v.desde} al ${v.hasta} con ${t.sesiones} sesiones.${frecuentes.length ? ` Eventos que ya se miden: ${frecuentes.map((e) => e.clave).join(", ")}.` : ""} En Administrar → Eventos, marcar como clave el envío de formulario y el clic a WhatsApp/teléfono (o crearlos con Tag Manager si no existen).`,
        },
        venceEnDias: 14,
      });
    }

    // 4) Landings de pauta de las que la gente se va.
    const interSitio = t.sesiones ? (t.comprometidas ?? 0) / t.sesiones : null;
    if (interSitio != null && t.diasConDato.ga === 28) {
      const flojas = d.landings.filter((l) =>
        l.detalle && PAUTA.test(l.detalle) && l.clave !== "(not set)" &&
        (l.sesiones ?? 0) >= LANDING.sesionesMin && l.compromiso != null &&
        l.compromiso < LANDING.interaccionMax && interSitio - l.compromiso >= LANDING.debajoDelSitio,
      ).sort((a, b) => (b.sesiones ?? 0) - (a.sesiones ?? 0)).slice(0, 3);
      if (flojas.length) {
        const pct = (x: number) => Math.round(x * 100);
        out.push({
          ...base,
          tipo: "pauta:landing",
          clave: `pauta:landing:${d.clientId}`,
          que: `La pauta de ${d.cliente} lleva gente a ${flojas.length === 1 ? "una página" : `${flojas.length} páginas`} de la que se va sin hacer nada: ${flojas.map((l) => `${l.clave} (${pct(1 - l.compromiso!)}% se va)`).join(", ")}`,
          porque: {
            resumen: `En el resto de la web interactúa el ${pct(interSitio)}% de las visitas; en ${flojas.length === 1 ? "esta página" : "estas páginas"}, con tráfico pago, mucho menos. Se paga el clic y se pierde ahí: revisar que la página cargue rápido en celular, que diga lo mismo que el anuncio y que el botón de contacto se vea sin bajar.`,
            datos: [
              { etiqueta: "Interacción del sitio (28 días)", valor: pct(interSitio), unidad: "pct" },
              ...flojas.map((l): Dato => ({ etiqueta: `${l.clave} · ${l.detalle} · ${num(l.sesiones ?? 0)} visitas`, valor: pct(l.compromiso!), unidad: "pct" })),
            ],
            ventana: v,
          },
          accion: {
            tipo: "tarea",
            titulo: `Revisar landing de pauta — ${d.cliente}`,
            descripcion: flojas.map((l) => `- ${l.clave} (${l.detalle}): ${l.sesiones} visitas en 28 días, interactúa el ${pct(l.compromiso!)}% (sitio: ${pct(interSitio)}%).`).join("\n") +
              "\n\nRevisar velocidad en celular (análisis SEO), que el título repita la promesa del anuncio y que el botón de WhatsApp/formulario esté arriba.",
          },
          venceEnDias: 14,
        });
      }
    }
  }
  return out;
}
