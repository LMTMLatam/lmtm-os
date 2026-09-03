// El coalescing existe para que agent_wakeup_requests vuelva a servir para
// diagnosticar: si se guarda una fila por cada "no hay nada que hacer", los
// eventos reales quedan enterrados entre 19.000 no-eventos diarios.
import { describe, expect, it } from "vitest";
import { esRutinario, registrarSkip, type EjecutorDb } from "../wakeup-skip-log.js";

/** Db falso: registra qué se hizo sin tocar la base. */
function dbFalso(previo: { id: string; coalescedCount: number | null } | null) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const db = {
    insert: () => ({ values: async (v: unknown) => { inserts.push(v); } }),
    update: () => ({ set: (v: unknown) => ({ where: async () => { updates.push(v); } }) }),
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: async () => (previo ? [previo] : []) }) }),
      }),
    }),
  } as unknown as EjecutorDb;
  return { db, inserts, updates };
}

const base = { companyId: "c1", agentId: "a1", source: "timer", reason: "heartbeat.idle.noWork" };

describe("esRutinario", () => {
  it("agrupa los dos motivos de alto volumen", () => {
    expect(esRutinario("heartbeat.idle.noWork")).toBe(true);
    expect(esRutinario("issue_dependencies_blocked")).toBe(true);
  });
  it("no agrupa lo que uno quiere ver caso por caso", () => {
    expect(esRutinario("budget.blocked")).toBe(false);
    expect(esRutinario("issue_tree_hold_active")).toBe(false);
  });
});

describe("registrarSkip", () => {
  it("escribe la primera del período", async () => {
    const { db, inserts, updates } = dbFalso(null);
    expect(await registrarSkip(db, base)).toBe("insert");
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(0);
    expect((inserts[0] as { coalescedCount: number }).coalescedCount).toBe(1);
  });

  it("suma a la de la hora en curso en vez de escribir otra", async () => {
    const { db, inserts, updates } = dbFalso({ id: "w1", coalescedCount: 7 });
    expect(await registrarSkip(db, base)).toBe("coalesce");
    expect(inserts).toHaveLength(0);
    expect((updates[0] as { coalescedCount: number }).coalescedCount).toBe(8);
  });

  it("cuenta bien aunque la fila previa no tenga contador", async () => {
    const { db, updates } = dbFalso({ id: "w1", coalescedCount: null });
    await registrarSkip(db, base);
    expect((updates[0] as { coalescedCount: number }).coalescedCount).toBe(2);
  });

  it("un motivo NO rutinario siempre escribe su propia fila", async () => {
    const { db, inserts, updates } = dbFalso({ id: "w1", coalescedCount: 3 });
    expect(await registrarSkip(db, { ...base, reason: "budget.blocked" })).toBe("insert");
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(0);
  });

  it("deja el motivo y el estado que espera la retención", async () => {
    const { db, inserts } = dbFalso(null);
    await registrarSkip(db, base);
    const fila = inserts[0] as { status: string; reason: string; finishedAt: Date };
    expect(fila.status).toBe("skipped");
    expect(fila.reason).toBe("heartbeat.idle.noWork");
    expect(fila.finishedAt).toBeInstanceOf(Date);
  });
});
