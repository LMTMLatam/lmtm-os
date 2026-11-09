// Los logs de corrida se perdían en cada deploy (disco del contenedor). Al terminar la
// corrida se archivan comprimidos en el volumen, con retención y piso de espacio libre.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalFileRunLogStore, limpiarArchivo, RETENCION_LOGS_MS } from "../services/run-log-store.js";

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), "runlog-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function correr(store: ReturnType<typeof createLocalFileRunLogStore>) {
  const h = await store.begin({ companyId: "c", agentId: "a", runId: "r1" });
  for (let i = 0; i < 50; i++) await store.append(h, { stream: "stdout", chunk: `linea ${i}\n`, ts: "t" });
  return { h, fin: await store.finalize(h) };
}

describe("archivo de logs de corrida", () => {
  it("al terminar comprime al volumen, borra el original y se sigue leyendo igual (con offsets)", async () => {
    const base = tmp(), arch = tmp();
    const store = createLocalFileRunLogStore(base, { dir: arch, libreBytes: async () => 10 * 1024 ** 3 });
    const { h, fin } = await correr(store);
    expect(fin.compressed).toBe(true);
    expect(existsSync(path.join(base, h.logRef))).toBe(false);
    expect(existsSync(path.join(arch, h.logRef + ".gz"))).toBe(true);
    const todo = await store.read(h, { limitBytes: 1_000_000 });
    expect(todo.content.split("\n").filter(Boolean)).toHaveLength(50);
    const p1 = await store.read(h, { offset: 0, limitBytes: 100 });
    const p2 = await store.read(h, { offset: p1.nextOffset, limitBytes: 1_000_000 });
    expect(p1.content + p2.content).toBe(todo.content);
    expect(p2.nextOffset).toBeUndefined();
  });

  it("con poco espacio libre no archiva y el log queda donde estaba", async () => {
    const base = tmp(), arch = tmp();
    const store = createLocalFileRunLogStore(base, { dir: arch, libreBytes: async () => 100 * 1024 ** 2 });
    const { h, fin } = await correr(store);
    expect(fin.compressed).toBe(false);
    expect((await store.read(h)).content).toContain("linea 49");
  });

  it("borra solo los archivados más viejos que la retención", async () => {
    const base = tmp(), arch = tmp();
    const store = createLocalFileRunLogStore(base, { dir: arch, libreBytes: async () => 10 * 1024 ** 3 });
    const { h } = await correr(store);
    const gz = path.join(arch, h.logRef + ".gz");
    expect(await limpiarArchivo(arch)).toBe(0);
    const viejo = (Date.now() - RETENCION_LOGS_MS - 60_000) / 1000;
    utimesSync(gz, viejo, viejo);
    expect(await limpiarArchivo(arch)).toBe(1);
    expect(existsSync(gz)).toBe(false);
  });
});
