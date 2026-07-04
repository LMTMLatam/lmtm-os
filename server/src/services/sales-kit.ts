// LMTM-OS: per-niche sales kit generator.
//
// Turns the agency's own operational data into a commercial asset: for a niche
// where LMTM already has clients, build a one-pager the sales team can use to
// pitch a NEW prospect in the same vertical — grounded in real benchmarks
// (avg vs best-quartile CTR/CPL the agency actually delivers), the winning
// content format, and the count of clients already served in that niche.
// Proof, not promises.

import type { Db } from "@paperclipai/db";
import { clients, learnings, adsInsights } from "@paperclipai/db";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { aiNarrative } from "./agency-ops.js";

export interface SalesKit {
  niche: string;
  clientCount: number;
  benchmark: { avgCtr?: number; idealCtr?: number; avgCpl?: number | null; idealCpl?: number | null } | null;
  winningFormat: string | null;
  onePager: string; // markdown
}

export async function generateSalesKit(db: Db, niche: string): Promise<SalesKit | null> {
  const nicheKey = niche.trim().toLowerCase();
  const members = await db.select({ id: clients.id, name: clients.name })
    .from(clients).where(and(eq(clients.status, "active"), eq(clients.industry, nicheKey)));
  if (members.length === 0) return null;

  const [bench] = await db.select().from(learnings).where(and(eq(learnings.scope, "niche_benchmark"), eq(learnings.scopeKey, nicheKey))).limit(1);
  const [fmt] = await db.select().from(learnings).where(and(eq(learnings.scope, "niche"), eq(learnings.scopeKey, nicheKey))).limit(1);
  const benchmark = (bench?.evidence ?? null) as SalesKit["benchmark"];
  const winningFormat = ((fmt?.evidence ?? null) as { topFormat?: string } | null)?.topFormat ?? null;

  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [agg] = await db.select({
    leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
    spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric,0)`,
  }).from(adsInsights).innerJoin(clients, eq(adsInsights.clientId, clients.id))
    .where(and(gte(adsInsights.date, since30), eq(clients.status, "active"), isNotNull(clients.industry), eq(clients.industry, nicheKey)));

  const system = [
    "Sos el estratega comercial de LMTM, agencia de marketing latinoamericana.",
    "Armás un one-pager de venta para prospectar a un cliente NUEVO de un rubro donde LMTM ya trabaja.",
    "Usá SOLO los datos reales que te paso (benchmarks, formato ganador, cantidad de clientes del rubro). NO inventes cifras, casos ni nombres.",
    "Tono: seguro y concreto, sin humo. Es prueba, no promesa: 'esto es lo que ya logramos en tu rubro'.",
    "Estructura en markdown: título, 1 párrafo de posicionamiento, sección 'Lo que logramos en [rubro]' con los números reales, sección 'Cómo lo hacemos' (formato ganador + enfoque), y un CTA de cierre. Máximo ~250 palabras.",
    "Español rioplatense.",
  ].join("\n");
  const facts = [
    `Rubro: ${nicheKey}`,
    `Clientes que LMTM ya atiende en este rubro: ${members.length}`,
    benchmark?.avgCtr != null ? `CTR promedio del rubro: ${(benchmark.avgCtr * 100).toFixed(2)}% — mejor cuartil (nuestro techo probado): ${((benchmark.idealCtr ?? benchmark.avgCtr) * 100).toFixed(2)}%` : "CTR: sin benchmark suficiente",
    benchmark?.avgCpl != null ? `CPL promedio del rubro: $${Math.round(benchmark.avgCpl)} — mejor cuartil: $${Math.round(benchmark.idealCpl ?? benchmark.avgCpl)}` : "CPL: sin benchmark suficiente",
    `Leads generados en el rubro (últimos 30 días): ${Number(agg?.leads ?? 0)}`,
    winningFormat ? `Formato de contenido que mejor rinde en el rubro: ${winningFormat}` : "",
  ].filter(Boolean).join("\n");

  const onePager = (await aiNarrative(system, facts).catch(() => null))
    ?? `# LMTM para ${nicheKey}\n\nYa trabajamos con ${members.length} clientes del rubro.\n\n${facts}`;

  return { niche: nicheKey, clientCount: members.length, benchmark, winningFormat, onePager };
}
