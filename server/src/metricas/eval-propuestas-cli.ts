// Evaluador del piloto en sombra. Solo lectura.
//
//   DATABASE_URL_RO=... npx tsx src/metricas/eval-propuestas-cli.ts            corrige las propuestas de pauta de los últimos 14 días
//   DATABASE_URL_RO=... npx tsx src/metricas/eval-propuestas-cli.ts --referencia "<cliente>"   qué pausaría el playbook hoy
//
// Nunca imprime la URL.

import { createDb } from "@paperclipai/db";
import { sql } from "drizzle-orm";
import { metricasCliente } from "./index.js";
import { metricasCampanas, type MetricasCampana } from "./campanas.js";
import { evaluarPropuesta, type ContextoEval } from "./eval-propuestas.js";
import { esAccionPauta } from "../services/ads-propuestas.js";
import { esTerminoDeMarca } from "../services/ads-keywords.js";

const url = process.env.DATABASE_URL_RO || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_RO (o DATABASE_URL).");
  process.exit(1);
}
const db = createDb(url);
const filas = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<string, unknown>[];

const ayer = new Date(Date.now() - 86_400_000);
const ventana = (hastaDate: Date) => ({
  desde: new Date(hastaDate.getTime() - 13 * 86_400_000).toISOString().slice(0, 10),
  hasta: hastaDate.toISOString().slice(0, 10),
});

async function contexto(clientId: string, hastaDate: Date): Promise<{ ctx: ContextoEval; campanas: MetricasCampana[] }> {
  const v = ventana(hastaDate);
  const [meta, google, campanas, cli] = await Promise.all([
    metricasCliente(db, clientId, { ...v, plataforma: "meta" }),
    metricasCliente(db, clientId, { ...v, plataforma: "google" }),
    metricasCampanas(db, clientId, v),
    db.execute(sql`select name from clients where id = ${clientId}`),
  ]);
  const nombre = String(filas(cli)[0]?.name ?? "");
  return {
    ctx: {
      tcpl: { meta: meta.objetivo.tcpl, google: google.objetivo.tcpl },
      esMarca: (n) => /\b(brand|marca)\b/i.test(n) || esTerminoDeMarca(nombre, n),
    },
    campanas: campanas ?? [],
  };
}

const iRef = process.argv.indexOf("--referencia");
if (iRef > 0) {
  const nombre = process.argv[iRef + 1];
  const r = filas(await db.execute(sql`select id from clients where trim(name) = ${nombre} limit 1`));
  if (!r[0]) {
    console.error(`No encontré el cliente "${nombre}".`);
    process.exit(1);
  }
  const { ctx, campanas } = await contexto(String(r[0].id), ayer);
  console.log(`${nombre} · objetivo meta ${ctx.tcpl.meta ?? "-"} / google ${ctx.tcpl.google ?? "-"} · ${ventana(ayer).desde} a ${ventana(ayer).hasta}`);
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

const props = filas(await db.execute(sql`
  select a.id, a.status, a.created_at, a.payload, ag.name as agente
  from approvals a left join agents ag on ag.id = a.requested_by_agent_id
  where a.type = 'accion_pauta' and a.created_at > now() - interval '14 days'
  order by a.created_at`));
if (props.length === 0) console.log("Sin propuestas de pauta en los últimos 14 días.");
let buenas = 0;
for (const p of props) {
  if (!esAccionPauta(p.payload)) continue;
  const creada = new Date(String(p.created_at));
  const { ctx, campanas } = await contexto(p.payload.clientId, new Date(creada.getTime() - 86_400_000));
  const v = evaluarPropuesta(p.payload.accion, campanas, ctx);
  if (v.ok) buenas++;
  console.log(`${v.ok ? "OK   " : "FALLA"} ${String(p.agente)} · ${p.status} · ${p.payload.resumen}${v.ok ? "" : `\n        ${v.fallas.join("\n        ")}`}`);
}
if (props.length) console.log(`\n${buenas}/${props.length} defendibles.`);
process.exit(0);
