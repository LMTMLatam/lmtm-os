// Prueba el cerebro contra la base con la conexión de SOLO LECTURA (DATABASE_URL_RO).
// npx tsx scripts/probar-cerebro.ts "<cliente>"
import { createDb } from "@paperclipai/db";
import { actividad, cliente, empresa, resolverCliente } from "../src/services/cerebro.js";

const url = process.env.DATABASE_URL_RO;
if (!url) throw new Error("falta DATABASE_URL_RO");
const db = createDb(url);
const t0 = Date.now();
const e = await empresa(db);
console.log("EMPRESA", Date.now() - t0, "ms | agentes", e.agentes.length, "| rutinas", e.rutinas.length, "| lecciones", e.leccionesDelEquipo.length, "| clientes", JSON.stringify(e.clientes));
const t1 = Date.now();
const a = await actividad(db, { dias: 7 });
console.log("ACTIVIDAD 7d", Date.now() - t1, "ms |", JSON.stringify(a.resumen), "| ej:", JSON.stringify(a.hechos.slice(0, 3)));
const r = await resolverCliente(db, process.argv[2] ?? "brachetta");
if ("error" in r) { console.log(r); process.exit(0); }
const t2 = Date.now();
const c = await cliente(db, r.id);
const txt = JSON.stringify(c);
console.log("CLIENTE", r.name, Date.now() - t2, "ms |", txt.length, "chars | cobertura", JSON.stringify(c?.cobertura));
console.log(" marca:", JSON.stringify(c?.marca)?.slice(0, 300));
console.log(" productos", c?.productos.total, "| memoria", c?.memoria.length, "omitida", c?.memoriaOmitida, "| veredictos", c?.loQueDijoElEquipoDePiezas.length);
console.log(" pauta:", JSON.stringify(c?.redesYPauta.ultimos30Dias), "| cuentas", c?.redesYPauta.cuentas.length);
console.log(" actividad14:", JSON.stringify(c?.actividadReciente.resumen));
process.exit(0);
