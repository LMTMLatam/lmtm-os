// LMTM-OS: lo que hay para ganar, no solo lo que se rompió (pedido 08/10).
//
// "No me gusta que todas las alertas sean de saldo: quiero que las principales
// sean oportunidades de contenido o de upsell." Hoy y el resumen de las 9:00
// eran pauta frenada, saldo y pausar. Estas reglas salen del análisis de
// contenido (cada publicación contra lo normal de su propia cuenta,
// contenido-analisis.ts): nada se afirma sin una publicación medida detrás, y
// ninguna lleva plata por día (no hay cómo medirla sin inventar).

import type { AnalisisContenido, Ejemplo } from "../../services/contenido-analisis.js";
import type { Propuesta } from "../tipos.js";

/** Una publicación de las últimas dos semanas que dobló lo normal de su cuenta. */
export const DIAS_RECIENTE = 14;

const RED: Record<string, string> = { instagram: "Instagram", facebook: "Facebook" };
const ddmm = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
const veces = (x: number) => `${x.toFixed(1).replace(".", ",")}×`;

function datosDelPost(e: Ejemplo) {
  return [
    { etiqueta: "Veces lo normal de la cuenta", valor: e.indice, unidad: "veces" as const },
    { etiqueta: "Interacción (reacciones + comentarios×3 + compartidos×5)", valor: e.engagement },
    { etiqueta: "Publicación", valor: e.permalink ?? "sin link", unidad: "texto" as const },
  ];
}

/**
 * Por cliente, su mejor publicación reciente: si tiene pauta, repetirla (y
 * probarla como anuncio); si no tiene pauta, es un argumento para ofrecérsela.
 * Más el ángulo que funciona en su rubro y casi no usa. Pura.
 */
export function propuestasDeOportunidad(
  a: Pick<AnalisisContenido, "clientes" | "nichos">,
  conPauta: Set<string>,
  ahora = new Date(),
): Propuesta[] {
  // El análisis ya trae la de las últimas dos semanas; se vuelve a mirar la
  // fecha por si viene de un caché de antes de medianoche.
  const desde = new Date(ahora.getTime() - DIAS_RECIENTE * 86_400_000).toISOString().slice(0, 10);
  const out: Propuesta[] = [];

  for (const c of a.clientes) {
    const e = c.mejorReciente;
    if (!e || e.fecha.slice(0, 10) < desde) continue;
    const pieza = `su ${e.formato} de ${RED[e.red] ?? e.red} del ${ddmm(e.fecha)}`;
    const angulo = e.anguloNombre ? ` (ángulo «${e.anguloNombre}»)` : "";
    const texto = e.texto ? `«${e.texto.slice(0, 120)}${e.texto.length > 120 ? "…" : ""}»` : "Sin texto.";
    if (conPauta.has(e.clientId)) {
      out.push({
        clientId: e.clientId,
        tipo: "contenido:reutilizar",
        clave: `contenido:reutilizar:${e.clientId}:${e.permalink ?? e.fecha}`,
        que: `Repetir lo que funcionó: ${pieza} sacó ${veces(e.indice)} lo normal de la cuenta${angulo}`,
        porque: {
          resumen: `${texto} Hacer otra pieza con el mismo ángulo y formato, y probarla como anuncio: lo que ya rindió en orgánico es el creativo con menos riesgo.`,
          datos: datosDelPost(e),
        },
        arsPorDia: null,
        responsable: "equipo",
        creadaPor: "regla:oportunidades",
        accion: {
          tipo: "tarea",
          titulo: `${e.cliente.trim()}: repetir ${pieza} (${veces(e.indice)} lo normal)${angulo}`,
          descripcion: `Publicación: ${e.permalink ?? "sin link"}\n${texto}\nOtra pieza con el mismo ángulo y formato; probarla también como anuncio.`,
        },
        venceEnDias: 7,
      });
    } else {
      out.push({
        clientId: e.clientId,
        tipo: "upsell:pauta",
        clave: `upsell:pauta:${e.clientId}:${e.permalink ?? e.fecha}`,
        que: `Ofrecer pauta: ${pieza} sacó ${veces(e.indice)} lo normal y no tiene anuncios en 30 días`,
        porque: {
          resumen: `${texto} Una publicación que ya funcionó en orgánico es la mejor prueba para proponerle invertir en anuncios.`,
          datos: datosDelPost(e),
        },
        arsPorDia: null,
        responsable: "equipo",
        creadaPor: "regla:oportunidades",
        accion: {
          tipo: "tarea",
          titulo: `${e.cliente.trim()}: proponer pauta con ${pieza} (${veces(e.indice)} lo normal)`,
          descripcion: `Publicación: ${e.permalink ?? "sin link"}\n${texto}\nNo tiene gasto en anuncios en los últimos 30 días.`,
        },
        venceEnDias: 14,
      });
    }
  }

  // El ángulo del rubro que no usa. No se nombra a la otra cuenta: va el link.
  const nichos = new Map(a.nichos.map((n) => [n.nicho, n]));
  for (const c of a.clientes) {
    const o = c.oportunidad;
    if (!o || !c.nicho) continue;
    const ejemplo = nichos.get(c.nicho)?.angulos.find((f) => f.clave === o.angulo)?.mejor;
    const usos = o.usosPropios === 0 ? "nunca lo usó" : `lo usó ${o.usosPropios === 1 ? "una vez" : `${o.usosPropios} veces`}`;
    out.push({
      clientId: c.clientId,
      tipo: "contenido:angulo",
      clave: `contenido:angulo:${c.clientId}:${o.angulo}`,
      que: `Probar el ángulo «${o.nombre}»: en ${c.nicho} rinde ${veces(o.indiceEnNicho)} lo normal y ${c.cliente.trim()} ${usos} en 6 meses`,
      porque: {
        resumen: `Medido en ${o.publicacionesNicho} publicaciones de ${o.cuentasNicho} cuentas del rubro, cada una contra lo normal de su propia cuenta.`,
        datos: [
          { etiqueta: "Veces lo normal en el rubro (mediana)", valor: o.indiceEnNicho, unidad: "veces" },
          { etiqueta: "Publicaciones del rubro con ese ángulo", valor: o.publicacionesNicho },
          { etiqueta: "Veces que lo usó el cliente", valor: o.usosPropios },
          ...(ejemplo?.permalink ? [{ etiqueta: "Ejemplo del rubro", valor: ejemplo.permalink, unidad: "texto" as const }] : []),
        ],
      },
      arsPorDia: null,
      responsable: "equipo",
      creadaPor: "regla:oportunidades",
      accion: {
        tipo: "tarea",
        titulo: `${c.cliente.trim()}: probar el ángulo «${o.nombre}» (${veces(o.indiceEnNicho)} en ${c.nicho})`,
        descripcion: ejemplo?.permalink ? `Ejemplo del rubro: ${ejemplo.permalink}` : undefined,
      },
      venceEnDias: 14,
    });
  }
  return out;
}
