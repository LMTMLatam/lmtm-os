// LMTM-OS: el informe semanal para el cliente. Puro: números, marcadores y auditor.
//
// EL PROBLEMA
// "Lo que sale no sirve para mandarle a un cliente": el panel público mostraba
// CTR, CPM y gráficos sueltos, y lo que escribían los agentes mezclaba números
// de otra ventana, datos de otro cliente (la inmobiliaria en Distrillantas) y
// jerga. El cliente quiere saber cuánto le cuesta un lead que sirve, si eso
// está en el objetivo y qué se hace la semana que viene.
//
// CÓMO QUEDA
// El estratega (un agente) escribe la narrativa SIN NÚMEROS: usa marcadores
// como {cpl} u {objetivo}, y el servidor los completa con `metricasCliente()`
// de esa semana. Así ningún número del informe puede ser inventado, viejo o de
// otro cliente: no hay de dónde sacarlo. El auditor de acá lo hace cumplir y
// además frena nombres de otros clientes, jerga y un informe que no hable del
// costo por lead y del objetivo. Una persona lo publica con un toque.

import type { MetricasCliente } from "../metricas/index.js";

// ── Semana ───────────────────────────────────────────────────────────────

const ZONA = "America/Argentina/Buenos_Aires";
const DIA = 86_400_000;

function diaLocal(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function sumarDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
}

/**
 * La última semana COMPLETA (lunes a domingo, Buenos Aires) antes de `ahora`.
 * El día en curso está a medio sincronizar: un informe del lunes habla de la
 * semana que terminó ayer, no de un pedazo de ésta.
 */
export function ultimaSemana(ahora = new Date()): { desde: string; hasta: string } {
  const hoy = diaLocal(ahora);
  const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const desdeLunesActual = (dow + 6) % 7; // días desde el lunes de esta semana
  const lunesActual = sumarDias(hoy, -desdeLunesActual);
  return { desde: sumarDias(lunesActual, -7), hasta: sumarDias(lunesActual, -1) };
}

export function semanaAnterior(s: { desde: string; hasta: string }): { desde: string; hasta: string } {
  return { desde: sumarDias(s.desde, -7), hasta: sumarDias(s.hasta, -7) };
}

/** ¿`desde` es un lunes y la semana ya terminó? Lo que escriba un agente tiene que caer en una semana entera. */
export function esSemanaValida(desde: string, ahora = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return false;
  if (new Date(`${desde}T12:00:00Z`).getUTCDay() !== 1) return false;
  return sumarDias(desde, 6) < diaLocal(ahora);
}

// ── Números de la semana ─────────────────────────────────────────────────

/**
 * Lo que el informe puede decir, sacado de `metricasCliente()` de la semana y
 * de la anterior. Se guarda junto con la narrativa: lo que se auditó es lo
 * que se publica, aunque después la ingesta corrija un día.
 */
export interface NumerosInforme {
  desde: string;
  hasta: string;
  inversion: number | null;
  leads: number | null;
  cpl: number | null;
  calificados: number | null;
  costoPorCalificado: number | null;
  ventas: number | null;
  costoPorVenta: number | null;
  objetivo: number | null;
  /** "cliente" = lo fijó una persona; "historial" = lo propusimos nosotros. El del rubro no se muestra. */
  objetivoFuente: "cliente" | "historial" | null;
  anterior: { inversion: number | null; leads: number | null; cpl: number | null };
  /** Google contando como lead lo que no es: el total incluye leads no confiables. */
  leadsDudosos: boolean;
}

export function numerosDeMetricas(semana: { desde: string; hasta: string }, m: MetricasCliente, ant: MetricasCliente): NumerosInforme {
  const fuente = m.objetivo.tcplFuente === "cliente" || m.objetivo.tcplFuente === "historial" ? m.objetivo.tcplFuente : null;
  return {
    ...semana,
    inversion: m.inversion,
    leads: m.leads,
    cpl: m.cpl,
    calificados: m.leadsCalificados,
    costoPorCalificado: m.costoPorCalificado,
    ventas: m.ventas,
    costoPorVenta: m.costoPorVenta,
    // El objetivo del rubro es un promedio ajeno: no se le presenta al cliente como suyo.
    objetivo: fuente ? m.objetivo.tcpl : null,
    objetivoFuente: fuente,
    anterior: { inversion: ant.inversion, leads: ant.leads, cpl: ant.cpl },
    leadsDudosos: m.leadsDudosos.length > 0,
  };
}

// ── Marcadores ───────────────────────────────────────────────────────────

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const entero = (n: number) => Math.round(n).toLocaleString("es-AR");
const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

function variacion(actual: number | null, anterior: number | null): string | null {
  if (actual == null || anterior == null || anterior === 0) return null;
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  if (pct === 0) return "lo mismo que";
  return pct > 0 ? `${pct}% más que` : `${-pct}% menos que`;
}

/** Cada marcador y cómo se dice. null = no hay dato y el marcador no se puede usar. */
export const MARCADORES: Record<string, (n: NumerosInforme) => string | null> = {
  desde: (n) => fechaCorta(n.desde),
  hasta: (n) => fechaCorta(n.hasta),
  inversion: (n) => (n.inversion == null ? null : pesos(n.inversion)),
  leads: (n) => (n.leads == null ? null : entero(n.leads)),
  cpl: (n) => (n.cpl == null ? null : pesos(n.cpl)),
  calificados: (n) => (n.calificados == null ? null : entero(n.calificados)),
  costoPorCalificado: (n) => (n.costoPorCalificado == null ? null : pesos(n.costoPorCalificado)),
  ventas: (n) => (n.ventas == null ? null : entero(n.ventas)),
  costoPorVenta: (n) => (n.costoPorVenta == null ? null : pesos(n.costoPorVenta)),
  objetivo: (n) => (n.objetivo == null ? null : pesos(n.objetivo)),
  inversionAnterior: (n) => (n.anterior.inversion == null ? null : pesos(n.anterior.inversion)),
  leadsAnterior: (n) => (n.anterior.leads == null ? null : entero(n.anterior.leads)),
  cplAnterior: (n) => (n.anterior.cpl == null ? null : pesos(n.anterior.cpl)),
  /** "12% menos que" — para "el lead costó {variacionCpl} la semana anterior". */
  variacionCpl: (n) => variacion(n.cpl, n.anterior.cpl),
  variacionLeads: (n) => variacion(n.leads, n.anterior.leads),
};

const MARCADOR = /\{([a-zA-Z]+)\}/g;

/** Completa los marcadores. Uno sin dato queda como "sin dato" (el auditor no deja publicar eso). */
export function renderizar(texto: string, n: NumerosInforme): string {
  return texto.replace(MARCADOR, (todo, k: string) => {
    const f = MARCADORES[k];
    if (!f) return todo;
    return f(n) ?? "sin dato";
  });
}

// ── Narrativa ────────────────────────────────────────────────────────────

export interface Narrativa {
  /** Dos o tres frases: cómo estuvo la semana contra el objetivo. */
  resumen: string;
  hicimos: string[];
  aprendimos: string[];
  /** La semana que viene, en orden de importancia. */
  proximos: string[];
  /** Lo que necesitamos del cliente (aprobar un presupuesto, mandar fotos…). */
  pedidos: string[];
}

export function renderizarNarrativa(nar: Narrativa, n: NumerosInforme): Narrativa {
  const r = (t: string) => renderizar(t, n);
  return { resumen: r(nar.resumen), hicimos: nar.hicimos.map(r), aprendimos: nar.aprendimos.map(r), proximos: nar.proximos.map(r), pedidos: nar.pedidos.map(r) };
}

/** Valida la forma (no el contenido): lo que no cumple es un 422 para que el agente lo corrija. */
export function validarNarrativa(x: unknown): { ok: true; narrativa: Narrativa } | { ok: false; motivo: string } {
  if (!x || typeof x !== "object") return { ok: false, motivo: "Falta la narrativa: { resumen, hicimos, aprendimos, proximos, pedidos }." };
  const o = x as Record<string, unknown>;
  const texto = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  const lista = (v: unknown, max: number) => v === undefined || (Array.isArray(v) && v.length <= 6 && v.every((i) => texto(i, max)));
  if (!texto(o.resumen, 600)) return { ok: false, motivo: "`resumen` es obligatorio: dos o tres frases, hasta 600 caracteres." };
  for (const k of ["hicimos", "aprendimos", "proximos", "pedidos"]) {
    if (!lista(o[k], 280)) return { ok: false, motivo: `\`${k}\` tiene que ser una lista de hasta 6 frases de hasta 280 caracteres.` };
  }
  const arr = (v: unknown) => ((v as string[] | undefined) ?? []).map((s) => s.trim());
  return {
    ok: true,
    narrativa: { resumen: String(o.resumen).trim(), hicimos: arr(o.hicimos), aprendimos: arr(o.aprendimos), proximos: arr(o.proximos), pedidos: arr(o.pedidos) },
  };
}

// ── Auditor ──────────────────────────────────────────────────────────────

/**
 * Palabras que un cliente no usa o que el informe no tiene que mirar. CTR
 * suelto, CPM y CPC miden la pauta por dentro: el cliente compra leads.
 */
const JERGA = /\b(CTR|CPM|CPC|TCPL|ROAS|sync|sincroniz\w*|API|token|payload|mapping|pixel|píxel|adset|ad ?set|engagement)\b/i;

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export interface Auditoria {
  ok: boolean;
  fallas: string[];
}

/**
 * Lo que tiene que cumplir un informe para que se pueda publicar.
 *
 * `otrosClientes`: nombres de los demás clientes activos. Un nombre ajeno en
 * el informe de un cliente es la falla que más daño hace: es la inmobiliaria
 * que el dueño vio en Distrillantas, pero esta vez frente al cliente.
 */
export function auditarInforme(nar: Narrativa, n: NumerosInforme, otrosClientes: string[]): Auditoria {
  const fallas: string[] = [];
  const partes = [nar.resumen, ...nar.hicimos, ...nar.aprendimos, ...nar.proximos, ...nar.pedidos];
  const todo = partes.join("\n");

  // 1. Ningún número escrito a mano: salen todos de las métricas. Los nombres
  // entre «comillas» se saltean: "«Deptos 2 amb»" es un nombre, no un dato.
  const sinMarcadores = todo.replace(MARCADOR, "").replace(/«[^»]*»/g, "");
  const sueltos = sinMarcadores.match(/[$]?\d[\d.,%]*/g);
  if (sueltos) {
    fallas.push(`Hay números escritos a mano (${[...new Set(sueltos.map((x) => x.replace(/[.,]+$/, "")))].slice(0, 5).join(", ")}). Cada número va con su marcador ({cpl}, {leads}, {objetivo}…) para que salga de las métricas de la semana.`);
  }

  // 2. Marcadores que no existen o que no tienen dato esta semana.
  for (const [, k] of todo.matchAll(MARCADOR)) {
    const f = MARCADORES[k];
    if (!f) fallas.push(`{${k}} no es un marcador. Los que hay: ${Object.keys(MARCADORES).map((x) => `{${x}}`).join(", ")}.`);
    else if (f(n) == null) fallas.push(`{${k}} no tiene dato esta semana: no se puede afirmar. Decí que todavía no se mide, sin el número.`);
  }

  // 3. Habla del costo por lead y del objetivo (no de CTR suelto).
  // Sin leads no hay costo por lead que decir: ahí alcanza con la inversión.
  if ((n.cpl != null || n.costoPorCalificado != null) && !/\{(cpl|costoPorCalificado)\}/.test(nar.resumen)) {
    fallas.push("El resumen tiene que decir cuánto costó el lead ({cpl}, o {costoPorCalificado} si hay calificados).");
  }
  if (n.objetivo != null && !/\{objetivo\}/.test(nar.resumen)) {
    fallas.push("El resumen tiene que comparar contra el objetivo ({objetivo}).");
  }
  if (n.leadsDudosos && /\{(cpl|leads)\}/.test(todo) && !/google/i.test(todo)) {
    fallas.push("Los leads incluyen conversiones de Google que no son confiables: si citás {leads} o {cpl}, aclaralo.");
  }

  // 4. Nada de otro cliente.
  // Un nombre corto ("RENO") se busca tal cual, en mayúsculas: en minúscula
  // es una palabra común y daría falsos positivos. Los demás, sin acentos ni
  // mayúsculas.
  const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nTodo = ` ${normalizar(todo)} `;
  const ajenos = otrosClientes
    .map((c) => c.trim())
    .filter((c) => {
      const nc = normalizar(c);
      if (nc.length >= 5) return new RegExp(`[^a-z0-9]${escapar(nc)}[^a-z0-9]`).test(nTodo);
      return nc.length >= 3 && c === c.toUpperCase() && new RegExp(`(^|[^A-Za-z0-9])${escapar(c)}([^A-Za-z0-9]|$)`).test(todo);
    });
  if (ajenos.length) fallas.push(`Menciona a otro cliente (${ajenos.slice(0, 3).join(", ")}). El informe es solo de este cliente.`);

  // 5. Castellano del cliente.
  const jerga = todo.match(JERGA);
  if (jerga) fallas.push(`"${jerga[0]}" es jerga: decilo como lo diría el cliente (consultas, costo por consulta, personas que vieron el anuncio).`);

  // 6. Accionable.
  if (nar.proximos.length === 0) fallas.push("Falta qué se hace la semana que viene (`proximos`): un informe sin próximo paso no sirve para decidir.");

  return { ok: fallas.length === 0, fallas };
}

// ── Estado contra el objetivo ────────────────────────────────────────────

export type EstadoObjetivo = "en_objetivo" | "arriba" | "muy_arriba" | "sin_dato";

/** Hasta el objetivo, bien; hasta 1,5 veces, arriba; más, muy arriba (la misma banda que las reglas de pauta). */
export function estadoContraObjetivo(costo: number | null, objetivo: number | null): EstadoObjetivo {
  if (costo == null || objetivo == null || !(objetivo > 0)) return "sin_dato";
  if (costo <= objetivo) return "en_objetivo";
  return costo <= objetivo * 1.5 ? "arriba" : "muy_arriba";
}
