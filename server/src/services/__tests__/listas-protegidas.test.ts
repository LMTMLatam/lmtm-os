import { describe, expect, it, vi } from "vitest";
import { motivoListaProtegida } from "../planillas-protegidas.js";

// Cerrar la escritura en las planillas dejaba abierta una puerta al mismo
// lugar: `clickup_create_task` aceptaba cualquier listId. Una tarea creada
// directo en la lista de Redes de un cliente no está en la planilla Cronopost
// —la fuente de verdad— y el despachador igual la ve.

/** Un `db` mínimo con la forma que usa el guard: select().from().where(). */
function dbCon(filas: Array<{ id: string | null }>) {
  return {
    select: () => ({ from: () => ({ where: async () => filas }) }),
  } as never;
}

function dbQueFalla() {
  return {
    select: () => ({ from: () => ({ where: async () => { throw new Error("pool caído"); } }) }),
  } as never;
}

const LISTA_REDES = "901234567";

describe("motivoListaProtegida", () => {
  it("bloquea la lista de Redes de un cliente y dice dónde se carga", async () => {
    const motivo = await motivoListaProtegida(dbCon([{ id: LISTA_REDES }]), LISTA_REDES);
    expect(motivo).toMatch(/DESACTIVADO/);
    expect(motivo).toMatch(/planilla/i);
  });

  it("no toca ninguna otra lista: el trabajo interno sigue igual", async () => {
    expect(await motivoListaProtegida(dbCon([{ id: LISTA_REDES }]), "111000111")).toBeNull();
  });

  it("si no puede comprobar de quién es la lista, BLOQUEA", async () => {
    // No ver no es lo mismo que estar bien. Misma regla que las planillas.
    //
    // Módulo fresco a propósito: el guard cachea las listas un minuto, así que
    // con caché caliente una caída de DB NO bloquea — sirve el set que ya
    // conocía, que es lo correcto y está escrito en el módulo. Lo que se prueba
    // acá es el arranque en frío, donde no hay nada que servir.
    vi.resetModules();
    const { motivoListaProtegida: fresco } = await import("../planillas-protegidas.js");
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const motivo = await fresco(dbQueFalla(), LISTA_REDES);
    expect(motivo).toMatch(/no se pudo verificar/i);
    aviso.mockRestore();
  });

  it("con caché caliente una caída de DB sigue bloqueando lo que ya sabía", async () => {
    // Al revés del anterior: lo peligroso sería que una caída de DB ABRIERA la
    // puerta. Servir el último set conocido la deja cerrada.
    vi.resetModules();
    const { motivoListaProtegida: fresco } = await import("../planillas-protegidas.js");
    await fresco(dbCon([{ id: LISTA_REDES }]), LISTA_REDES); // calienta el caché
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await fresco(dbQueFalla(), LISTA_REDES)).toMatch(/DESACTIVADO/);
    aviso.mockRestore();
  });

  it("un listId vacío lo resuelve el handler, no este guard", async () => {
    expect(await motivoListaProtegida(dbCon([{ id: LISTA_REDES }]), "")).toBeNull();
  });

  it("ignora filas sin lista cargada en vez de bloquear todo", async () => {
    expect(await motivoListaProtegida(dbCon([{ id: null }, { id: "  " }]), "111000111")).toBeNull();
  });
});
