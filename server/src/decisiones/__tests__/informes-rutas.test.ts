// Lo que este test protege: quién escribe y quién publica un informe. Lo
// escribe un agente (o una persona) de la empresa del cliente; lo publica
// solo una persona del tablero; sin sesión no se ve nada.
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const informes = vi.hoisted(() => ({
  guardarInforme: vi.fn(),
  listarInformes: vi.fn(),
  obtenerInforme: vi.fn(),
  publicarInforme: vi.fn(),
  retirarInforme: vi.fn(),
  generarBorradores: vi.fn(),
  borradorDe: vi.fn(),
  otrosClientes: vi.fn(),
}));
const store = vi.hoisted(() => ({ empresaParaAcceso: vi.fn() }));

vi.mock("../informes-store.js", () => informes);
vi.mock("../store.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../store.js")>();
  return { ...real, ...store };
});

async function app(actor: Record<string, unknown>) {
  const [{ errorHandler }, { informesRoutes }] = await Promise.all([import("../../middleware/index.js"), import("../informes-rutas.js")]);
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  a.use("/api", informesRoutes({} as any));
  a.use(errorHandler);
  return a;
}

const tablero = { type: "board", userId: "u1", companyIds: ["co1"], source: "session", isInstanceAdmin: false };
const agente = { type: "agent", agentId: "ag1", companyId: "co1", source: "api_key" };
const clientId = "6f1d1b2e-1c7a-4b8e-9a51-0c2d3e4f5a6b";

const numeros = { desde: "2026-09-28", hasta: "2026-10-04", inversion: 1, leads: 1, cpl: 1, calificados: null, costoPorCalificado: null, ventas: null, costoPorVenta: null, objetivo: null, objetivoFuente: null, anterior: { inversion: null, leads: null, cpl: null }, leadsDudosos: false };
const idInforme = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const informe = { id: idInforme, clientId, semana: "2026-09-28", narrativa: { resumen: "El lead costó {cpl}.", hicimos: [], aprendimos: [], proximos: ["x"], pedidos: [] }, numeros, estado: "aprobado", auditoria: { ok: true, fallas: [] } };

beforeEach(() => {
  vi.clearAllMocks();
  store.empresaParaAcceso.mockResolvedValue("co1");
  informes.guardarInforme.mockResolvedValue({ informe, creado: true });
  informes.obtenerInforme.mockResolvedValue(informe);
  informes.publicarInforme.mockResolvedValue({ ...informe, estado: "publicado" });
  informes.listarInformes.mockResolvedValue([informe]);
});

describe("/api/informes", () => {
  it("sin sesión no se ve nada", async () => {
    expect((await request(await app({ type: "none" })).get(`/api/informes?clientId=${clientId}`)).status).toBe(401);
  });

  it("el agente escribe para un cliente de su empresa y recibe la auditoría para corregir", async () => {
    const r = await request(await app(agente)).post("/api/informes").send({ clientId, narrativa: informe.narrativa });
    expect(r.status).toBe(201);
    expect(r.body.auditoria).toEqual({ ok: true, fallas: [] });
    expect(informes.guardarInforme).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ clientId }), "agente:ag1", expect.anything());
    // La respuesta trae el texto ya completado: lo que leería el cliente.
    expect(r.body.informe.texto.resumen).toBe("El lead costó $1.");
  });

  it("un agente de otra empresa no escribe", async () => {
    store.empresaParaAcceso.mockResolvedValue("otra");
    const r = await request(await app(agente)).post("/api/informes").send({ clientId, narrativa: informe.narrativa });
    expect(r.status).toBe(403);
    expect(informes.guardarInforme).not.toHaveBeenCalled();
  });

  it("publicar es solo del tablero: un agente no le manda nada al cliente", async () => {
    expect((await request(await app(agente)).post(`/api/informes/${idInforme}/publicar`)).status).toBe(403);
    expect(informes.publicarInforme).not.toHaveBeenCalled();
    // Un id que no es uuid es un 400, no un error del servidor.
    expect((await request(await app(tablero)).post("/api/informes/i1/publicar")).status).toBe(400);
    const r = await request(await app(tablero)).post(`/api/informes/${idInforme}/publicar`);
    expect(r.status).toBe(200);
    expect(r.body.informe.estado).toBe("publicado");
  });

  it("el ensayo del borrador no guarda nada", async () => {
    informes.borradorDe.mockResolvedValue({ narrativa: informe.narrativa, numeros });
    informes.otrosClientes.mockResolvedValue([]);
    const r = await request(await app(tablero)).get(`/api/informes/borrador/ensayo?clientId=${clientId}`);
    expect(r.status).toBe(200);
    expect(r.body.auditoria.ok).toBe(true);
    expect(informes.guardarInforme).not.toHaveBeenCalled();
  });
});
