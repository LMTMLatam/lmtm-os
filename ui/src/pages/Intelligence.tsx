import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { clientsApi, type Client } from "../api/clients";
import { intelCenterApi, type Intervention } from "../api/intel-center";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Encabezado } from "../app/Shell";
import { Brain, Gauge, Lightbulb, MessageSquareWarning, BarChart3, RefreshCw, ExternalLink, FileText, ShieldAlert, HeartPulse, Check, X } from "lucide-react";

function scoreColor(v: number): string {
  if (v >= 70) return "text-l-bien-texto";
  if (v >= 40) return "text-l-atencion-texto";
  return "text-l-critico-texto";
}

const LEVEL_STYLE: Record<number, string> = {
  5: "bg-l-critico-suave text-l-critico-texto",
  4: "bg-l-atencion/10 text-l-atencion-texto",
  3: "bg-l-marca/10 text-l-marca",
  2: "bg-l-papel text-l-tinta-3",
  1: "bg-l-papel text-l-tinta-3",
};
const LEVEL_LABEL: Record<number, string> = { 5: "crítico", 4: "atención", 3: "seguimiento", 2: "dashboard", 1: "historial" };

/** Centro de Inteligencia: intervenciones de los vigilantes + salud /100 de
 *  cada cliente. WhatsApp = interrupción, esto = conocimiento. */
function CentroDeInteligencia() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const iq = useQuery({ queryKey: ["intel-center", "interventions"], queryFn: () => intelCenterApi.interventions(), refetchInterval: 5 * 60_000 });
  const sq = useQuery({ queryKey: ["intel-center", "salud"], queryFn: () => intelCenterApi.saludClientes(), staleTime: 10 * 60_000 });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "resolved" | "dismissed" }) => intelCenterApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intel-center"] }),
  });
  const items: Intervention[] = iq.data?.interventions ?? [];
  const salud = (sq.data?.clientes ?? []).filter((c) => c.salud?.score != null);
  const sinMedir = (sq.data?.clientes ?? []).filter((c) => c.salud != null && c.salud.score == null);

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-l-critico-texto" />
          <h2 className="font-semibold">Vigilantes — intervenciones abiertas</h2>
          <Badge className="text-[10px] px-1.5 py-0 bg-l-papel">{items.length}</Badge>
          <span className="text-[11px] text-muted-foreground ml-auto">nivel 5 y 4 también llegan por WhatsApp (máx. 8/día, agrupado)</span>
        </div>
        {items.length === 0 && <div className="text-sm text-muted-foreground">Sin intervenciones abiertas — todo en orden. Los vigilantes (financiera, contenido, salud de cliente) corren a diario.</div>}
        <div className="space-y-1.5">
          {items.map((it) => (
            <div key={it.id} className="rounded-md border border-border p-2.5">
              <div className="flex items-center gap-2 text-sm">
                <Badge className={`text-[9px] px-1.5 py-0 shrink-0 ${LEVEL_STYLE[it.level] ?? ""}`}>{LEVEL_LABEL[it.level] ?? it.level}</Badge>
                <Badge className="text-[9px] px-1.5 py-0 shrink-0 bg-l-marca/10 text-l-marca">{it.vigilante}</Badge>
                <button className="text-left flex-1 truncate hover:underline" onClick={() => setExpanded(expanded === it.id ? null : it.id)}>{it.title}</button>
                <button title="Resuelto" className="p-1 rounded hover:bg-l-bien/10 text-l-bien-texto" onClick={() => setStatus.mutate({ id: it.id, status: "resolved" })}><Check className="h-3.5 w-3.5" /></button>
                <button title="Descartar" className="p-1 rounded hover:bg-l-critico-suave text-l-critico-texto" onClick={() => setStatus.mutate({ id: it.id, status: "dismissed" })}><X className="h-3.5 w-3.5" /></button>
              </div>
              {/* Solo el nivel 5 se abre entero: son ~10 y son las urgentes.
                  Probé abrir también el 4 y quedaban 120 tarjetas expandidas,
                  una pared de texto peor que el problema original (18/8).
                  El 4 muestra la primera línea, que ya dice de qué se trata. */}
              {it.body && (expanded === it.id || it.level >= 5) ? (
                <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">{it.body}</pre>
              ) : it.body ? (
                <p className="mt-1 text-xs text-muted-foreground truncate">{it.body.split("\n").find((l) => l.trim()) ?? ""}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-l-critico-texto" />
          <h2 className="font-semibold">Salud de clientes</h2>
          <span className="text-[11px] text-muted-foreground ml-auto">índice /100: pauta 40% + operativa 30% + contenido 30%, solo con lo que se pudo medir — los peores primero</span>
        </div>
        {salud.length === 0 && <div className="text-sm text-muted-foreground">Todavía sin índice — el vigilante lo estampa en su próxima corrida diaria.</div>}
        <div className="grid md:grid-cols-2 gap-1.5">
          {salud.map((c) => (
            <div key={c.id} className="flex items-start gap-2 text-xs rounded-md border border-border p-2">
              <span className={`font-bold text-sm w-10 shrink-0 ${scoreColor(c.salud!.score!)}`}>{c.salud!.score}</span>
              <div className="min-w-0">
                <Link to={`/clientes/${c.slug}`} className="font-medium hover:underline">{c.name}</Link>
                {c.salud!.medido && c.salud!.medido.length < 3 && <div className="text-muted-foreground">medido: {c.salud!.medido.join(", ")}</div>}
                {(c.salud!.razones?.length ?? 0) > 0 && (
                  <div className="text-muted-foreground truncate" title={c.salud!.razones!.join("; ")}>{c.salud!.razones!.join("; ")}</div>
                )}
              </div>
            </div>
          ))}
        </div>
        {sinMedir.length > 0 && (
          <p className="text-[11px] text-muted-foreground">Sin nada para medir (ni pauta corriendo, ni cuenta leída, ni calendario con fechas): {sinMedir.map((c) => c.name).join(", ")}.</p>
        )}
      </Card>
    </div>
  );
}

export function Intelligence() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const qc = useQueryClient();
  const [slug, setSlug] = useState<string>("");

  useEffect(() => { setBreadcrumbs([{ label: "Inteligencia" }]); }, [setBreadcrumbs]);

  const clientsQuery = useQuery({ queryKey: ["clients", "list", "active"], queryFn: () => clientsApi.list("active") });
  const clients: Client[] = clientsQuery.data?.clients ?? [];
  useEffect(() => { if (!slug && clients[0]) setSlug(clients[0].slug); }, [clients, slug]);

  const intelQuery = useQuery({
    queryKey: ["intel", slug],
    queryFn: () => clientsApi.intel(slug),
    enabled: !!slug,
  });
  const intel = intelQuery.data;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["intel", slug] });
  const mScore = useMutation({ mutationFn: () => clientsApi.runScore(slug), onSuccess: invalidate });
  const mBrain = useMutation({ mutationFn: () => clientsApi.refreshBrain(slug), onSuccess: invalidate });
  const mOpps = useMutation({ mutationFn: () => clientsApi.runOpportunities(slug), onSuccess: invalidate });
  const mContent = useMutation({ mutationFn: () => clientsApi.rebuildContent(slug), onSuccess: invalidate });
  const busy = mScore.isPending || mBrain.isPending || mOpps.isPending || mContent.isPending;

  return (
    <>
    <Encabezado titulo="Inteligencia" bajada="Lo que dejan los vigilantes: alertas, salud de cada cliente y oportunidades. WhatsApp interrumpe solo lo crítico; esto es para entender la agencia." />
    <div className="max-w-[1000px] space-y-6 px-4 pb-10 md:px-8">

      <CentroDeInteligencia />

      <div className="flex items-end justify-between flex-wrap gap-3 pt-2 border-t border-border">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Inteligencia por cliente</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Memoria viva, scores, oportunidades y feedback del cliente seleccionado.
          </p>
        </div>
        <select value={slug} onChange={(e) => setSlug(e.target.value)} className="h-9 px-3 rounded-md border border-border bg-background text-sm min-w-[200px]">
          {clients.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => mScore.mutate()} disabled={busy || !slug} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" />Recalcular score</button>
        <button onClick={() => mBrain.mutate()} disabled={busy || !slug} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"><Brain className="h-3.5 w-3.5" />Refrescar memoria</button>
        <button onClick={() => mOpps.mutate()} disabled={busy || !slug} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5" />Generar oportunidades</button>
        <button onClick={() => mContent.mutate()} disabled={busy || !slug} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Reconstruir contenido</button>
      </div>

      {intelQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {intel && (
        <>
          {/* Scores */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><Gauge className="h-4 w-4" /><h2 className="font-medium">Scores</h2></div>
            {intel.score ? (
              <div className="flex gap-8">
                <div><p className="text-xs text-muted-foreground">Salud de cuenta</p>{intel.score.healthScore != null ? <p className={`text-3xl font-semibold ${scoreColor(intel.score.healthScore)}`}>{intel.score.healthScore}</p> : <p className="text-sm text-muted-foreground">sin pauta corriendo</p>}</div>
                <div><p className="text-xs text-muted-foreground">Operativo</p>{intel.score.opsScore != null ? <p className={`text-3xl font-semibold ${scoreColor(intel.score.opsScore)}`}>{intel.score.opsScore}</p> : <p className="text-sm text-muted-foreground">sin fechas en ClickUp</p>}</div>
                <div className="flex-1 text-xs text-muted-foreground self-center">
                  {Object.entries(intel.score.components).map(([k, v]) => <span key={k} className="inline-block mr-3">{k}: {String(v)}</span>)}
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Sin score aún. Tocá "Recalcular score".</p>}
          </Card>

          {/* Opportunities */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><Lightbulb className="h-4 w-4" /><h2 className="font-medium">Oportunidades</h2></div>
            {intel.opportunities.length === 0 ? <p className="text-sm text-muted-foreground">Sin oportunidades. Tocá "Generar oportunidades".</p> : (
              <div className="space-y-2">
                {intel.opportunities.map((o) => (
                  <div key={o.id} className="border-l-2 border-l-marca pl-3 py-1">
                    <div className="flex items-center gap-2"><Badge className="text-[10px] px-1.5 py-0 bg-l-marca/10 text-l-marca">{o.kind}</Badge><span className="text-sm font-medium">{o.title}</span><span className="text-[10px] text-muted-foreground ml-auto">prioridad {o.priority}</span></div>
                    {o.suggestedAction && <p className="text-xs text-muted-foreground mt-0.5">{o.suggestedAction}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Customer Brain */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2"><Brain className="h-4 w-4" /><h2 className="font-medium">Customer Brain</h2></div>
              {intel.client.enfoqueTecnicoUrl && (
                <a href={intel.client.enfoqueTecnicoUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-l-marca hover:text-l-marca transition-colors">
                  <FileText className="h-3.5 w-3.5" />Enfoque Técnico<ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">Sincronizado con el Enfoque Técnico de ClickUp al cargar.</p>
            {intel.brain.length === 0 ? <p className="text-sm text-muted-foreground">Memoria vacía. Completá el Enfoque Técnico en ClickUp o tocá "Refrescar memoria".</p> : (
              <div className="space-y-1.5">
                {/* Enfoque Técnico pinned entry — shown first and highlighted */}
                {(() => {
                  const enfoqueEntry = intel.brain.find(m => m.key === "enfoque-tecnico");
                  const rest = intel.brain.filter(m => m.key !== "enfoque-tecnico").slice(0, 18);
                  return (
                    <>
                      {enfoqueEntry && (
                        <div className="rounded-md border border-l-marca/30 bg-l-marca/5 p-3 mb-2">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <FileText className="h-3.5 w-3.5 text-l-marca" />
                            <span className="text-xs font-medium text-l-marca">Enfoque Técnico</span>
                            {intel.client.enfoqueTecnicoUrl && (
                              <a href={intel.client.enfoqueTecnicoUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-l-marca hover:text-l-marca"><ExternalLink className="h-3 w-3" /></a>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            {enfoqueEntry.content.length > 600 ? enfoqueEntry.content.slice(0, 600) + "…" : enfoqueEntry.content}
                          </p>
                        </div>
                      )}
                      {rest.map((m) => (
                        <div key={m.id} className="text-sm flex gap-2">
                          <Badge className="text-[10px] px-1.5 py-0 bg-l-papel text-l-tinta-3 shrink-0 self-start">{m.kind}</Badge>
                          <span className="text-muted-foreground whitespace-pre-wrap">{m.content.slice(0, 280)}</span>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
            )}
          </Card>

          {/* Feedback */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><MessageSquareWarning className="h-4 w-4" /><h2 className="font-medium">Feedback</h2></div>
            {intel.feedback.length === 0 ? <p className="text-sm text-muted-foreground">Sin feedback capturado.</p> : (
              <div className="space-y-1.5">
                {intel.feedback.slice(0, 15).map((f) => (
                  <div key={f.id} className="text-sm flex gap-2">
                    <Badge className={`text-[10px] px-1.5 py-0 shrink-0 self-start ${f.sentiment === "negative" ? "bg-l-critico-suave text-l-critico-texto" : f.sentiment === "positive" ? "bg-l-bien/10 text-l-bien-texto" : "bg-l-papel text-l-tinta-3"}`}>{f.classification}</Badge>
                    <span className="text-muted-foreground">{f.rawText.slice(0, 200)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Top content (knowledge graph) */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><BarChart3 className="h-4 w-4" /><h2 className="font-medium">Mejor contenido</h2></div>
            {intel.topContent.length === 0 ? <p className="text-sm text-muted-foreground">Sin datos de contenido. Tocá "Reconstruir contenido".</p> : (
              <div className="space-y-1">
                {intel.topContent.map((c) => (
                  <div key={c.id} className="text-sm flex items-center gap-2">
                    <Badge className="text-[10px] px-1.5 py-0 bg-l-papel text-l-tinta-3 shrink-0">{c.format ?? c.source}</Badge>
                    <span className="truncate">{c.title ?? "(sin título)"}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">score {Math.round(Number(c.score ?? 0))}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
    </>
  );
}
