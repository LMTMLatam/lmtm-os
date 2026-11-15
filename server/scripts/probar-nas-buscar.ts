// Prueba buscarEnNas contra la base con SOLO LECTURA. npx tsx scripts/probar-nas-buscar.ts "<palabras>" [tipo]
import { createDb } from "@paperclipai/db";
import { buscarEnNas } from "../src/services/nas-indice.js";

const db = createDb(process.env.DATABASE_URL_RO!);
const t = Date.now();
const r = await buscarEnNas(db, { q: process.argv[2] ?? "drone", tipo: (process.argv[3] as never) ?? null, limite: 6 });
console.log(Date.now() - t, "ms | total", r.total, "| índices", r.indices.length);
for (const a of r.resultados) console.log(" ", a.cliente, "|", a.ruta, "|", a.tipo, a.mb, a.fecha);
process.exit(0);
