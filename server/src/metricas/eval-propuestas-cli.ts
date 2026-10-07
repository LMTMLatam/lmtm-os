// Evaluador del piloto en sombra. Solo lectura.
//
//   DATABASE_URL_RO=... npx tsx src/metricas/eval-propuestas-cli.ts            corrige las propuestas de pauta de los últimos 14 días
//   DATABASE_URL_RO=... npx tsx src/metricas/eval-propuestas-cli.ts --referencia "<cliente>"   qué pausaría el playbook hoy
//
// Nunca imprime la URL. La lógica vive en eval-recientes.ts (la usa también la pantalla Agentes).

import { createDb } from "@paperclipai/db";
import { sql } from "drizzle-orm";
import { evaluarPropuesta } from "./eval-propuestas.js";
import { contextoEval, evaluarRecientes, notaPorAgente, ventanaEval } from "./eval-recientes.js";

const url = process.env.DATABASE_URL_RO || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_RO (o DATABASE_URL).");
  process.exit(1);
}
const db = createDb(url);
const filas = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<string, unknown>[];

const ayer = new Date(Date.now() - 86_400_000);

const iRef = process.argv.indexOf("--referencia");
if (iRef > 0) {
  const nombre = process.argv[iRef + 1];
  const r = filas(await db.execute(sql`select id from clients where trim(name) = ${nombre} limit 1`));
  if (!r[0]) {
    console.error(`No encontré el cliente "${nombre}".`);
    process.exit(1);
  }
  const { ctx, campanas } = await contextoEval(db, String(r[0].id), ayer);
  console.log(`${nombre} · objetivo meta ${ctx.tcpl.meta ?? "-"} / google ${ctx.tcpl.google ?? "-"} · ${ventanaEval(ayer).desde} a ${ventanaEval(ayer).hasta}`);
  for (const c of campanas) {
    const pausa = evaluarPropuesta({ accion: "pause", entityType: "campaign", entityId: c.campaignId }, campanas, ctx);
    if (pausa.ok) console.log(`  PAUSAR  ${c.plataforma} ${c.campaignId} "${c.nombre}" gasto ${Math.round(c.inversion)} leads ${c.leads} cpl ${c.cpl == null ? "-" : Math.round(c.cpl)}`);
    else if (c.inversion > 0) console.log(`  dejar   ${c.plataforma} "${c.nombre}": ${pausa.fallas[0]}`);
    for (const a of c.conjuntos) {
      const p = evaluarPropuesta({ accion: "pause", entityType: "adset", entityId: a.adsetId }, campanas, ctx);
      if (p.ok && !pausa.ok) console.log(`  PAUSAR  conjunto ${a.adsetId} "${a.nombre}" (de "${c.nombre}") gasto ${Math.round(a.inversion)} leads ${a.leads} cpl ${a.cpl == null ? "-" : Math.round(a.cpl)}`);
    }
  }
  process.exit(0);
}

const evaluadas = await evaluarRecientes(db, 14);
if (evaluadas.length === 0) console.log("Sin propuestas de pauta en los últimos 14 días.");
for (const e of evaluadas) {
  console.log(`${e.ok ? "OK   " : "FALLA"} ${String(e.agente)} · ${e.estado} · ${e.resumen}${e.ok ? "" : `\n        ${e.fallas.join("\n        ")}`}`);
}
if (evaluadas.length) {
  console.log(`\n${evaluadas.filter((e) => e.ok).length}/${evaluadas.length} defendibles.`);
  for (const n of notaPorAgente(evaluadas)) console.log(`  ${n.agente}: ${n.defendibles}/${n.propuestas}`);
}
process.exit(0);
