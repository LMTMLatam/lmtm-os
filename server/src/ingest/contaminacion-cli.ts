// Escaneo de contaminación entre clientes. Solo lectura.
//
//   DATABASE_URL_RO=... npx tsx src/ingest/contaminacion-cli.ts [horas]   (por defecto 24)
//
// Nunca imprime la URL.

import { createDb } from "@paperclipai/db";
import { escanearContaminacion, resumenContaminacion } from "./contaminacion.js";

const url = process.env.DATABASE_URL_RO || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_RO (o DATABASE_URL).");
  process.exit(1);
}
const horas = Number(process.argv[2] ?? 24);
const hallazgos = await escanearContaminacion(createDb(url), new Date(Date.now() - horas * 3600_000));
console.log(resumenContaminacion(hallazgos) ?? `Sin contaminación en las últimas ${horas} h.`);
for (const h of hallazgos.slice(0, 20)) console.log(`- ${h.tabla} · ${h.cliente} → ${h.mencionados.join(", ")} · ${h.extracto}`);
process.exit(0);
