// Lo que este test protege: quién puede hacer qué con una decisión, y que el
// botón de ejecutar quede en ENSAYO salvo que la persona lo confirme. Una
// prueba, un script o un agente que llame a /ejecutar sin `confirmar: true`
// no mueve plata.
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  listarDecisiones: vi.fn(),
  crearDesdeAgente: vi.fn(),
  aprobar: vi.fn(),
  descartar: vi.fn(),
  ejecutar: vi.fn(),
  marcarHecha: vi.fn(),
  obtenerDecision: vi.fn(),
  empresaParaAcceso: vi.fn(),
}));
const motor = vi.hoisted(() => ({ correrMotor: vi.fn(), ensayarMotor: vi.fn() }));

vi.mock("../store.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../store.js")>();
  return { ...real, ...store };
});
vi.mock("../motor.js", () => motor);

async function app(actor: Record<string, unknown>) {
  const [{ errorHandler }, { decisionesRoutes }] = await Promise.all([import("../../middleware/index.js"), import("../rutas.js")]);
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  a.use("/api", decisionesRoutes({} as any));
  a.use(errorHandler);
  return a;
}

const tablero = { type: "board", userId: "u1", companyIds: ["co1"], source: "session", isInstanceAdmin: false };
const agente = { type: "agent", agentId: "ag1", companyId: "co1", source: "api_key" };

const propuesta = {
  clientId: "6f1d1b2e-1c7a-4b8e-9a51-0c2d3e4f5a6b",
  tipo: "pauta:fatiga",
  que: "Reemplazar el anuncio «Llantas 4x4»",
  porque: { resumen: "Frecuencia 4,6.", datos: [{ etiqueta: "Frecuencia", valor: 4.6, unidad: "veces" }] },
  arsPorDia: null,
  responsable: "equipo",
  accion: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  store.ejecutar.mockResolvedValue({ decision: { id: "d1" }, resultado: { ok: true, ensayo: true, detalle: "Ensayo OK", at: "" } });
  store.crearDesdeAgente.mockResolvedValue({ decision: { id: "d1" }, creada: true });
  store.obtenerDecision.mockResolvedValue({ id: "d1", clientId: "6f1d1b2e-1c7a-4b8e-9a51-0c2d3e4f5a6b" });
  store.empresaParaAcceso.mockResolvedValue("co1");
  store.listarDecisiones.mockResolvedValue([]);
});

describe("/api/decisiones", () => {
  it("sin sesión no se ve nada: la lista tiene clientes y plata", async () => {
    const r = await request(await app({ type: "none" })).get("/api/decisiones");
    expect(r.status).toBe(401);
  });

  it("ejecutar sin confirmar es ENSAYO", async () => {
    const r = await request(await app(tablero)).post("/api/decisiones/d1/ejecutar").send({});
    expect(r.status).toBe(200);
    expect(store.ejecutar).toHaveBeenCalledWith(expect.anything(), "d1", expect.anything(), { ensayo: true });
  });

  it("ejecutar de verdad pide confirmar: true literal", async () => {
    await request(await app(tablero)).post("/api/decisiones/d1/ejecutar").send({ confirmar: "true" });
    expect(store.ejecutar).toHaveBeenLastCalledWith(expect.anything(), "d1", expect.anything(), { ensayo: true });
    await request(await app(tablero)).post("/api/decisiones/d1/ejecutar").send({ confirmar: true });
    expect(store.ejecutar).toHaveBeenLastCalledWith(expect.anything(), "d1", expect.anything(), { ensayo: false });
  });

  it("un agente no aprueba, no ejecuta ni corre el motor", async () => {
    const a = await app(agente);
    expect((await request(a).post("/api/decisiones/d1/aprobar")).status).toBe(403);
    expect((await request(a).post("/api/decisiones/d1/ejecutar").send({ confirmar: true })).status).toBe(403);
    expect((await request(a).post("/api/decisiones/motor")).status).toBe(403);
    expect(store.ejecutar).not.toHaveBeenCalled();
    expect(motor.correrMotor).not.toHaveBeenCalled();
  });

  it("POST /decisiones es de los agentes; el tablero no inventa decisiones por esta vía", async () => {
    expect((await request(await app(tablero)).post("/api/decisiones").send(propuesta)).status).toBe(403);
    const r = await request(await app(agente)).post("/api/decisiones").send(propuesta);
    expect(r.status).toBe(201);
    expect(store.crearDesdeAgente).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ clientId: propuesta.clientId }), expect.objectContaining({ agentId: "ag1", companyId: "co1" }));
  });

  it("un agente lee las decisiones de UN cliente de su empresa, nunca la cartera entera", async () => {
    const a = await app(agente);
    expect((await request(a).get("/api/decisiones")).status).toBe(400);
    expect((await request(a).get(`/api/decisiones?clientId=${propuesta.clientId}`)).status).toBe(200);
    store.empresaParaAcceso.mockResolvedValueOnce("otra-empresa");
    expect((await request(a).get(`/api/decisiones?clientId=${propuesta.clientId}`)).status).toBe(403);
  });

  it("el tablero solo mueve decisiones de clientes de su empresa", async () => {
    store.empresaParaAcceso.mockResolvedValueOnce("otra-empresa");
    const r = await request(await app(tablero)).post("/api/decisiones/d1/aprobar");
    expect(r.status).toBe(403);
    expect(store.aprobar).not.toHaveBeenCalled();
  });

  it("una propuesta incompleta rebota con el motivo, para que el agente se corrija", async () => {
    const r = await request(await app(agente)).post("/api/decisiones").send({ ...propuesta, porque: { resumen: "x", datos: [] } });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain("al menos un número");
    expect(store.crearDesdeAgente).not.toHaveBeenCalled();
  });
});
