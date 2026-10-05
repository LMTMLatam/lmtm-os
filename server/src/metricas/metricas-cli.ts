// Imprime las métricas de un cliente y el chequeo de consistencia. Solo lectura.
//
//   DATABASE_URL_RO=... npx tsx src/metricas/metricas-cli.ts "<nombre del cliente>" 2026-08-31 2026-09-29 [meta|google]
//   DATABASE_URL_RO=... npx tsx src/metricas/metricas-cli.ts "<nombre del cliente>" <desde> <hasta> --campanas
//   DATABASE_URL_RO=... npx tsx src/metricas/metricas-cli.ts --consistencia
//
// Nunca imprime la URL.

import { createDb } from "@paperclipai/db";
import { sql } from "drizzle-orm";
import { metricasCliente } from "./index.js";
import { chequeoConsistencia } from "./consistencia.js";
import { metricasCampanas } from "./campanas.js";

const url = process.env.DATABASE_URL_RO || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_RO (o DATABASE_URL).");
  process.exit(1);
}
const db = createDb(url);

if (process.argv.includes("--consistencia")) {
  console.log(await chequeoConsistencia(db));
  process.exit(0);
}

const [nombre, desde, hasta, plataforma] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!nombre || !desde || !hasta) {
  console.error('Uso: metricas-cli.ts "<cliente>" <desde> <hasta> [meta|google]');
  process.exit(1);
}
const r = await db.execute(sql`select id from clients where trim(name) = ${nombre} limit 1`);
const id = ((Array.isArray(r) ? r : (r as { rows: { id: string }[] }).rows)[0] as { id?: string } | undefined)?.id;
if (!id) {
  console.error(`No encontré el cliente "${nombre}".`);
  process.exit(1);
}
const ventana = { desde, hasta, plataforma: plataforma as "meta" | "google" | undefined };
const m = process.argv.includes("--campanas")
  ? await metricasCampanas(db, id, ventana)
  : await metricasCliente(db, id, ventana);
console.log(JSON.stringify(m, null, 2));
process.exit(0);
