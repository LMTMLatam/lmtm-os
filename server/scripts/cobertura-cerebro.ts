// Cobertura del cerebro por cliente activo, con la conexión de SOLO LECTURA.
import { createDb } from "@paperclipai/db";
import { sql } from "drizzle-orm";
import { cobertura } from "../src/services/cerebro.js";

const db = createDb(process.env.DATABASE_URL_RO!);
const r = (await db.execute(sql`
  select c.name, c.website_url, c.metadata, b.tono, b.logo_url, b.colores, b.publico, b.diferencial,
    (select count(*) from client_products p where p.client_id = c.id and p.active) productos,
    (select count(*) from competitors x where x.client_id = c.id) competidores,
    (select count(*) from ads_account_mappings m where m.client_id = c.id) mapeos,
    (select count(*) from client_memory m where m.client_id = c.id) memoria
  from clients c left join client_brand b on b.client_id = c.id where c.status = 'active' order by c.name`)) as unknown as Array<Record<string, unknown>>;
const lista = r.map((x) => {
  const meta = (x.metadata ?? {}) as Record<string, unknown>;
  return { cliente: String(x.name).trim(), ...cobertura({
    tono: !!x.tono, logo: !!x.logo_url, colores: Array.isArray(x.colores) && x.colores.length > 0, publico: !!x.publico, diferencial: !!x.diferencial,
    web: !!x.website_url || (Array.isArray(meta.webs) && meta.webs.length > 0), productos: Number(x.productos), competidores: Number(x.competidores),
    nas: Array.isArray(meta.nas) && meta.nas.length > 0, pauta: Number(x.mapeos) > 0, memoria: Number(x.memoria) }) };
});
const prom = Math.round(lista.reduce((t, x) => t + x.porcentaje, 0) / lista.length);
console.log("clientes", lista.length, "promedio", prom, "% | 100%:", lista.filter((x) => x.porcentaje === 100).length);
const faltas: Record<string, number> = {};
for (const x of lista) for (const f of x.falta) faltas[f] = (faltas[f] ?? 0) + 1;
console.log("lo que más falta:", JSON.stringify(Object.entries(faltas).sort((a, b) => b[1] - a[1])));
for (const x of lista.filter((x) => x.porcentaje < 80).sort((a, b) => a.porcentaje - b.porcentaje)) console.log(` ${x.porcentaje}% ${x.cliente}: ${x.falta.join(", ")}`);
process.exit(0);
