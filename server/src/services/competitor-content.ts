// LMTM-OS: competitor-driven content generation.
//
// Takes a client's manually-curated competitors + its Enfoque Técnico + brain,
// asks the AI to produce content split into "pauta" (paid) and "posteo"
// (organic), and stores it for review/export. Degrades to a deterministic
// skeleton if the AI is unavailable (same philosophy as agency-ops).

import { randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { competitors, contentIdeas, clients } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { aiNarrative } from "./agency-ops.js";
import { getBrainContext } from "./customer-brain.js";
import { resolveCompanyId } from "./intel-common.js";

export interface GeneratedIdea { kind: "pauta" | "posteo"; format?: string; title: string; copy?: string; rationale?: string }

function parseIdeas(raw: string): GeneratedIdea[] {
  // The model is asked for a JSON array; be lenient about surrounding prose.
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const arr = JSON.parse(raw.slice(start, end + 1)) as Array<Record<string, unknown>>;
    const out: GeneratedIdea[] = [];
    for (const it of arr) {
      const kind = String(it.kind ?? "").toLowerCase() === "pauta" ? "pauta" : String(it.kind ?? "").toLowerCase() === "posteo" ? "posteo" : null;
      const title = typeof it.title === "string" ? it.title.trim() : "";
      if (!kind || !title) continue;
      out.push({
        kind,
        format: typeof it.format === "string" ? it.format : undefined,
        title,
        copy: typeof it.copy === "string" ? it.copy : undefined,
        rationale: typeof it.rationale === "string" ? it.rationale : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function generateContentPlan(db: Db, clientId: string): Promise<{ batchId: string; created: number; ideas: GeneratedIdea[] }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { batchId: "", created: 0, ideas: [] };
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { batchId: "", created: 0, ideas: [] };

  const comps = await db.select().from(competitors).where(eq(competitors.clientId, clientId));
  const brain = await getBrainContext(db, clientId, 2500).catch(() => "");

  const compBlock = comps.length
    ? comps.map((c) => {
        const ads = (c.sampleAds ?? []).map((a) => a.text || a.url).filter(Boolean).slice(0, 5).join(" | ");
        return `- ${c.name}${c.fbPageUrl ? ` (${c.fbPageUrl})` : ""}${c.notes ? ` — ${c.notes}` : ""}${ads ? `\n  Anuncios observados: ${ads}` : ""}`;
      }).join("\n")
    : "(sin competidores cargados)";

  const system = [
    "Sos estratega de contenido de LMTM, agencia de marketing latinoamericana.",
    "Generás ideas de contenido accionables para un cliente, separadas en dos tipos:",
    '- "pauta": contenido pago (anuncios) — hook, ángulo, oferta, CTA.',
    '- "posteo": contenido orgánico para redes — idea de post/reel, copy y formato.',
    "Tené en cuenta el Enfoque Técnico del cliente, su memoria, y qué hace la competencia (diferenciate, no copies).",
    "Español rioplatense, concreto. Nunca inventes datos de performance.",
    'Respondé SOLO con un array JSON: [{"kind":"pauta"|"posteo","format":"reel|carrusel|imagen|video|story|texto","title":"...","copy":"...","rationale":"por qué / en qué se diferencia de la competencia"}]',
    "Generá 5 ideas de pauta y 5 de posteo (10 en total).",
  ].join("\n");

  const user = [
    `Cliente: ${client.name}${client.industry ? ` — rubro: ${client.industry}` : ""}`,
    brain ? `\nContexto del cliente (Enfoque Técnico + memoria):\n${brain}` : "",
    `\nCompetencia:\n${compBlock}`,
  ].join("\n");

  let ideas: GeneratedIdea[] = [];
  const aiRaw = await aiNarrative(system, user).catch(() => null);
  if (aiRaw) ideas = parseIdeas(aiRaw);

  // Deterministic fallback so the feature always returns something usable.
  if (ideas.length === 0) {
    const base = client.name;
    ideas = [
      { kind: "pauta", format: "video", title: `Anuncio de oferta principal — ${base}`, copy: "Hook fuerte en los primeros 3s + propuesta de valor + CTA claro.", rationale: "Estructura base de pauta de conversión; completar con la oferta real del cliente." },
      { kind: "pauta", format: "carrusel", title: "Carrusel de diferenciadores vs competencia", copy: "3-5 placas con los diferenciales del cliente frente a los competidores cargados.", rationale: "Aprovecha lo que la competencia NO comunica." },
      { kind: "posteo", format: "reel", title: "Detrás de escena / proceso", copy: "Reel mostrando el día a día o el proceso del cliente.", rationale: "Orgánico de cercanía; suele tener buen alcance en el rubro." },
      { kind: "posteo", format: "carrusel", title: "Tips útiles del rubro", copy: "Carrusel educativo con 5 consejos del sector.", rationale: "Posiciona autoridad sin vender directo." },
    ];
  }

  const batchId = randomUUID();
  await db.insert(contentIdeas).values(ideas.map((i) => ({
    companyId, clientId, kind: i.kind, format: i.format ?? null, title: i.title,
    copy: i.copy ?? null, rationale: i.rationale ?? null, source: aiRaw ? "ai" : "fallback", batchId,
  })));

  return { batchId, created: ideas.length, ideas };
}
