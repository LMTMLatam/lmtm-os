// Contenido → «En marcha» (rediseño 20/11): los pedidos al Productor y al Editor juntos, por estado.

export interface PedidoAgente { id: string; identifier: string | null; titulo: string; estado: string; creado: string; actualizado: string }
export type Origen = "Producción" | "Edición";

export const COLUMNAS: Array<{ titulo: string; estados: string[]; alerta?: boolean }> = [
  { titulo: "En cola", estados: ["backlog", "todo"] },
  { titulo: "Produciendo", estados: ["in_progress"] },
  { titulo: "Para revisar", estados: ["in_review"] },
  { titulo: "Frenados", estados: ["blocked"], alerta: true },
];

/** Puro. Reparte los pedidos de los dos agentes en las columnas; lo listo y lo cancelado no están en marcha. */
export function columnasEnMarcha(produccion: PedidoAgente[], edicion: PedidoAgente[]) {
  const todos = [
    ...produccion.map((p) => ({ ...p, origen: "Producción" as Origen })),
    ...edicion.map((p) => ({ ...p, origen: "Edición" as Origen })),
  ].sort((a, b) => b.actualizado.localeCompare(a.actualizado));
  return COLUMNAS.map((c) => ({ ...c, pedidos: todos.filter((p) => c.estados.includes(p.estado)) }));
}
