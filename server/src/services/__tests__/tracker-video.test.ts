import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { clienteDeTracker, filasDeXlsx, leerZip, mesDeTracker, resumenDeTracker } from "../tracker-video.js";
import { gastoDelMes, margenEstimado } from "../cuenta.js";
import { campoYOpcionAprobado, paraAprobar, type RedesCalendarItem } from "../clickup-sync.js";

/** Un zip mínimo (deflate), como lo escribe Excel: encabezado local + directorio central + fin. */
function zip(archivos: Record<string, string>): Buffer {
  const locales: Buffer[] = [];
  const central: Buffer[] = [];
  let pos = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const n = Buffer.from(nombre);
    const crudo = Buffer.from(contenido);
    const comp = deflateRawSync(crudo);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(crudo.length, 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(crudo.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42);
    locales.push(local, n, comp);
    central.push(c, n);
    pos += 30 + n.length + comp.length;
  }
  const dir = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(Object.keys(archivos).length, 8); fin.writeUInt16LE(Object.keys(archivos).length, 10);
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(pos, 16);
  return Buffer.concat([...locales, dir, fin]);
}

// Como guarda Excel: textos en sharedStrings (t="s"), números sueltos y fórmulas con su valor ya calculado.
const TRACKER = zip({
  "xl/workbook.xml": `<workbook><sheets><sheet name="Skygarden" sheetId="2" r:id="rId2"/><sheet name="Resumen" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="worksheets/sheet2.xml"/></Relationships>`,
  "xl/sharedStrings.xml": `<sst><si><t>TRACKER DE VIDEOS — RESUMEN GENERAL</t></si><si><t>Cliente</t></si><si><t>Videos enc.</t></si><si><t>Entregados</t></si><si><r><t>Cosa </t></r><r><t>Prop</t></r></si><si><t>Dunod</t></si><si><t>TOTALES</t></si><si><t>P&amp;G</t></si></sst>`,
  "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c></row>
    <row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c><c r="C3" t="s"><v>3</v></c></row>
    <row r="4"><c r="A4" t="s"><v>4</v></c><c r="B4"><v>4</v></c><c r="C4"><f>COUNTIF('Cosa Prop'!E:E,"Entregado")</f><v>0</v></c></row>
    <row r="5"><c r="A5" t="s"><v>5</v></c><c r="B5"><v>8</v></c><c r="C5"><f>X</f><v>4</v></c><c r="E5" t="inlineStr"><is><t>nota</t></is></c></row>
    <row r="6"><c r="A6" t="s"><v>7</v></c><c r="B6"/><c r="C6"><v>2</v></c></row>
    <row r="7"><c r="A7" t="s"><v>6</v></c><c r="B7"><v>12</v></c><c r="C7"><v>4</v></c></row>
  </sheetData></worksheet>`,
  "xl/worksheets/sheet2.xml": `<worksheet><sheetData><row r="1"><c r="A1"><v>99</v></c></row></sheetData></worksheet>`,
});

describe("tracker de video (.xlsx)", () => {
  it("abre el zip y encuentra la hoja Resumen aunque no sea la primera", () => {
    expect([...leerZip(TRACKER).keys()]).toContain("xl/sharedStrings.xml");
    const filas = filasDeXlsx(TRACKER, /resumen/i);
    expect(filas[0][0]).toBe("TRACKER DE VIDEOS — RESUMEN GENERAL");
    expect(filas[2]).toEqual(["Cosa Prop", "4", "0"]);
    expect(filas[3]).toEqual(["Dunod", "8", "4", "", "nota"]);
    expect(filas[4][0]).toBe("P&G");
  });
  it("saca encargados y entregados hasta TOTALES; una celda vacía cuenta 0", () => {
    expect(resumenDeTracker(filasDeXlsx(TRACKER, /resumen/i))).toEqual([
      { cliente: "Cosa Prop", encargados: 4, entregados: 0 },
      { cliente: "Dunod", encargados: 8, entregados: 4 },
      { cliente: "P&G", encargados: 0, entregados: 2 },
    ]);
  });
  it("si la hoja cambió de forma no inventa", () => {
    expect(resumenDeTracker([["Cliente", "Otra cosa"], ["Dunod", "8"]])).toEqual([]);
    expect(() => leerZip(Buffer.from("no soy un zip"))).toThrow();
  });
  it("el mes sale del nombre y el año de cuándo se creó", () => {
    expect(mesDeTracker("TRACKER_NOVIEMBRE.xlsx", "2026-11-03T13:22:57Z")).toBe("2026-11");
    expect(mesDeTracker("TRACKER_MARZO_OK.xlsx", "2026-03-03T12:00:00Z")).toBe("2026-03");
    expect(mesDeTracker("TRACKER_ENERO.xlsx", "2026-12-29T12:00:00Z")).toBe("2027-01");
    expect(mesDeTracker("TRACKER_DICIEMBRE.xlsx", "2027-01-02T12:00:00Z")).toBe("2026-12");
    expect(mesDeTracker("Ranking_clientes_mas_a_menos.xlsx", "2026-11-05T00:00:00Z")).toBeNull();
  });
  it("empareja los nombres cortos del tracker y ante dos candidatos no elige", () => {
    const lista = ["COSA PROPIEDADES", "MA PROPIEDADES", "MA DESARROLLOS", "El Hiper de la Pelu", "SEBASTIAN RAMASCO PADILLA", "LMTM", "LMTM Latam", "Agencia LMTM", "DUNOD"].map((name) => ({ name }));
    expect(clienteDeTracker("Cosa Prop", lista)?.name).toBe("COSA PROPIEDADES");
    expect(clienteDeTracker("MA Pro", lista)?.name).toBe("MA PROPIEDADES");
    expect(clienteDeTracker("MA Des", lista)?.name).toBe("MA DESARROLLOS");
    expect(clienteDeTracker("Hiper", lista)?.name).toBe("El Hiper de la Pelu");
    expect(clienteDeTracker("Ramasco", lista)?.name).toBe("SEBASTIAN RAMASCO PADILLA");
    expect(clienteDeTracker("LMTM", lista)?.name).toBe("LMTM");
    expect(clienteDeTracker("De mas", lista)).toBeNull();
    expect(clienteDeTracker("Propiedades", lista)).toBeNull();
  });
});

describe("margen estimado", () => {
  const f = (iso: string) => new Date(iso);
  it("el fijo mensual pesa todos los meses desde que empezó; el anual, un doceavo; el suelto, solo su mes", () => {
    expect(gastoDelMes({ amountCents: 120000, recurrence: "monthly", occurredAt: f("2026-03-10T00:00:00Z") }, "2026-10")).toBe(1200);
    expect(gastoDelMes({ amountCents: 120000, recurrence: "monthly", occurredAt: f("2026-11-02T00:00:00Z") }, "2026-10")).toBe(0);
    expect(gastoDelMes({ amountCents: 120000, recurrence: "yearly", occurredAt: f("2026-01-10T00:00:00Z") }, "2026-10")).toBe(100);
    expect(gastoDelMes({ amountCents: 120000, recurrence: "one_time", occurredAt: f("2026-10-31T23:00:00Z") }, "2026-10")).toBe(1200);
    expect(gastoDelMes({ amountCents: 120000, recurrence: "one_time", occurredAt: f("2026-09-30T23:00:00Z") }, "2026-10")).toBe(0);
  });
  it("reparte los gastos generales según las piezas vendidas", () => {
    expect(margenEstimado({ mes: "2026-10", abono: 500000, directos: 20000, generales: 1000000, piezas: 20, piezasTotal: 200, otrasMonedas: 1 }))
      .toEqual({ mes: "2026-10", abono: 500000, directos: 20000, imputado: 100000, participacionPct: 10, margen: 380000, otrasMonedas: 1 });
  });
  it("sin abono o sin gastos cargados no da un número", () => {
    expect(margenEstimado({ mes: "2026-10", abono: 0, directos: 1, generales: 1, piezas: 1, piezasTotal: 1, otrasMonedas: 0 })).toHaveProperty("motivo");
    expect(margenEstimado({ mes: "2026-10", abono: 500000, directos: 0, generales: 0, piezas: 1, piezasTotal: 1, otrasMonedas: 0 })).toHaveProperty("motivo");
  });
});

describe("aprobación del cliente desde su link", () => {
  const item = (x: Partial<RedesCalendarItem>): RedesCalendarItem => ({
    id: "1", name: "Post", status: "x", published: false, sentToMake: false, date: "2026-11-25T12:00:00.000Z", networks: ["Instagram"], format: "Reel",
    objective: null, url: null, readyToPublish: false, copyLargo: 4, copy: "hola", aprobacion: null, missing: ["aprobación", "pieza"], ...x,
  } as RedesCalendarItem);
  it("muestra lo que falta aprobar y no lo aprobado ni lo que ya salió", () => {
    const r = paraAprobar([item({ id: "a" }), item({ id: "b", aprobacion: "APROBADO" }), item({ id: "c", published: true }), item({ id: "d", aprobacion: "PENDIENTE" })]);
    expect(r.map((p) => p.id)).toEqual(["a", "d"]);
    expect(r[0]).toMatchObject({ nombre: "Post", copy: "hola", redes: ["Instagram"], formato: "Reel", falta: ["pieza"] });
  });
  it("escribe SOLO en «Aprobación de cliente» y con la opción APROBADO", () => {
    const campos = [
      { id: "f0", name: "Aprobación interna", type_config: { options: [{ id: "x", name: "APROBADO" }] } },
      { id: "f1", name: "Aprobación de cliente", type_config: { options: [{ id: "o0", name: "PENDIENTE" }, { id: "o1", name: "NO APROBADO" }, { id: "o2", name: "APROBADO" }] } },
    ];
    expect(campoYOpcionAprobado(campos)).toEqual({ campoId: "f1", opcionId: "o2" });
    expect(campoYOpcionAprobado([campos[0]])).toBeNull();
    expect(campoYOpcionAprobado([{ id: "f1", name: "Aprobación de cliente", type_config: { options: [{ id: "o1", name: "NO APROBADO" }] } }])).toBeNull();
  });
});
