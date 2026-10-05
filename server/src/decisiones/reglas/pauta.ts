// LMTM-OS: reglas de pauta del playbook (skill ads, meta-decision-system.md).
//
// Todo umbral sale de UN número, el TCPL del cliente (costo objetivo por lead
// calificado). Así una decisión es aritmética y no opinión: "gastó 3 veces lo
// que debería costar un lead y no trajo ninguno" se puede discutir con la
// planilla en la mano; "este anuncio no anda" no.
//
// EL OBJETIVO SALE DE `metricasCliente()`, con su fuente. Se usa el que fijó
// una persona y, si no hay, el del historial del cliente (CPL de 30 días × 0,8,
// que es el método 2 del playbook). El ideal del RUBRO no: es un promedio ajeno
// y decidir con él sería afirmar algo sobre el cliente con datos de otros.
// Cuando el objetivo sale del historial, la pantalla dice "objetivo propuesto":
// nadie tiene que creer que lo pidió el cliente.
//
// Las funciones de este archivo son puras: reciben los números ya sumados y
// devuelven propuestas. La consulta vive en `motor-datos.ts`.

import type { Accion, Dato, Propuesta } from "../tipos.js";

/** Debajo de esto no hay señal: se espera. 3×TCPL da ~95% de confianza. */
export const MULTIPLO_DATOS = 3;
/** Calificados por debajo de esta fracción: el anuncio atrae a la gente equivocada. */
export const TASA_CALIFICADOS_MINIMA = 0.4;
/** Costo por calificado arriba de esto, dos semanas seguidas: no es ruido. */
export const MULTIPLO_COSTO_ALTO = 1.5;
/** Frecuencia en prospección fría: aviso y reemplazo. */
export const FRECUENCIA_AVISO = 2.5;
export const FRECUENCIA_REEMPLAZO = 4;
/** Mínimo de impresiones en 7 días para que una frecuencia signifique algo. */
export const IMPRESIONES_MINIMAS_FRECUENCIA = 1000;
/** Escalar: de a 20% como máximo y con al menos 3 días entre subidas. */
export const PASO_ESCALAR = 0.2;
export const DIAS_ENTRE_SUBIDAS = 3;
/** Leads mínimos en la ventana para afirmar que algo rinde (como ads-duplicar). */
export const LEADS_MINIMOS_ESCALAR = 5;
/** Frecuencia de cuenta por encima de la cual no se escala (playbook: < 3). */
export const FRECUENCIA_MAXIMA_ESCALAR = 3;
/** Días de la ventana de evaluación (playbook: 14 días móviles). */
export const DIAS_VENTANA = 14;

/**
 * Campañas de remarketing: la frecuencia alta es esperable ahí y las bandas de
 * prospección fría no aplican. Se reconocen por el nombre porque la API no
 * dice "esto es remarketing" de ninguna forma confiable.
 */
const REMARKETING = /remarketing|retargeting|retarget|rmkt|rtg|\brmk\b/i;

export function esRemarketing(...nombres: Array<string | null | undefined>): boolean {
  return nombres.some((n) => n != null && REMARKETING.test(n));
}

export interface AnuncioVentana {
  adId: string;
  nombre: string | null;
  campana: string | null;
  /** Gasto y leads de los últimos 14 días completos. */
  gasto14: number;
  leads14: number;
  /** Gasto de los últimos 3 días completos: separa lo que sigue quemando de lo que ya se apagó. */
  gasto3: number;
  /** Impresiones y suma de alcances diarios de los últimos 7 días (frecuencia = cota inferior). */
  impresiones7: number;
  alcance7: number;
}

export interface ClienteVentana {
  clientId: string;
  cliente: string;
  tcpl: number | null;
  /** De dónde sale el objetivo. "historial" = lo propusimos nosotros. */
  tcplFuente?: "cliente" | "historial" | null;
  desde: string;
  hasta: string;
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

/** Cómo se nombra el objetivo en la evidencia: el propuesto no se presenta como pedido. */
export function etiquetaObjetivo(c: Pick<ClienteVentana, "tcplFuente">): string {
  return c.tcplFuente === "historial"
    ? "Costo por lead objetivo (propuesto: 20% menos que el último mes)"
    : "Costo por lead objetivo";
}
const nombreAnuncio = (a: AnuncioVentana) => (a.nombre?.trim() ? `«${a.nombre.trim()}»` : `el anuncio ${a.adId}`);

function lista(anuncios: AnuncioVentana[], max = 3): string {
  const n = anuncios.slice(0, max).map(nombreAnuncio).join(", ");
  return anuncios.length > max ? `${n} y ${anuncios.length - max} más` : n;
}

/**
 * 0 leads con 3×TCPL gastado → cambiar el concepto.
 *
 * Solo cuenta lo que SIGUE gastando (gasto en los últimos 3 días): un anuncio
 * que ya se apagó no tiene nada que decidir, y si se lo contara la decisión no
 * se podría verificar nunca — la ventana de 14 días lo seguiría mostrando
 * muerto una semana después de reemplazado.
 *
 * Una decisión por cliente, no por anuncio: tres anuncios muertos del mismo
 * cliente son un solo "hay que renovar los conceptos", y en el celular son una
 * fila, no tres.
 */
export function reglaSinLeads(c: ClienteVentana, anuncios: AnuncioVentana[]): Propuesta | null {
  if (c.tcpl == null) return null;
  const umbral = MULTIPLO_DATOS * c.tcpl;
  const muertos = anuncios
    .filter((a) => a.gasto14 >= umbral && a.leads14 === 0 && a.gasto3 > 0)
    .sort((a, b) => b.gasto14 - a.gasto14);
  if (muertos.length === 0) return null;

  const gasto14 = muertos.reduce((s, a) => s + a.gasto14, 0);
  // La plata en juego es lo que esos anuncios queman HOY por día.
  const arsPorDia = Math.round(muertos.reduce((s, a) => s + a.gasto3, 0) / 3);
  const uno = muertos.length === 1;
  const que = uno
    ? `Cambiar el concepto de ${nombreAnuncio(muertos[0])}: gastó ${pesos(gasto14)} en 14 días sin traer un lead`
    : `Cambiar el concepto de ${muertos.length} anuncios que gastaron ${pesos(gasto14)} en 14 días sin traer un lead`;

  const datos: Dato[] = [
    { etiqueta: "Gasto sin leads (14 días)", valor: Math.round(gasto14), unidad: "ars" },
    { etiqueta: etiquetaObjetivo(c), valor: c.tcpl, unidad: "ars" },
    { etiqueta: "Gasto mínimo para juzgar un anuncio (3 veces el objetivo)", valor: Math.round(umbral), unidad: "ars" },
    ...muertos.slice(0, 5).map((a): Dato => ({ etiqueta: `${nombreAnuncio(a)} · gasto 14 días`, valor: Math.round(a.gasto14), unidad: "ars" })),
  ];

  const accion: Accion = {
    tipo: "tarea",
    titulo: `${c.cliente}: reemplazar ${uno ? "un anuncio sin leads" : `${muertos.length} anuncios sin leads`} por conceptos nuevos`,
    descripcion:
      `Anuncios que gastaron 3 veces el objetivo por lead (${pesos(umbral)}) sin traer ninguno: ${lista(muertos, 10)}.\n` +
      "El concepto está muerto: no iterarlo, cambiarlo. Dejar listo el reemplazo antes de pausar (nunca pausar sin reemplazo).",
  };

  return {
    clientId: c.clientId,
    tipo: "pauta:sin_leads",
    clave: `pauta:sin_leads:${c.clientId}`,
    que,
    porque: {
      resumen: `${uno ? "Un anuncio sigue" : `${muertos.length} anuncios siguen`} gastando sin traer leads: ${lista(muertos)}.`,
      datos,
      ventana: { desde: c.desde, hasta: c.hasta },
    },
    arsPorDia: arsPorDia > 0 ? arsPorDia : null,
    responsable: "equipo",
    creadaPor: "regla:pauta_sin_leads",
    accion,
    venceEnDias: 7,
  };
}

/**
 * Calificados < 40% → cambiar el ángulo. Necesita CRM: sin calificados medidos
 * la regla no dice nada (no hay forma honesta de suponer la calidad).
 */
export function reglaCalificados(
  c: ClienteVentana,
  m: { gasto14: number; leads14: number; calificados14: number | null },
): Propuesta | null {
  if (c.tcpl == null || m.calificados14 == null) return null;
  if (m.gasto14 < MULTIPLO_DATOS * c.tcpl || m.leads14 <= 0) return null;
  const tasa = m.calificados14 / m.leads14;
  if (tasa >= TASA_CALIFICADOS_MINIMA) return null;

  const pct = Math.round(tasa * 100);
  // Lo que se va por día en leads que no califican.
  const arsPorDia = Math.round((m.gasto14 / DIAS_VENTANA) * (1 - tasa));
  return {
    clientId: c.clientId,
    tipo: "pauta:calificados_bajos",
    clave: `pauta:calificados_bajos:${c.clientId}`,
    que: `Cambiar el ángulo de la pauta de ${c.cliente}: solo ${m.calificados14} de ${m.leads14} leads califican (${pct}%)`,
    porque: {
      resumen: `Con menos de ${Math.round(TASA_CALIFICADOS_MINIMA * 100)}% de calificados, el anuncio atrae a la gente equivocada: hay que sumar lenguaje que filtre.`,
      datos: [
        { etiqueta: "Leads (14 días)", valor: m.leads14, unidad: "leads" },
        { etiqueta: "Calificados (CRM)", valor: m.calificados14, unidad: "leads" },
        { etiqueta: "Tasa de calificados", valor: pct, unidad: "pct" },
        { etiqueta: "Gasto (14 días)", valor: Math.round(m.gasto14), unidad: "ars" },
      ],
      ventana: { desde: c.desde, hasta: c.hasta },
    },
    arsPorDia: arsPorDia > 0 ? arsPorDia : null,
    responsable: "equipo",
    creadaPor: "regla:pauta_calificados",
    accion: {
      tipo: "tarea",
      titulo: `${c.cliente}: cambiar el ángulo de los anuncios (calificados ${pct}%)`,
      descripcion: "Mantener el formato y cambiar el ángulo: sumar lenguaje que filtre al público que no califica.",
    },
    venceEnDias: 7,
  };
}

export interface SemanaCalificados {
  gasto: number;
  calificados: number;
}

/**
 * Costo por calificado > 1,5×TCPL dos semanas seguidas → reemplazar.
 * Una semana mala es varianza; dos es estructura.
 */
export function reglaCostoCalificado(c: ClienteVentana, semanas: [SemanaCalificados, SemanaCalificados] | null): Propuesta | null {
  if (c.tcpl == null || semanas == null) return null;
  const tope = MULTIPLO_COSTO_ALTO * c.tcpl;
  // Una semana sin calificados y con gasto suficiente cuenta como cara: su
  // costo por calificado es infinito, no "sin dato".
  const cara = (s: SemanaCalificados) =>
    s.calificados > 0 ? s.gasto / s.calificados > tope : s.gasto >= tope;
  if (!semanas.every(cara)) return null;

  const gasto = semanas[0].gasto + semanas[1].gasto;
  const calificados = semanas[0].calificados + semanas[1].calificados;
  const costo = calificados > 0 ? Math.round(gasto / calificados) : null;
  // Lo que se paga de más por día contra el objetivo.
  const sobrecosto = Math.round((gasto - calificados * c.tcpl) / 14);
  return {
    clientId: c.clientId,
    tipo: "pauta:costo_calificado_alto",
    clave: `pauta:costo_calificado_alto:${c.clientId}`,
    que: costo != null
      ? `Reemplazar la pauta de ${c.cliente}: el lead calificado cuesta ${pesos(costo)}, ${(costo / c.tcpl).toFixed(1).replace(".", ",")} veces el objetivo, hace dos semanas`
      : `Reemplazar la pauta de ${c.cliente}: dos semanas gastando sin un lead calificado`,
    porque: {
      resumen: "Dos semanas seguidas por encima de 1,5 veces el objetivo no es ruido: es la oferta o el público.",
      datos: [
        { etiqueta: "Costo por calificado", valor: costo, unidad: "ars" },
        { etiqueta: etiquetaObjetivo(c), valor: c.tcpl, unidad: "ars" },
        { etiqueta: "Calificados (2 semanas)", valor: calificados, unidad: "leads" },
        { etiqueta: "Gasto (2 semanas)", valor: Math.round(gasto), unidad: "ars" },
      ],
      ventana: { desde: c.desde, hasta: c.hasta },
    },
    arsPorDia: sobrecosto > 0 ? sobrecosto : null,
    responsable: "equipo",
    creadaPor: "regla:pauta_costo_calificado",
    accion: {
      tipo: "tarea",
      titulo: `${c.cliente}: reemplazar oferta o público (calificado a más de 1,5× el objetivo)`,
      descripcion: "Costo por calificado arriba de 1,5 veces el objetivo dos semanas seguidas. Revisar oferta y público, no solo la pieza.",
    },
    venceEnDias: 7,
  };
}

/** Frecuencia de 7 días (cota inferior). null si no hay volumen para afirmar. */
export function frecuencia7(a: Pick<AnuncioVentana, "impresiones7" | "alcance7">): number | null {
  if (a.impresiones7 < IMPRESIONES_MINIMAS_FRECUENCIA || a.alcance7 <= 0) return null;
  return a.impresiones7 / a.alcance7;
}

/**
 * Frecuencia en prospección fría: > 2,5 avisar, > 4 reemplazar.
 *
 * La frecuencia que sale de los datos diarios es una cota INFERIOR de la real
 * (ver metricas-adaptador): si dice 4, la gente lo vio 4 veces o más. Así la
 * regla puede callar un caso, pero no inventa uno.
 */
export function reglaFrecuencia(c: ClienteVentana, anuncios: AnuncioVentana[]): Propuesta[] {
  const vivos = anuncios
    .filter((a) => a.gasto3 > 0 && !esRemarketing(a.campana, a.nombre))
    .map((a) => ({ a, f: frecuencia7(a) }))
    .filter((x): x is { a: AnuncioVentana; f: number } => x.f != null);

  const criticos = vivos.filter((x) => x.f > FRECUENCIA_REEMPLAZO).sort((x, y) => y.f - x.f);
  const aviso = vivos.filter((x) => x.f > FRECUENCIA_AVISO && x.f <= FRECUENCIA_REEMPLAZO).sort((x, y) => y.f - x.f);
  const veces = (f: number) => f.toFixed(1).replace(".", ",");
  const out: Propuesta[] = [];

  if (criticos.length > 0) {
    const anunciosC = criticos.map((x) => x.a);
    out.push({
      clientId: c.clientId,
      tipo: "pauta:fatiga",
      clave: `pauta:fatiga:${c.clientId}`,
      que: criticos.length === 1
        ? `Reemplazar ${nombreAnuncio(criticos[0].a)}: cada persona lo vio ${veces(criticos[0].f)} veces o más en 7 días`
        : `Reemplazar ${criticos.length} anuncios quemados: la gente los vio más de ${FRECUENCIA_REEMPLAZO} veces en 7 días`,
      porque: {
        resumen: `En prospección fría, más de ${FRECUENCIA_REEMPLAZO} veces es fatiga crítica: el concepto se agotó. Retirarlo y lanzar una versión nueva al lado (editar el anuncio reinicia el aprendizaje).`,
        datos: criticos.slice(0, 5).map((x): Dato => ({ etiqueta: `${nombreAnuncio(x.a)} · frecuencia 7 días`, valor: Math.round(x.f * 10) / 10, unidad: "veces" })),
        ventana: { desde: c.desde, hasta: c.hasta },
      },
      arsPorDia: Math.round(anunciosC.reduce((s, a) => s + a.gasto3, 0) / 3) || null,
      responsable: "equipo",
      creadaPor: "regla:pauta_frecuencia",
      accion: {
        tipo: "tarea",
        titulo: `${c.cliente}: reemplazar ${criticos.length === 1 ? "un anuncio con fatiga" : `${criticos.length} anuncios con fatiga`}`,
        descripcion: `Frecuencia de 7 días arriba de ${FRECUENCIA_REEMPLAZO}: ${lista(anunciosC, 10)}. Lanzar la versión nueva al lado; no editar el anuncio vivo.`,
      },
      venceEnDias: 5,
    });
  }

  if (aviso.length > 0) {
    out.push({
      clientId: c.clientId,
      tipo: "pauta:fatiga_aviso",
      clave: `pauta:fatiga_aviso:${c.clientId}`,
      que: `Preparar reemplazos para ${aviso.length === 1 ? nombreAnuncio(aviso[0].a) : `${aviso.length} anuncios`}: la frecuencia pasó ${veces(FRECUENCIA_AVISO)} en 7 días`,
      porque: {
        resumen: "Todavía no está quemado, pero un reemplazo tarda unos 14 días en estar listo: conviene empezar ahora.",
        datos: aviso.slice(0, 5).map((x): Dato => ({ etiqueta: `${nombreAnuncio(x.a)} · frecuencia 7 días`, valor: Math.round(x.f * 10) / 10, unidad: "veces" })),
        ventana: { desde: c.desde, hasta: c.hasta },
      },
      // Avisar no tiene plata en juego todavía: es preparar.
      arsPorDia: null,
      responsable: "equipo",
      creadaPor: "regla:pauta_frecuencia",
      accion: {
        tipo: "tarea",
        titulo: `${c.cliente}: preparar reemplazos (frecuencia arriba de ${veces(FRECUENCIA_AVISO)})`,
        descripcion: `Anuncios: ${lista(aviso.map((x) => x.a), 10)}.`,
      },
      venceEnDias: 7,
    });
  }
  return out;
}

export interface ConjuntoEscalable {
  entityType: "campaign" | "adset";
  entityId: string;
  nombre: string;
  /** Presupuesto diario actual en pesos (ya convertido desde centavos de Meta). */
  presupuestoDiario: number;
  gasto14: number;
  leads14: number;
  impresiones7: number;
  alcance7: number;
  /** Última vez que se movió el presupuesto por el sistema. null = no hay registro. */
  ultimoCambio: Date | null;
}

/**
 * Escalar lo que rinde: +20% como máximo, con 3 días entre subidas.
 *
 * Una por cliente (el que trae el lead más barato): subirle a todos a la vez
 * son varios cambios simultáneos y después nadie sabe cuál explicó el
 * resultado. Mismo criterio que ads-duplicar.
 *
 * `ultimoCambio` solo ve lo que movió el sistema; un cambio hecho a mano en
 * Meta no queda registrado. Por eso el tope de paso lo vuelve a aplicar
 * ads-budget contra el presupuesto VIVO al ejecutar.
 */
export function reglaEscalar(c: ClienteVentana, conjuntos: ConjuntoEscalable[], ahora = new Date()): Propuesta | null {
  if (c.tcpl == null) return null;
  const tcpl = c.tcpl;
  const candidatos = conjuntos
    .filter((s) => s.presupuestoDiario > 0)
    .filter((s) => s.gasto14 >= MULTIPLO_DATOS * tcpl && s.leads14 >= LEADS_MINIMOS_ESCALAR)
    .filter((s) => s.gasto14 / s.leads14 <= tcpl)
    .filter((s) => {
      const f = frecuencia7(s);
      return f == null || f < FRECUENCIA_MAXIMA_ESCALAR;
    })
    .filter((s) => !s.ultimoCambio || ahora.getTime() - s.ultimoCambio.getTime() >= DIAS_ENTRE_SUBIDAS * 86_400_000)
    .sort((a, b) => a.gasto14 / a.leads14 - b.gasto14 / b.leads14);
  const s = candidatos[0];
  if (!s) return null;

  const cpl = Math.round(s.gasto14 / s.leads14);
  const nuevo = Math.round(s.presupuestoDiario * (1 + PASO_ESCALAR));
  return {
    clientId: c.clientId,
    tipo: "pauta:escalar",
    clave: `pauta:escalar:${s.entityId}`,
    que: `Subir 20% el presupuesto de «${s.nombre}»: de ${pesos(s.presupuestoDiario)} a ${pesos(nuevo)} por día`,
    porque: {
      resumen: `Trae leads a ${pesos(cpl)}, debajo del objetivo${c.tcplFuente === "historial" ? " propuesto" : ""} de ${pesos(tcpl)}. Se sube de a 20% y con 3 días entre subidas para no reiniciar el aprendizaje.`,
      datos: [
        { etiqueta: "Costo por lead (14 días)", valor: cpl, unidad: "ars" },
        { etiqueta: etiquetaObjetivo(c), valor: tcpl, unidad: "ars" },
        { etiqueta: "Leads (14 días)", valor: s.leads14, unidad: "leads" },
        { etiqueta: "Presupuesto actual", valor: Math.round(s.presupuestoDiario), unidad: "ars_dia" },
      ],
      ventana: { desde: c.desde, hasta: c.hasta },
    },
    arsPorDia: nuevo - Math.round(s.presupuestoDiario),
    responsable: "equipo",
    creadaPor: "regla:pauta_escalar",
    accion: {
      tipo: "presupuesto",
      entityType: s.entityType,
      entityId: s.entityId,
      nombre: s.nombre,
      anterior: Math.round(s.presupuestoDiario),
      nuevoDiario: nuevo,
    },
    venceEnDias: 3,
  };
}

/**
 * ¿Una subida de presupuesto respeta el ritmo del playbook? Lo usa el alta de
 * decisiones de los agentes: el tope de ads-budget es 30% por día, el de
 * escalar es más estricto y vive acá.
 */
export function validarSubida(anterior: number, nuevo: number, ultimoCambio: Date | null, ahora = new Date()): string | null {
  if (!(anterior > 0) || !(nuevo > 0)) return "Faltan el presupuesto actual o el nuevo.";
  if (nuevo <= anterior) return null; // bajar no es escalar
  if (nuevo > Math.round(anterior * (1 + PASO_ESCALAR))) {
    return `Escalar es de a ${Math.round(PASO_ESCALAR * 100)}% como máximo: de ${pesos(anterior)} se puede subir hasta ${pesos(anterior * (1 + PASO_ESCALAR))}.`;
  }
  if (ultimoCambio && ahora.getTime() - ultimoCambio.getTime() < DIAS_ENTRE_SUBIDAS * 86_400_000) {
    return `La última subida fue hace menos de ${DIAS_ENTRE_SUBIDAS} días: hay que esperar a ver qué hizo antes de volver a subir.`;
  }
  return null;
}
