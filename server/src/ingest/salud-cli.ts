// Imprime la salud de las fuentes. Solo lectura.
//
//   DATABASE_URL_RO=... npx tsx src/ingest/salud-cli.ts            (resumen + lo que no está ok)
//   DATABASE_URL_RO=... npx tsx src/ingest/salud-cli.ts --todo     (todas las filas)
//
// Usa DATABASE_URL_RO (rol de solo lectura) y, si no está, DATABASE_URL.
// Nunca imprime la URL.

import { createDb } from "@paperclipai/db";
import { saludFuentes, type EstadoFuente } from "./salud.js";

const url = process.env.DATABASE_URL_RO || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_RO (o DATABASE_URL).");
  process.exit(1);
}

const db = createDb(url);
const filas = await saludFuentes(db);

const orden: EstadoFuente[] = ["fallando", "atrasada", "sin_conexion", "sin_entrega", "ok"];
const resumen = new Map<string, number>();
for (const f of filas) resumen.set(`${f.fuente}|${f.estado}`, (resumen.get(`${f.fuente}|${f.estado}`) ?? 0) + 1);

console.log(`\nSalud de fuentes: ${new Set(filas.map((f) => f.clientId)).size} clientes activos\n`);
console.log(["fuente".padEnd(12), ...orden.map((e) => e.padStart(13))].join(""));
for (const fuente of ["meta_ads", "google_ads", "organico"]) {
  console.log([fuente.padEnd(12), ...orden.map((e) => String(resumen.get(`${fuente}|${e}`) ?? 0).padStart(13))].join(""));
}

const todo = process.argv.includes("--todo");
const mostrar = filas
  .filter((f) => todo || (f.estado !== "ok" && f.estado !== "sin_conexion"))
  .sort((a, b) => orden.indexOf(a.estado) - orden.indexOf(b.estado) || a.cliente.localeCompare(b.cliente));
console.log("");
for (const f of mostrar) console.log(`${f.estado.padEnd(12)} ${f.fuente.padEnd(11)} ${f.cliente.padEnd(28)} ${f.detalle}`);
process.exit(0);
