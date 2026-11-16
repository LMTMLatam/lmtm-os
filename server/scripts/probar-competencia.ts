// Prueba de solo lectura: la revisión de competencia de un cliente con datos reales.
// npx tsx scripts/probar-competencia.ts brachetta maers
import { createDb } from "@paperclipai/db";
import { resolverCliente } from "../src/services/cerebro.js";
import { competenciaDeCliente } from "../src/services/competencia-cliente.js";

const db = createDb(process.env.DATABASE_URL_RO!);
for (const q of process.argv.slice(2)) {
  const c = await resolverCliente(db, q);
  if ("error" in c) { console.log(q, c.error); continue; }
  const r = await competenciaDeCliente(db, c.id, Number(process.env.DIAS ?? 14));
  console.log(`\n=== ${r.clienteNombre}: ${r.cliente.publicaciones} publicaciones propias desde ${r.desde} (${r.cliente.angulos.map((a) => `${a.nombre} ${a.n}`).join(", ") || "sin ángulo"})`);
  for (const x of r.competidores.slice(0, 8)) console.log(`  ${x.nombre} @${x.usuario ?? "-"}: ${x.publicaciones} pub · normal ${x.normal ?? "s/d"} · mejor ${x.mejor ? `${x.mejor.indice ?? "s/d"}× ${x.mejor.angulo ?? ""} ${x.mejor.link ?? ""}` : "-"}`);
  console.log("  oportunidades:", r.oportunidades.map((o) => `${o.nombre} (${o.competidores} comp, ${o.indiceMediano}×)`).join("; ") || "ninguna");
  console.log("  sin datos:", r.sinDatos.length, r.sinDatos.slice(0, 6).join(", "));
}
process.exit(0);
