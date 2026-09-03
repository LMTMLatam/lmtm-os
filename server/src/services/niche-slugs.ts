// Normalización de slugs de nicho/rubro.
//
// El matching tendencia↔cliente era EXACTO contra `clients.industry`, así que
// cualquier tag libre de los agentes ("retail", "hoteleria") no matcheaba a
// ningún cliente y las tendencias etiquetadas [] (universales) aparecían en
// TODOS los paneles — el panel de cada cliente terminaba mostrando solo ruido
// genérico de IA/marketing. Este módulo centraliza alias + matching laxo.

const ALIASES: Record<string, string> = {
  hoteleria: "turismo-hoteleria",
  hotel: "turismo-hoteleria",
  hoteles: "turismo-hoteleria",
  turismo: "turismo-hoteleria",
  retail: "retail-consumo",
  consumo: "retail-consumo",
  inmobiliario: "inmobiliaria",
  inmobiliarias: "inmobiliaria",
  "real-estate": "inmobiliaria",
  automotriz: "automotor-autopartes",
  autopartes: "automotor-autopartes",
  automotor: "automotor-autopartes",
  construccion: "construccion-materiales",
  materiales: "construccion-materiales",
  marketing: "agencia-marketing",
  agencia: "agencia-marketing",
  eventos: "entretenimiento-eventos",
  entretenimiento: "entretenimiento-eventos",
  finanzas: "finanzas-servicios",
  "servicios-financieros": "finanzas-servicios",
  b2b: "industria-b2b",
  industria: "industria-b2b",
  desarrolladora: "desarrollador",
  loteo: "loteos",
};

export function normalizeNicheSlug(raw: string): string {
  const s = raw.trim().toLowerCase();
  return ALIASES[s] ?? s;
}

/**
 * Canonicaliza una lista de nichos contra los rubros reales de los clientes
 * (lowercase). "transversal" se descarta (equivale a universal). Devuelve los
 * reconocidos (canónicos) y los desconocidos por separado para que el caller
 * pueda rechazar con un mensaje útil.
 */
export function canonicalizeNiches(raws: string[], canonical: string[]): { ok: string[]; unknown: string[] } {
  const canon = canonical.map((c) => c.toLowerCase());
  const ok: string[] = [];
  const unknown: string[] = [];
  for (const raw of raws) {
    const s = normalizeNicheSlug(raw);
    if (!s || s === "transversal" || s === "general") continue;
    const hit = canon.find((c) => c === s) ?? canon.find((c) => c.includes(s) || s.includes(c));
    if (hit) {
      if (!ok.includes(hit)) ok.push(hit);
    } else if (!unknown.includes(raw)) {
      unknown.push(raw);
    }
  }
  return { ok, unknown };
}

/** Matching laxo tendencia↔rubro del cliente. niches=[] es universal (matchea todo). */
export function trendMatchesIndustry(trendNiches: string[] | null | undefined, industry: string | null | undefined): boolean {
  const list = trendNiches ?? [];
  if (list.length === 0) return true;
  if (!industry) return false;
  const ind = normalizeNicheSlug(industry);
  return list.some((n) => {
    const s = normalizeNicheSlug(n);
    return s === ind || ind.includes(s) || s.includes(ind);
  });
}
