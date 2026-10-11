// LMTM-OS: lo que gasta cada generación de contenido. Ver migración
// 0156_contenido_gastos.sql.

import { pgTable, uuid, text, timestamp, numeric, index } from "drizzle-orm/pg-core";

export const contenidoGastos = pgTable(
  "contenido_gastos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    clientId: uuid("client_id"),
    /** La pieza: id de la tarea de ClickUp, o `libre:<uuid>` si no salió de una tarea. */
    pieza: text("pieza"),
    /** clickup (etiqueta) | panel | claude */
    origen: text("origen").notNull(),
    /** higgsfield_plan | higgsfield_api | magnific */
    herramienta: text("herramienta").notNull(),
    modelo: text("modelo"),
    /** video | imagen */
    tipo: text("tipo").notNull(),
    /** null = la herramienta no informó el costo. */
    creditos: numeric("creditos", { mode: "number" }),
    usd: numeric("usd", { mode: "number" }),
    url: text("url"),
    jobId: text("job_id"),
  },
  (t) => ({
    fechaIdx: index("contenido_gastos_fecha_idx").on(t.createdAt),
    piezaIdx: index("contenido_gastos_pieza_idx").on(t.pieza),
  }),
);
