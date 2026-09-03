// La regla que estos tests protegen: dos piezas programadas para la misma hora
// NO son una duplicación, y una automatización disparada dos veces SÍ. La
// diferencia son segundos, así que los umbrales tienen que aguantar los dos
// casos reales medidos el 30/8/26 sobre los 46 escenarios activos.
import { describe, expect, it } from "vitest";
import {
  buscarRafagas,
  buscarSolapes,
  elQueSobra,
  sospechosoClaro,
  RAFAGA_MS,
  SOLAPE_MS,
  type Disparo,
} from "../make-disparos.js";

const t = (iso: string) => new Date(iso);
const d = (escenarioId: number, escenario: string, iso: string): Disparo => ({ escenarioId, escenario, cuando: t(iso) });

describe("buscarRafagas", () => {
  // Caso MAERS: el webhook de ClickUp llamado dos veces con 100ms de diferencia.
  it("caza el mismo escenario disparado dos veces con milisegundos de diferencia", () => {
    const r = buscarRafagas([
      d(1, "MAERS", "2026-08-20T23:00:04.100Z"),
      d(1, "MAERS", "2026-08-20T23:00:04.200Z"),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].veces).toBe(2);
    expect(r[0].separacionMs).toBe(100);
  });

  // Caso AutoPoster 28/8 15:00: siete corridas seguidas.
  it("cuenta toda la ráfaga como un solo hallazgo, no siete", () => {
    const disparos = Array.from({ length: 7 }, (_, i) =>
      d(2, "AutoPoster", new Date(Date.parse("2026-08-28T15:00:00Z") + i * 900).toISOString()));
    const r = buscarRafagas(disparos);
    expect(r).toHaveLength(1);
    expect(r[0].veces).toBe(7);
  });

  // Lo que NO puede marcar: dos piezas distintas programadas para la misma hora.
  it("no marca dos corridas separadas por 23 segundos", () => {
    expect(buscarRafagas([
      d(3, "Werkalec", "2026-07-30T13:00:13Z"),
      d(3, "Werkalec", "2026-07-30T13:00:36Z"),
    ])).toHaveLength(0);
  });

  it("no marca corridas separadas por minutos", () => {
    expect(buscarRafagas([
      d(4, "Numorph", "2026-07-30T02:00:24Z"),
      d(4, "Numorph", "2026-07-30T02:02:57Z"),
    ])).toHaveLength(0);
  });

  it("una corrida sola nunca es ráfaga", () => {
    expect(buscarRafagas([d(5, "ikigai", "2026-08-28T16:00:13Z")])).toEqual([]);
  });

  it("no mezcla escenarios distintos aunque disparen juntos", () => {
    expect(buscarRafagas([
      d(6, "ikigai", "2026-08-28T16:00:13Z"),
      d(7, "AutoPoster", "2026-08-28T16:00:13Z"),
    ])).toHaveLength(0);
  });

  it("separa dos ráfagas del mismo escenario en días distintos", () => {
    const r = buscarRafagas([
      d(8, "MAERS", "2026-08-20T23:00:04.000Z"),
      d(8, "MAERS", "2026-08-20T23:00:04.100Z"),
      d(8, "MAERS", "2026-08-24T23:00:00.000Z"),
      d(8, "MAERS", "2026-08-24T23:00:00.100Z"),
    ]);
    expect(r).toHaveLength(2);
    expect(r[0].cuando.toISOString()).toContain("2026-08-24"); // más reciente primero
  });

  it("el umbral de ráfaga es de 5 segundos", () => {
    expect(RAFAGA_MS).toBe(5000);
  });
});

describe("buscarSolapes", () => {
  // Caso Ikigai: su escenario y el AutoPoster viejo publicando lo mismo.
  it("caza dos escenarios distintos disparando dentro del minuto", () => {
    const s = buscarSolapes([
      d(4688701, "ikigai", "2026-08-28T16:00:13Z"),
      d(1427144, "AutoPoster", "2026-08-28T16:00:16Z"),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].escenario).toBe("ikigai");
    expect(s[0].otro).toBe("AutoPoster"); // el id más viejo queda como "el otro"
    expect(s[0].separacionMs).toBe(3000);
  });

  it("ignora el mismo escenario consigo mismo", () => {
    expect(buscarSolapes([
      d(1, "MAERS", "2026-08-20T23:00:04.000Z"),
      d(1, "MAERS", "2026-08-20T23:00:04.100Z"),
    ])).toEqual([]);
  });

  it("no marca escenarios separados por más de un minuto", () => {
    expect(buscarSolapes([
      d(10, "Gala", "2026-08-28T15:00:00Z"),
      d(11, "BOERO", "2026-08-28T15:02:00Z"),
    ])).toEqual([]);
  });

  it("el umbral de solape es de 60 segundos", () => {
    expect(SOLAPE_MS).toBe(60000);
  });
});

describe("elQueSobra", () => {
  // Lo importante: no son 28 automatizaciones rotas, es UN escenario de más.
  it("señala el escenario que pisa a más clientes distintos", () => {
    const solapes = buscarSolapes([
      d(1427144, "AutoPoster", "2026-08-28T15:00:00Z"),
      d(3047238, "MAERS", "2026-08-28T15:00:02Z"),
      d(1427144, "AutoPoster", "2026-08-28T16:00:00Z"),
      d(4688701, "ikigai", "2026-08-28T16:00:03Z"),
      d(1427144, "AutoPoster", "2026-08-28T17:00:00Z"),
      d(3044090, "SERRAT", "2026-08-28T17:00:01Z"),
    ]);
    const ranking = elQueSobra(solapes);
    expect(ranking[0].escenario).toBe("AutoPoster");
    expect(ranking[0].aCuantos).toBe(3);
    expect(ranking[1].aCuantos).toBe(1);
  });

  it("sin solapes no señala a nadie", () => {
    expect(elQueSobra([])).toEqual([]);
  });
});

// La regla que estos protegen: el detector NO puede acusar a un cliente por
// publicar en hora redonda. Solo nombra a alguien cuando se despega del resto.
describe("sospechosoClaro", () => {
  const fila = (escenarioId: number, escenario: string, aCuantos: number) =>
    ({ escenarioId, escenario, pisa: aCuantos * 4, aCuantos });

  it("nombra al que se despega (datos reales: 28 contra 13)", () => {
    const r = sospechosoClaro([fila(1427144, "AutoPoster", 28), fila(1, "Imperia", 13), fila(2, "PKT", 12)]);
    expect(r?.escenario).toBe("AutoPoster");
  });

  it("NO nombra a nadie cuando el primero y el segundo están pegados", () => {
    // Es el escenario del día después de apagar el AutoPoster.
    expect(sospechosoClaro([fila(1, "Imperia", 13), fila(2, "PKT", 12), fila(3, "Numorph", 11)])).toBeNull();
  });

  it("no acusa con muestra chica aunque se despegue", () => {
    expect(sospechosoClaro([fila(1, "Werkalec", 4), fila(2, "SERRAT", 1)])).toBeNull();
  });

  it("sin ranking no hay sospechoso", () => {
    expect(sospechosoClaro([])).toBeNull();
  });

  it("un solo escenario con muchos socios y nadie más sí cuenta", () => {
    expect(sospechosoClaro([fila(1427144, "AutoPoster", 28)])?.escenario).toBe("AutoPoster");
  });
});
