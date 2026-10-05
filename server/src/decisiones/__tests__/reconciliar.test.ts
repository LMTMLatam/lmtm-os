import { describe, expect, it } from "vitest";
import { planificar, verificarEfecto, type ResultadoConFecha, type Viva } from "../reconciliar.js";
import type { Propuesta } from "../tipos.js";

const DIA = 86_400_000;
const ahora = new Date("2026-10-10T12:00:00Z");

const propuesta = (clave: string, regla = "saldo"): Propuesta => ({
  clientId: "c1",
  tipo: "saldo:frenada",
  clave,
  que: "Destrabar la cuenta",
  porque: { resumen: "frenada", datos: [] },
  arsPorDia: 30_000,
  responsable: "cliente",
  creadaPor: `regla:${regla}`,
  accion: { tipo: "tarea", titulo: "Pedir recarga" },
  venceEnDias: 3,
});

const viva = (o: Partial<Viva> & { clave: string }): Viva => ({
  id: `id-${o.clave}`,
  estado: "abierta",
  creadaPor: "regla:saldo",
  ejecutadaAt: null,
  venceAt: new Date(ahora.getTime() + DIA),
  accion: { tipo: "tarea", titulo: "Pedir recarga" },
  ...o,
});

const resultado = (propuestas: Propuesta[], o: Partial<ResultadoConFecha> = {}): ResultadoConFecha => ({
  regla: "saldo",
  evaluada: true,
  propuestas,
  datosHasta: ahora,
  ...o,
});

describe("planificar", () => {
  it("lo nuevo se inserta; lo que ya está abierto se actualiza, no se duplica", () => {
    const ops = planificar([viva({ clave: "k1" })], [resultado([propuesta("k1"), propuesta("k2")])], ahora);
    expect(ops).toEqual([
      { op: "actualizar", id: "id-k1", propuesta: propuesta("k1") },
      { op: "insertar", propuesta: propuesta("k2") },
    ]);
  });

  it("un descarte se respeta: no se reabre lo mismo al día siguiente, sí pasado su plazo", () => {
    const ayer = new Map([["k1", new Date(ahora.getTime() - DIA)]]);
    expect(planificar([], [resultado([propuesta("k1")])], ahora, ayer)).toEqual([]);
    const haceUnaSemana = new Map([["k1", new Date(ahora.getTime() - 7 * DIA)]]);
    expect(planificar([], [resultado([propuesta("k1")])], ahora, haceUnaSemana)).toEqual([{ op: "insertar", propuesta: propuesta("k1") }]);
  });

  it("lo abierto que dejó de aparecer vence: nadie lo tocó y ya no aplica", () => {
    const ops = planificar([viva({ clave: "k1" })], [resultado([])], ahora);
    expect(ops).toEqual([{ op: "vencer", id: "id-k1", motivo: "dejo_de_aplicar" }]);
  });

  it("lo ejecutado que dejó de aparecer se verifica SOLO con datos posteriores a la ejecución", () => {
    const ejecutada = viva({ clave: "k1", estado: "ejecutada", ejecutadaAt: new Date(ahora.getTime() - DIA) });
    expect(planificar([ejecutada], [resultado([])], ahora)).toEqual([{ op: "verificar", id: "id-k1" }]);
    // Datos que llegan hasta ANTES de ejecutar no prueban nada.
    expect(planificar([ejecutada], [resultado([], { datosHasta: new Date(ahora.getTime() - 2 * DIA) })], ahora)).toEqual([]);
  });

  it("si el problema sigue después del margen, vuelve a abierta: hacer no alcanza, el número se tiene que mover", () => {
    const hace8 = viva({ clave: "k1", estado: "ejecutada", ejecutadaAt: new Date(ahora.getTime() - 8 * DIA) });
    const [op] = planificar([hace8], [resultado([propuesta("k1")])], ahora);
    expect(op.op).toBe("no_confirmada");
    // Dentro del margen de una tarea (7 días) se espera.
    const hace3 = viva({ clave: "k1", estado: "ejecutada", ejecutadaAt: new Date(ahora.getTime() - 3 * DIA) });
    expect(planificar([hace3], [resultado([propuesta("k1")])], ahora)).toEqual([]);
  });

  it("una regla que no pudo mirar no toca nada de lo suyo: no ver no es estar bien", () => {
    const ops = planificar(
      [viva({ clave: "k1" }), viva({ clave: "k2", estado: "ejecutada", ejecutadaAt: new Date(ahora.getTime() - DIA) })],
      [resultado([], { evaluada: false })],
      ahora,
    );
    expect(ops).toEqual([]);
  });

  it("las decisiones de otra regla no se tocan", () => {
    const deCadena = viva({ clave: "k9", creadaPor: "regla:cadena_publicacion" });
    expect(planificar([deCadena], [resultado([])], ahora)).toEqual([]);
  });

  it("lo que nadie tocó y ninguna regla volvió a afirmar vence por plazo (las de agentes)", () => {
    const deAgente = viva({ clave: "agente:x", creadaPor: "agente:a1", venceAt: new Date(ahora.getTime() - 1) });
    expect(planificar([deAgente], [], ahora)).toEqual([{ op: "vencer", id: "id-agente:x", motivo: "plazo" }]);
  });

  it("lo ejecutado que nada confirma en 21 días se cierra vencido, no verificado (y libera su clave)", () => {
    const deAgente = viva({ clave: "agente:t", creadaPor: "agente:a1", estado: "ejecutada", ejecutadaAt: new Date(ahora.getTime() - 22 * DIA) });
    expect(planificar([deAgente], [], ahora)).toEqual([{ op: "sin_confirmacion", id: "id-agente:t" }]);
    const reciente = { ...deAgente, ejecutadaAt: new Date(ahora.getTime() - 5 * DIA) };
    expect(planificar([reciente], [], ahora)).toEqual([]);
  });

  it("una acción de plataforma ejecutada no se verifica por la regla sino por el efecto en la cuenta", () => {
    const presu = viva({
      clave: "pauta:escalar:s1",
      creadaPor: "regla:saldo",
      estado: "ejecutada",
      ejecutadaAt: new Date(ahora.getTime() - DIA),
      accion: {
        tipo: "presupuesto",
        entityType: "adset",
        entityId: "s1",
        nuevoDiario: 12_000,
        resultado: { ok: true, ensayo: false, detalle: "", at: "" },
      },
    });
    // La regla deja de proponer escalar (está en enfriamiento), pero eso no
    // prueba que el presupuesto haya cambiado.
    expect(planificar([presu], [resultado([])], ahora)).toEqual([]);
  });
});

describe("verificarEfecto", () => {
  const ejecutadaAt = new Date("2026-10-08T12:00:00Z");
  const presupuesto = { tipo: "presupuesto" as const, entityType: "adset" as const, entityId: "s1", nuevoDiario: 12_000 };

  it("con la foto vieja no se afirma nada", () => {
    const vieja = { syncedAt: new Date("2026-10-08T03:00:00Z"), platform: "meta", status: "ACTIVE", dailyBudget: 1_000_000 };
    expect(verificarEfecto(presupuesto, ejecutadaAt, vieja, ahora)).toEqual({ veredicto: "esperar" });
  });

  it("el presupuesto se verifica comparando con lo que trae el sync (Meta en centavos)", () => {
    const nueva = { syncedAt: new Date("2026-10-09T03:00:00Z"), platform: "meta", status: "ACTIVE", dailyBudget: 1_200_000 };
    expect(verificarEfecto(presupuesto, ejecutadaAt, nueva, ahora)).toEqual({ veredicto: "verificar" });
    const distinta = { ...nueva, dailyBudget: 1_000_000 };
    expect(verificarEfecto(presupuesto, ejecutadaAt, distinta, ahora).veredicto).toBe("no_confirmada");
  });

  it("Google no trae presupuestos: sin dato, se espera", () => {
    const google = { syncedAt: new Date("2026-10-09T03:00:00Z"), platform: "google", status: "ENABLED", dailyBudget: null };
    expect(verificarEfecto(presupuesto, ejecutadaAt, google, ahora)).toEqual({ veredicto: "esperar" });
  });

  it("la pausa se verifica en el estado; la copia tiene que existir y estar pausada", () => {
    const pausa = { tipo: "pausar" as const, entityType: "adset" as const, entityId: "s1" };
    const fila = { syncedAt: new Date("2026-10-09T03:00:00Z"), platform: "meta", status: "PAUSED", dailyBudget: null };
    expect(verificarEfecto(pausa, ejecutadaAt, fila, ahora)).toEqual({ veredicto: "verificar" });
    const copia = { tipo: "duplicar" as const, adsetId: "s1" };
    expect(verificarEfecto(copia, ejecutadaAt, { ...fila, status: "ACTIVE" }, ahora).veredicto).toBe("no_confirmada");
    expect(verificarEfecto(copia, new Date(ahora.getTime() - 3 * DIA), null, ahora).veredicto).toBe("no_confirmada");
  });
});
